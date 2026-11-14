import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import select, or_

from ...core.config import settings
from ...core.security import create_access_token, get_password_hash
from ...core.database import get_db, get_system_db
from ...core.tenant_context import enter_tenant
from ..deps import get_current_user, User as DepUser
from ...models.tenant import Firm, User, UserRole, AuditBlock
from ...deterministic_core.otp_service import OTPService
from ...deterministic_core.audit_chain import append_audit_block

logger = logging.getLogger("ca_platform.auth")
router = APIRouter(prefix="/auth", tags=["Authentication & OTP"])

# -------------------------------------------------------------
# Pydantic Schemas
# -------------------------------------------------------------
class SendOTPRequest(BaseModel):
    identifier: str = Field(..., description="10-digit Indian Mobile number (+91) or Email address")
    channel: Optional[str] = Field(None, description="'SMS' or 'EMAIL' (auto-detected if omitted)")

class VerifyOTPRequest(BaseModel):
    identifier: str = Field(..., description="Phone number or email where OTP was sent")
    otp: str = Field(..., min_length=4, max_length=8, description="6-digit OTP passcode")

class FirebaseVerifyRequest(BaseModel):
    id_token: str = Field(..., description="Firebase Auth ID Token (JWT)")

class UserProfileResponse(BaseModel):
    id: str
    firm_id: str
    firm_name: Optional[str] = "Sharma & Associates, Chartered Accountants"
    email: str
    phone: Optional[str]
    full_name: str
    role: str
    membership_no: Optional[str] = None

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user: UserProfileResponse

# -------------------------------------------------------------
# Standard Demo Profiles
# -------------------------------------------------------------
DEMO_PERSONAS = [
    {
        "phone": "+919876543210",
        "email": "partner@cafirm.in",
        "full_name": "CA Amit Sharma, FCA",
        "role": UserRole.PARTNER.value,
        "membership_no": "ICAI-FCA-504912",
        "badge": "Managing Partner & Signatory"
    },
    {
        "phone": "+919876543211",
        "email": "manager@cafirm.in",
        "full_name": "Neha Gupta, ACA",
        "role": UserRole.SENIOR_MANAGER.value,
        "membership_no": "ICAI-ACA-612345",
        "badge": "Tax & Compliance Lead"
    },
    {
        "phone": "+919876543212",
        "email": "trainee@cafirm.in",
        "full_name": "Rohit Verma",
        "role": UserRole.ARTICLE_TRAINEE.value,
        "membership_no": None,
        "badge": "Senior Article Assistant"
    },
    {
        "phone": "+919876543213",
        "email": "client@rajeshfabrics.com",
        "full_name": "Rajesh Kumar",
        "role": UserRole.CLIENT_USER.value,
        "membership_no": None,
        "badge": "Client Director (Rajesh Fabrics)"
    }
]

# -------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------
def _require_builtin_otp() -> None:
    """With LOGIN_PROVIDER=firebase every login is a Firebase phone-OTP sign-in; the built-in OTP path is closed."""
    if settings.effective_login_provider == "firebase":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")


@router.get("/config")
def auth_config():
    """What the login screen needs to know before it renders. Public and contains no secrets."""
    provider = settings.effective_login_provider
    out = {"login_provider": provider, "firebase_enabled": provider == "firebase"}
    if provider == "firebase":
        out["firebase"] = {
            "apiKey": settings.FIREBASE_WEB_API_KEY,
            "authDomain": settings.FIREBASE_AUTH_DOMAIN or f"{settings.FIREBASE_PROJECT_ID}.firebaseapp.com",
            "projectId": settings.FIREBASE_PROJECT_ID,
            "appId": settings.FIREBASE_APP_ID,
        }
        out["firebase_web_ready"] = bool(settings.FIREBASE_WEB_API_KEY and settings.FIREBASE_APP_ID)
    return out


