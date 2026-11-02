"""Desktop-signer enrolment: OAuth 2.0 Device Authorization Grant (RFC 8628).

  signer app  -> POST /signing/device/code      (anonymous; gets device_code + user_code)
  partner web -> POST /signing/device/approve   (Partner browser session; types/compares user_code)
  signer app  -> POST /signing/device/token     (polls; receives a 15-min scoped access token + rotating refresh token)
  signer app  -> POST /signing/device/refresh   (rotation with reuse detection: a replayed refresh token revokes the device)

Signer tokens carry scope=signer and the device id; app/api/deps.py confines them to the signing
endpoints and re-checks the device, the user and their role on every request.
"""
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.database import get_db
from ...core.dpop import require_dpop
from ...core.shared_store import get_store
from ...core.security import create_access_token
from ...deterministic_core.audit_chain import append_audit_block
from ...models.signing import DeviceAuthorization, DeviceGrantStatus, SignerDevice
from ...models.tenant import User as UserModel
from ..deps import ROLE_HIERARCHY, User, interactive_user, require_role

router = APIRouter(prefix="/signing", tags=["signer-devices"])

USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789"  # no vowels / look-alikes
POLL_INTERVAL_SECONDS = 5

def rate_limit(key: str, limit: int, window: int = 60) -> None:
    """Shared (Redis) sliding/fixed window when SHARED_STORE_URL is set, else per-process."""
    if not get_store().allow(key, limit, window):
        raise HTTPException(status_code=429, detail="Too many requests.", headers={"Retry-After": str(window)})


def reset_rate_limits() -> None:
    get_store().reset()


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _norm_code(code: str) -> str:
    return code.replace("-", "").replace(" ", "").upper()


def _oauth_error(code: str, status_code: int = 400, description: str = ""):
    raise HTTPException(status_code=status_code, detail={"error": code, "error_description": description})


def _client_key(request: Request, name: str) -> str:
    return f"{name}:{request.client.host if request.client else 'unknown'}"


# ---------------------------------------------------------------- anonymous endpoints
class DeviceCodeRequest(BaseModel):
    device_name: str = Field(min_length=3, max_length=120, pattern=r"^[\w .:/()\-]+$")


