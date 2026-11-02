import os
import re
from datetime import datetime, timezone
from typing import Generator, Annotated, Optional
from fastapi import Depends, HTTPException, status, Header, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session
import uuid
import jwt

from ..core.config import settings
from ..core.security import ALGORITHM
from ..core.database import get_db

bearer_scheme = HTTPBearer(auto_error=False)

class User:
    def __init__(
        self,
        id: str,
        tenant_id: str,
        role: str,
        email: str = "",
        full_name: str = "",
        phone: Optional[str] = None,
        membership_no: Optional[str] = None,
        scope: Optional[str] = None,
        device_id: Optional[str] = None,
    ):
        self.id = uuid.UUID(str(id)) if not isinstance(id, uuid.UUID) else id
        self.tenant_id = uuid.UUID(str(tenant_id)) if not isinstance(tenant_id, uuid.UUID) else tenant_id
        self.role = role
        self.email = email
        self.full_name = full_name
        self.phone = phone
        self.membership_no = membership_no
        self.scope = scope
        self.device_id = device_id

SIGNER_ALLOWED = re.compile(
    r"^/api/v1/signing/(requests/pending|requests/[0-9a-fA-F-]{36}|requests/[0-9a-fA-F-]{36}/(complete|reject))/?$"
)


def _authorise_signer_token(payload: dict, request: Request, db: Session) -> "User":
    """Desktop-signer tokens are scoped: only the signing endpoints, only while the device is
    approved and the partner is still an active Partner (role is re-read, not trusted from the token)."""
    from ..models.signing import SignerDevice
    from ..models.tenant import User as UserModel

    if not SIGNER_ALLOWED.match(request.url.path):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Signer tokens are limited to the signing API.")
    try:
        device_id = uuid.UUID(str(payload.get("did")))
        user_id = uuid.UUID(str(payload.get("sub")))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token claims.")
    device = db.execute(select(SignerDevice).where(SignerDevice.id == device_id)).scalar_one_or_none()
    if device is None or device.revoked_at is not None or device.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This signer device is no longer authorised.")
    row = db.execute(select(UserModel).where(UserModel.id == user_id)).scalar_one_or_none()
    if row is None or not row.is_active or str(row.firm_id) != str(payload.get("tenant_id")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is not active.")
    device.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    return User(
        id=row.id, tenant_id=row.firm_id, role=row.role, email=row.email, full_name=row.full_name,
        membership_no=row.membership_no, scope="signer", device_id=str(device.id),
    )


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    auth: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    x_user_id: Optional[str] = Header(None),
    x_tenant_id: Optional[str] = Header(None),
    x_user_role: Optional[str] = Header(None),
) -> User:
    """Resolves authenticated user from Bearer JWT token.
    Enforces strict signature & expiration verification.
    Fallback test headers are strictly gated behind pytest / explicit test mode flags.
    """
    # 1. Bearer JWT Authentication (Standard Production Path)
    if auth and auth.credentials:
        try:
            payload = jwt.decode(auth.credentials, settings.SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            tenant_id = payload.get("tenant_id")
            role = payload.get("role")
            
            if not user_id or not tenant_id or not role:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token claims.")
            if payload.get("scope") == "signer":
                return _authorise_signer_token(payload, request, db)

            email = payload.get("email", "")
            full_name = payload.get("full_name", "")
            phone = payload.get("phone", None)
            membership_no = payload.get("membership_no", None)

            return User(
                id=user_id,
                tenant_id=tenant_id,
                role=role,
                email=email,
                full_name=full_name,
                phone=phone,
                membership_no=membership_no
            )
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please log in again with OTP.")
        except jwt.PyJWTError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session token.")

    # 2. Test Environment Compatibility (Gated strictly to test suites)
    is_test_env = (
        bool(os.getenv("PYTEST_CURRENT_TEST")) or
        os.getenv("ALLOW_TEST_AUTH_HEADERS", "").lower() in ("true", "1")
    )
    if is_test_env and (x_user_id or x_tenant_id or x_user_role):
        uid = x_user_id or "00000000-0000-0000-0000-000000000002"
        tid = x_tenant_id or "00000000-0000-0000-0000-000000000001"
        role = x_user_role or "ARTICLE_TRAINEE"
        return User(id=uid, tenant_id=tid, role=role, email="test.user@cafirm.in", full_name="Automated Test Subject")

    # 3. Reject Unauthenticated Requests
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Please provide a valid Bearer session token."
    )

def get_current_tenant(current_user: Annotated[User, Depends(get_current_user)]) -> uuid.UUID:
    return current_user.tenant_id

ROLE_HIERARCHY = {
    "CLIENT_USER": 0,
    "CLIENT": 0,
    "ARTICLE_TRAINEE": 1,
    "AT": 1,
    "STAFF": 1,
    "REVIEWER": 2,
    "SA": 2,
    "MANAGER": 3,
    "MG": 3,
    "SENIOR_MANAGER": 4,
    "SM": 4,
    "PARTNER": 5,
    "PT": 5,
    "MP": 5
}

def get_optional_current_user(
    request: Request,
    db: Session = Depends(get_db),
    auth: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    x_user_id: Optional[str] = Header(None),
    x_tenant_id: Optional[str] = Header(None),
    x_user_role: Optional[str] = Header(None),
) -> Optional[User]:
    """Resolves authenticated user if credentials are provided; returns None otherwise without raising 401."""
    try:
        return get_current_user(request, db, auth, x_user_id, x_tenant_id, x_user_role)
    except HTTPException:
        return None

def require_role(required_role: str):
    """Enforces Role-Based Access Control (RBAC) hierarchy."""
    def role_checker(current_user: Annotated[User, Depends(get_current_user)]):
        req_level = ROLE_HIERARCHY.get(required_role, 3)
        user_level = ROLE_HIERARCHY.get(current_user.role, 0)
        if user_level < req_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation requires {required_role} privilege or higher. Your active role is {current_user.role}."
            )
        return current_user
    return role_checker


def interactive_user(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    """A person's browser session — never a desktop-signer token (used for device management)."""
    if current_user.scope == "signer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not available to signer tokens.")
    return current_user