@router.post("/otp/send")
def send_otp(req: SendOTPRequest, db: Session = Depends(get_system_db)):
    """Request a 6-digit OTP via Fast2SMS / Twilio (SMS) or Resend / SMTP (Email).
    In sandbox mode, the OTP is returned in the response and printed to the server logs.
    """
    _require_builtin_otp()
    try:
        result = OTPService.generate_and_send_otp(
            db=db,
            identifier=req.identifier,
            channel=req.channel,
            purpose="LOGIN"
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error sending OTP: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to dispatch OTP. Please try again.")

@router.post("/otp/verify", response_model=AuthResponse)
def verify_otp(req: VerifyOTPRequest, request: Request, db: Session = Depends(get_system_db)):
    """Verifies the 6-digit OTP, loads or provisions the user profile, appends an
    ICAI SQC 1 cryptographic audit block, and issues a signed JWT session token.
    """
    _require_builtin_otp()
    try:
        norm_id, channel = OTPService.normalize_identifier(req.identifier)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Verify candidate OTP
    is_valid, message = OTPService.verify_otp(db, norm_id, req.otp)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=message)

    # Find existing user or check predefined personas
    query = select(User).where(
        or_(
            User.email == norm_id,
            User.phone == norm_id
        )
    )
    user = db.execute(query).scalars().first()
    if user is not None and not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is deactivated.")

    # If user doesn't exist, check default persona list or create default firm user
    if not user:
        # Demo personas carry elevated roles; they are honoured only in local development.
        matched_persona = next(
            (p for p in DEMO_PERSONAS if p["phone"] == norm_id or p["email"] == norm_id),
            None
        ) if settings.DEBUG else None

        # Get or create default Firm
        firm = db.execute(select(Firm).limit(1)).scalars().first()
        if not firm:
            firm = Firm(
                id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
                firm_code="sharma-associates",
                firm_name="Sharma & Associates, Chartered Accountants",
                frn="012345S",
                constitution="PARTNERSHIP",
                head_office_city="Hyderabad"
            )
            db.add(firm)
            db.flush()

        if matched_persona:
            user = User(
                firm_id=firm.id,
                email=matched_persona["email"],
                phone=matched_persona["phone"],
                full_name=matched_persona["full_name"],
                role=matched_persona["role"],
                membership_no=matched_persona["membership_no"],
                hashed_password=get_password_hash("OTP_SECURE_AUTH"),
                is_active=True,
                mfa_enabled=True
            )
        else:
            is_email = "@" in norm_id
            user = User(
                firm_id=firm.id,
                email=norm_id if is_email else f"{norm_id.replace('+', '')}@client.in",
                phone=norm_id if not is_email else "+919876543210",
                full_name="Client Portal User" if not is_email else norm_id.split("@")[0].title(),
                role=UserRole.CLIENT_USER.value,  # Security hardening: default new unverified callers to lowest privilege (CLIENT_USER)
                membership_no=None,              # Never assign synthetic ICAI credentials to untrusted registrations
                hashed_password=get_password_hash("OTP_SECURE_AUTH"),
                is_active=True,
                mfa_enabled=True
            )
        db.add(user)
        db.commit()
        db.refresh(user)

    # ICAI SQC-1 Cryptographic Audit Block Logging
    try:
        payload = {
            "auth_method": "OTP",
            "channel": channel,
            "identifier": norm_id,
            "client_ip": request.client.host if request.client else "unknown",
            "user_agent": request.headers.get("user-agent", "unknown")
        }
        # Single canonical writer: login blocks must hash exactly like every other block,
        # otherwise the chain verifier reports tampering after the first login.
        enter_tenant(db, user.firm_id)  # identified: leave system scope before touching tenant data
        append_audit_block(
            db, user.firm_id, str(user.id), user.role, "LOGIN_OTP_VERIFIED", "USER_SESSION", str(user.id), payload
        )
    except Exception as e:
        logger.warning(f"Audit block logging non-blocking error: {e}")

    # Generate 7-day JWT access token
    token_claims = {
        "sub": str(user.id),
        "tenant_id": str(user.firm_id),
        "role": user.role,
        "email": user.email,
        "phone": user.phone,
        "full_name": user.full_name,
        "membership_no": user.membership_no
    }
    token = create_access_token(data=token_claims, expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        user=UserProfileResponse(
            id=str(user.id),
            firm_id=str(user.firm_id),
            email=user.email,
            phone=user.phone,
            full_name=user.full_name,
            role=user.role,
            membership_no=user.membership_no
        )
    )