@router.post("/device/code", status_code=status.HTTP_200_OK)
def request_device_code(body: DeviceCodeRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit(_client_key(request, "device-code"), limit=10)
    device_code = secrets.token_urlsafe(32)
    raw = "".join(secrets.choice(USER_CODE_ALPHABET) for _ in range(8))
    row = DeviceAuthorization(
        device_code_hash=_sha(device_code),
        user_code=raw,
        device_name=body.device_name.strip(),
        expires_at=_utcnow() + timedelta(seconds=settings.DEVICE_CODE_TTL_SECONDS),
    )
    db.add(row)
    db.commit()
    return {
        "device_code": device_code,
        "user_code": f"{raw[:4]}-{raw[4:]}",
        "verification_uri": f"{settings.PUBLIC_WEB_URL.rstrip('/')}/device",
        "expires_in": settings.DEVICE_CODE_TTL_SECONDS,
        "interval": POLL_INTERVAL_SECONDS,
    }


class DeviceTokenRequest(BaseModel):
    device_code: str = Field(min_length=20, max_length=200)


def _proof_thumbprint(request: Request) -> Optional[str]:
    """Key thumbprint from the DPoP proof on a token/refresh request (no access token exists yet)."""
    if request.headers.get("DPoP") is None:
        if settings.SIGNER_REQUIRE_DPOP:
            raise HTTPException(
                status_code=401, detail="A DPoP proof is required.",
                headers={"WWW-Authenticate": 'DPoP error="invalid_dpop_proof", algs="ES256"'},
            )
        return None
    return require_dpop(request, None)


def _issue_access_token(user_row: UserModel, device: SignerDevice) -> Dict[str, object]:
    minutes = settings.SIGNER_ACCESS_TOKEN_MINUTES
    claims = {
        "sub": str(user_row.id), "tenant_id": str(user_row.firm_id), "role": user_row.role,
        "scope": "signer", "did": str(device.id),
    }
    if device.dpop_jkt:
        claims["cnf"] = {"jkt": device.dpop_jkt}
    token = create_access_token(
        claims,
        expires_delta=timedelta(minutes=minutes),
    )
    return {"access_token": token, "token_type": "bearer", "expires_in": minutes * 60}


@router.post("/device/token")
def poll_device_token(body: DeviceTokenRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit(_client_key(request, "device-token"), limit=60)
    jkt = _proof_thumbprint(request)
    grant = db.execute(
        select(DeviceAuthorization).where(DeviceAuthorization.device_code_hash == _sha(body.device_code))
    ).scalar_one_or_none()
    if grant is None:
        _oauth_error("invalid_grant")
    now = _utcnow()
    if _aware(grant.expires_at) <= now:
        _oauth_error("expired_token")
    if grant.status == DeviceGrantStatus.DENIED:
        _oauth_error("access_denied")
    if grant.status == DeviceGrantStatus.CONSUMED:
        _oauth_error("invalid_grant", description="Device code already used.")
    if grant.last_polled_at and (now - _aware(grant.last_polled_at)).total_seconds() < POLL_INTERVAL_SECONDS - 1:
        grant.last_polled_at = now
        db.commit()
        _oauth_error("slow_down")
    grant.last_polled_at = now
    if grant.status == DeviceGrantStatus.PENDING:
        db.commit()
        _oauth_error("authorization_pending")

    user_row = db.execute(
        select(UserModel).where(UserModel.id == grant.approved_user_id, UserModel.is_active.is_(True))
    ).scalar_one_or_none()
    if user_row is None or ROLE_HIERARCHY.get((user_row.role or "").upper(), 0) < ROLE_HIERARCHY["PARTNER"]:
        _oauth_error("access_denied", description="Approving user is not an active Partner.")

    refresh = secrets.token_urlsafe(48)
    device = SignerDevice(
        tenant_id=user_row.firm_id, user_id=user_row.id, device_name=grant.device_name,
        refresh_hash=_sha(refresh), refresh_expires_at=now + timedelta(days=settings.SIGNER_REFRESH_DAYS),
        last_seen_at=now, dpop_jkt=jkt,
    )
    db.add(device)
    db.flush()
    grant.status = DeviceGrantStatus.CONSUMED
    append_audit_block(
        db, user_row.firm_id, str(user_row.id), user_row.role, "SIGNER_DEVICE_ENROLLED", "SIGNER_DEVICE",
        str(device.id), {"device_name": device.device_name, "dpop_bound": bool(jkt)}, commit=False,
    )
    db.commit()
    return {**_issue_access_token(user_row, device), "refresh_token": refresh}


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=30, max_length=200)


@router.post("/device/refresh")
def refresh_device_token(body: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit(_client_key(request, "device-refresh"), limit=30)
    jkt = _proof_thumbprint(request)
    h = _sha(body.refresh_token)
    device = db.execute(select(SignerDevice).where(SignerDevice.refresh_hash == h)).scalar_one_or_none()
    if device is None:
        reused = db.execute(select(SignerDevice).where(SignerDevice.previous_refresh_hash == h)).scalar_one_or_none()
        if reused is not None and reused.revoked_at is None:
            # An already-rotated refresh token came back: the token was copied. Kill the device.
            reused.revoked_at = _utcnow()
            append_audit_block(
                db, reused.tenant_id, str(reused.user_id), "SYSTEM", "SIGNER_DEVICE_REVOKED_TOKEN_REUSE",
                "SIGNER_DEVICE", str(reused.id), {"device_name": reused.device_name}, commit=False,
            )
            db.commit()
        _oauth_error("invalid_grant", 401)
    now = _utcnow()
    if device.revoked_at is not None or _aware(device.refresh_expires_at) <= now:
        _oauth_error("invalid_grant", 401)
    if device.dpop_jkt and not (jkt and hmac.compare_digest(jkt, device.dpop_jkt)):
        # A refresh token presented without (or with a different) key: copied token. Do not rotate it.
        _oauth_error("invalid_grant", 401, "Refresh token is bound to a different key.")
    if jkt and not device.dpop_jkt:
        _oauth_error("invalid_grant", 401, "Device is not key-bound; re-enrol.")
    user_row = db.execute(select(UserModel).where(UserModel.id == device.user_id)).scalar_one_or_none()
    if user_row is None or not user_row.is_active or ROLE_HIERARCHY.get((user_row.role or "").upper(), 0) < ROLE_HIERARCHY["PARTNER"]:
        _oauth_error("invalid_grant", 401)

    new_refresh = secrets.token_urlsafe(48)
    device.previous_refresh_hash = device.refresh_hash
    device.refresh_hash = _sha(new_refresh)
    device.refresh_expires_at = now + timedelta(days=settings.SIGNER_REFRESH_DAYS)
    device.last_seen_at = now
    db.commit()
    return {**_issue_access_token(user_row, device), "refresh_token": new_refresh}


# ---------------------------------------------------------------- partner (browser) endpoints
class ApproveRequest(BaseModel):
    user_code: str = Field(min_length=8, max_length=12)
    approve: bool = True


@router.post("/device/approve")
def approve_device(
    body: ApproveRequest,
    user: Annotated[User, Depends(require_role("PARTNER"))],
    db: Session = Depends(get_db),
):
    if user.scope == "signer":
        raise HTTPException(status_code=403, detail="Not available to signer tokens.")
    rate_limit(f"device-approve:{user.id}", limit=10)
    grant = db.execute(
        select(DeviceAuthorization).where(
            DeviceAuthorization.user_code == _norm_code(body.user_code),
            DeviceAuthorization.status == DeviceGrantStatus.PENDING,
        )
    ).scalars().first()
    if grant is None or _aware(grant.expires_at) <= _utcnow():
        raise HTTPException(status_code=404, detail="Code not found or expired.")
    if body.approve:
        grant.status = DeviceGrantStatus.APPROVED
        grant.approved_user_id = user.id
        grant.tenant_id = user.tenant_id
    else:
        grant.status = DeviceGrantStatus.DENIED
    append_audit_block(
        db, user.tenant_id, str(user.id), user.role,
        "SIGNER_DEVICE_APPROVED" if body.approve else "SIGNER_DEVICE_DENIED", "DEVICE_AUTHORIZATION", str(grant.id),
        {"device_name": grant.device_name}, commit=False,
    )
    db.commit()
    return {"status": grant.status.value, "device_name": grant.device_name}


@router.get("/devices")
def list_my_devices(user: Annotated[User, Depends(interactive_user)], db: Session = Depends(get_db)):
    rows = db.execute(
        select(SignerDevice).where(SignerDevice.tenant_id == user.tenant_id, SignerDevice.user_id == user.id)
        .order_by(SignerDevice.created_at.desc())
    ).scalars().all()
    return [
        {
            "id": str(d.id), "device_name": d.device_name,
            "last_seen_at": _aware(d.last_seen_at).isoformat() if d.last_seen_at else None,
            "revoked": d.revoked_at is not None,
        }
        for d in rows
    ]


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_device(device_id: str, user: Annotated[User, Depends(interactive_user)], db: Session = Depends(get_db)):
    try:
        did = uuid.UUID(device_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Device not found.")
    d = db.execute(
        select(SignerDevice).where(
            SignerDevice.id == did, SignerDevice.tenant_id == user.tenant_id, SignerDevice.user_id == user.id
        )
    ).scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=404, detail="Device not found.")
    if d.revoked_at is None:
        d.revoked_at = _utcnow()
        append_audit_block(
            db, user.tenant_id, str(user.id), user.role, "SIGNER_DEVICE_REVOKED", "SIGNER_DEVICE", str(d.id),
            {"device_name": d.device_name}, commit=False,
        )
        db.commit()