def _bootstrap_user(db: Session, identifier: str):
    """First-ever login only: BOOTSTRAP_ADMIN_PHONE becomes the firm's first Partner. In local development a demo
    persona's number is provisioned as that persona. Anything else is refused by the caller."""
    persona = next((p for p in DEMO_PERSONAS if p["phone"] == identifier), None) if settings.DEBUG else None
    first_login = db.execute(select(User.id).limit(1)).first() is None
    bootstrap = first_login and bool(settings.BOOTSTRAP_ADMIN_PHONE) and identifier == settings.BOOTSTRAP_ADMIN_PHONE
    if persona is None and not bootstrap:
        return None

    firm = db.execute(select(Firm).limit(1)).scalars().first()
    if firm is None:
        firm = Firm(
            id=uuid.uuid4(), firm_code=f"firm-{uuid.uuid4().hex[:8]}", firm_name="My CA Firm",
            constitution="PARTNERSHIP",
        )
        db.add(firm)
        db.flush()
    digits = identifier.lstrip("+")
    user = User(
        firm_id=firm.id,
        email=persona["email"] if persona else f"partner.{digits}@pending.invalid",
        phone=identifier,
        full_name=persona["full_name"] if persona else "Firm Partner",
        role=persona["role"] if persona else UserRole.PARTNER.value,
        membership_no=persona["membership_no"] if persona else None,
        hashed_password=get_password_hash(uuid.uuid4().hex),
        is_active=True,
        mfa_enabled=True,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # A second request for the same first login got here at the same moment and won the race:
        # use the account it created instead of failing.
        db.rollback()
        existing = db.execute(select(User).where(User.phone == identifier)).scalars().first()
        if existing is None:
            raise
        return existing
    db.refresh(user)
    return user


@router.post("/firebase/verify", response_model=AuthResponse)
def verify_firebase_auth(req: FirebaseVerifyRequest, request: Request, db: Session = Depends(get_system_db)):
    """Exchanges a verified Firebase phone-OTP ID token for the platform's RBAC session token.

    The token is verified cryptographically (signature, audience, issuer, freshness, one-time use); the phone
    number must already belong to an active user of a firm. Accounts are never created for unknown numbers
    (except the one-off first-Partner bootstrap and local-development demo personas).
    """
    from ...core.firebase_auth import FirebaseAuthError, verify_firebase_phone_token
    from ...core.shared_store import get_store

    if settings.effective_login_provider != "firebase" or not settings.FIREBASE_PROJECT_ID:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Firebase sign-in is not configured.")
    client_ip = request.client.host if request.client else "unknown"
    if not get_store().allow(f"firebase-verify:{client_ip}", 20, 60):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts. Try again shortly.", headers={"Retry-After": "60"})
    try:
        claims = verify_firebase_phone_token(
            req.id_token.strip(), project_id=settings.FIREBASE_PROJECT_ID,
            max_auth_age_seconds=settings.FIREBASE_MAX_AUTH_AGE_SECONDS,
        )
    except FirebaseAuthError as exc:
        logger.warning("Firebase token refused: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phone verification failed. Please try again.")
    identifier = claims["phone_number"]
    firebase_uid = claims["sub"]

    matches = db.execute(select(User).where(User.phone == identifier)).scalars().all()
    if len(matches) > 1:
        logger.error("Phone %s belongs to %d users; refusing ambiguous login", identifier, len(matches))
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This number is registered more than once. Contact your administrator.")
    user = matches[0] if matches else None

    if user is None:
        user = _bootstrap_user(db, identifier)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This number is not registered with any firm. Ask your firm's administrator to add you.",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is deactivated.")

    # SQC 1 Audit Log
    try:
        payload = {
            "auth_method": "FIREBASE_PHONE_AUTH",
            "firebase_uid": firebase_uid,
            "identifier": identifier,
            "client_ip": request.client.host if request.client else "unknown",
            "user_agent": request.headers.get("user-agent", "unknown")
        }
        # Single canonical writer: login blocks must hash exactly like every other block,
        # otherwise the chain verifier reports tampering after the first login.
        enter_tenant(db, user.firm_id)  # identified: leave system scope before touching tenant data
        append_audit_block(
            db, user.firm_id, str(user.id), user.role, "FIREBASE_AUTH_VERIFIED", "USER_SESSION", str(user.id), payload
        )
    except Exception as e:
        logger.warning(f"Audit block logging non-blocking error: {e}")

    token_claims = {
        "sub": str(user.id),
        "tenant_id": str(user.firm_id),
        "role": user.role,
        "email": user.email,
        "phone": user.phone,
        "full_name": user.full_name,
        "membership_no": user.membership_no
    }
    jwt_token = create_access_token(data=token_claims, expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))

    return AuthResponse(
        access_token=jwt_token,
        token_type="bearer",
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        user=UserProfileResponse(
            id=str(user.id),
            firm_id=str(user.firm_id),
            email=user.email,
            phone=user.phone,
            full_name=user.full_name,
            role=user.role,
            membership_no=user.membership_no
        )
    )

@router.get("/me", response_model=UserProfileResponse)
def get_my_profile(
    current_user: DepUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns the authenticated user's profile decoded from Bearer JWT."""
    result = db.execute(select(User).where(User.id == current_user.id))
    user = result.scalars().first()

    if user:
        return UserProfileResponse(
            id=str(user.id),
            firm_id=str(user.firm_id),
            email=user.email,
            phone=user.phone,
            full_name=user.full_name,
            role=user.role,
            membership_no=user.membership_no
        )

    return UserProfileResponse(
        id=str(current_user.id),
        firm_id=str(current_user.tenant_id),
        email=getattr(current_user, "email", "ca.practitioner@cafirm.in"),
        phone="+919876543210",
        full_name=getattr(current_user, "full_name", "CA Practitioner"),
        role=current_user.role,
        membership_no="ICAI-504912"
    )

@router.get("/demo-personas", response_model=List[Dict[str, Any]])
def list_demo_personas():
    """Provides standard CA firm personas for quick 1-click testing (local development only)."""
    return DEMO_PERSONAS if settings.DEBUG else []
