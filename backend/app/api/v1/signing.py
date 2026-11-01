"""Gate G7 — desktop-signer challenge/response API.

The server never sees a DSC PIN or private key. Flow:
  1. Partner registers the public certificate of their Class-3 DSC.
  2. A reviewer opens a SigningRequest bound to one document hash and one partner.
  3. The partner's desktop signer (polling GET /signing/requests/pending) signs the
     canonical message on the USB token and POSTs the signature to .../complete.
  4. The server verifies the signature against the registered certificate, then
     records the result in the SQC-1 audit chain.
"""
import base64
import binascii
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.database import get_db
from ...deterministic_core import dsc_signing as dsc
from ...deterministic_core.audit_chain import append_audit_block
from ...models.returns import GSTReturn, ReturnStatus
from ...models.signing import DSCCertificate, DSCCertStatus, SigningRequest, SigningStatus
from ...models.tenant import User as UserModel
from ..deps import ROLE_HIERARCHY, User, get_current_user, require_role

router = APIRouter(prefix="/signing", tags=["signing"])

HEX64 = re.compile(r"^[0-9a-f]{64}$")
MAX_ATTEMPTS = 3
ENTITY_TYPES = {"GST_RETURN", "ITR", "TDS_RETURN", "MCA_FORM", "OTHER"}

CurrentUser = Annotated[User, Depends(get_current_user)]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _trusted_issuer():
    path = os.getenv("DSC_TRUSTED_CA_PEM_PATH")
    if not path:
        return None
    with open(path, "r", encoding="utf-8") as fh:
        return dsc.load_certificate(fh.read())


def _public(req: SigningRequest) -> Dict[str, Any]:
    return {
        "id": str(req.id),
        "entity_type": req.entity_type,
        "entity_id": req.entity_id,
        "gate_id": req.gate_id,
        "document_hash": req.document_hash,
        "document_label": req.document_label,
        "signer_id": str(req.signer_id),
        "requested_by": str(req.requested_by),
        "status": req.status.value,
        "expires_at": _aware(req.expires_at).isoformat(),
        "signed_at": _aware(req.signed_at).isoformat() if req.signed_at else None,
        "cert_fingerprint": req.cert_fingerprint,
        "failure_reason": req.failure_reason,
    }


def _expire_if_due(db: Session, req: SigningRequest) -> SigningRequest:
    if req.status == SigningStatus.PENDING and _aware(req.expires_at) <= _utcnow():
        req.status = SigningStatus.EXPIRED
        req.failure_reason = "Signing window elapsed."
        db.commit()
    return req


def _load_request(db: Session, request_id: str, user: User) -> SigningRequest:
    try:
        rid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Signing request not found.")
    req = db.execute(
        select(SigningRequest).where(SigningRequest.id == rid, SigningRequest.tenant_id == user.tenant_id)
    ).scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=404, detail="Signing request not found.")
    return _expire_if_due(db, req)


# ---------------------------------------------------------------------------
# Certificate registration
# ---------------------------------------------------------------------------
class RegisterCertificateRequest(BaseModel):
    certificate_pem: str = Field(min_length=100, max_length=20000)


@router.post("/certificates", status_code=status.HTTP_201_CREATED)
def register_certificate(
    body: RegisterCertificateRequest,
    user: Annotated[User, Depends(require_role("PARTNER"))],
    db: Session = Depends(get_db),
):
    """Register the PUBLIC certificate of the calling partner's Class-3 DSC."""
    try:
        cert = dsc.load_certificate(body.certificate_pem)
        dsc.validate_certificate(cert, trusted_issuer=_trusted_issuer())
    except dsc.CertificateError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    fp = dsc.fingerprint_sha256(cert)
    existing = db.execute(select(DSCCertificate).where(DSCCertificate.fingerprint_sha256 == fp)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="This certificate is already registered.")

    subject, issuer, serial = dsc.subject_summary(cert)
    row = DSCCertificate(
        tenant_id=user.tenant_id,
        user_id=user.id,
        fingerprint_sha256=fp,
        serial_number=serial,
        subject_dn=subject[:500],
        issuer_dn=issuer[:500],
        not_before=cert.not_valid_before_utc,
        not_after=cert.not_valid_after_utc,
        certificate_pem=body.certificate_pem.strip(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    append_audit_block(
        db, user.tenant_id, str(user.id), user.role, "DSC_CERTIFICATE_REGISTERED",
        "DSC_CERTIFICATE", str(row.id), {"fingerprint": fp, "serial": serial},
    )
    return {"id": str(row.id), "fingerprint_sha256": fp, "subject": subject, "not_after": row.not_after.isoformat()}


@router.get("/certificates")
def list_my_certificates(user: CurrentUser, db: Session = Depends(get_db)):
    rows = db.execute(
        select(DSCCertificate).where(
            DSCCertificate.tenant_id == user.tenant_id, DSCCertificate.user_id == user.id
        ).order_by(DSCCertificate.created_at.desc())
    ).scalars().all()
    return [
        {
            "id": str(r.id), "fingerprint_sha256": r.fingerprint_sha256, "subject": r.subject_dn,
            "serial_number": r.serial_number, "not_after": _aware(r.not_after).isoformat(), "status": r.status.value,
        }
        for r in rows
    ]


@router.delete("/certificates/{certificate_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_certificate(
    certificate_id: str,
    user: Annotated[User, Depends(require_role("PARTNER"))],
    db: Session = Depends(get_db),
):
    try:
        cid = uuid.UUID(certificate_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Certificate not found.")
    row = db.execute(
        select(DSCCertificate).where(
            DSCCertificate.id == cid, DSCCertificate.tenant_id == user.tenant_id, DSCCertificate.user_id == user.id
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Certificate not found.")
    row.status = DSCCertStatus.REVOKED
    row.revoked_at = _utcnow()
    db.commit()
    append_audit_block(
        db, user.tenant_id, str(user.id), user.role, "DSC_CERTIFICATE_REVOKED",
        "DSC_CERTIFICATE", str(row.id), {"fingerprint": row.fingerprint_sha256},
    )


# ---------------------------------------------------------------------------
# Signing requests
# ---------------------------------------------------------------------------
class CreateSigningRequest(BaseModel):
    entity_type: str
    entity_id: str = Field(min_length=1, max_length=64)
    document_hash: str = Field(description="Lower-case hex SHA-256 of the canonical payload to be signed.")
    document_label: str = Field(min_length=3, max_length=200)
    signer_id: uuid.UUID
    gate_id: str = Field(default="G7", pattern=r"^G\d{1,2}$")


@router.post("/requests", status_code=status.HTTP_201_CREATED)
def create_signing_request(
    body: CreateSigningRequest,
    user: Annotated[User, Depends(require_role("MANAGER"))],
    db: Session = Depends(get_db),
):
    if body.entity_type not in ENTITY_TYPES:
        raise HTTPException(status_code=422, detail=f"entity_type must be one of {sorted(ENTITY_TYPES)}.")
    if not HEX64.match(body.document_hash):
        raise HTTPException(status_code=422, detail="document_hash must be 64 lower-case hex characters.")

    signer = db.execute(
        select(UserModel).where(
            UserModel.id == body.signer_id, UserModel.firm_id == user.tenant_id, UserModel.is_active.is_(True)
        )
    ).scalar_one_or_none()
    if signer is None or ROLE_HIERARCHY.get((signer.role or "").upper(), 0) < ROLE_HIERARCHY["PARTNER"]:
        raise HTTPException(status_code=422, detail="signer_id must be an active Partner of this firm.")

    preparer_id: Optional[uuid.UUID] = None
    if body.entity_type == "GST_RETURN":
        try:
            ret_id = uuid.UUID(body.entity_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="GST_RETURN entity_id must be a UUID.")
        ret = db.execute(
            select(GSTReturn).where(GSTReturn.id == ret_id, GSTReturn.tenant_id == user.tenant_id)
        ).scalar_one_or_none()
        if ret is None:
            raise HTTPException(status_code=404, detail="Return not found.")
        if ret.payload_hash != body.document_hash:
            raise HTTPException(status_code=409, detail="document_hash does not match the stored return payload.")
        if ret.status not in (ReturnStatus.REVIEWED, ReturnStatus.SIGNING_PENDING):
            raise HTTPException(status_code=409, detail="Return must pass four-eyes review before signing.")
        if ret.reviewer_id is None:
            raise HTTPException(status_code=409, detail="Return has no recorded independent reviewer.")
        preparer_id = ret.preparer_id
        if preparer_id is not None and preparer_id == signer.id:
            raise HTTPException(status_code=409, detail="Four-eyes: the preparer cannot also be the signing partner.")
        ret.status = ReturnStatus.SIGNING_PENDING

    already = db.execute(
        select(SigningRequest).where(
            SigningRequest.tenant_id == user.tenant_id,
            SigningRequest.entity_type == body.entity_type,
            SigningRequest.entity_id == body.entity_id,
            SigningRequest.document_hash == body.document_hash,
            SigningRequest.status == SigningStatus.PENDING,
        )
    ).scalars().all()
    for r in already:
        _expire_if_due(db, r)
        if r.status == SigningStatus.PENDING:
            raise HTTPException(status_code=409, detail="A signing request for this document is already pending.")

    req = SigningRequest(
        tenant_id=user.tenant_id,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        gate_id=body.gate_id,
        document_hash=body.document_hash,
        document_label=body.document_label,
        requested_by=user.id,
        signer_id=signer.id,
        preparer_id=preparer_id,
        nonce=secrets.token_hex(32),
        expires_at=_utcnow() + timedelta(seconds=settings.SIGNING_REQUEST_TTL_SECONDS),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    append_audit_block(
        db, user.tenant_id, str(user.id), user.role, "SIGNING_REQUESTED", "SIGNING_REQUEST", str(req.id),
        {"entity": f"{body.entity_type}:{body.entity_id}", "document_hash": body.document_hash, "signer_id": str(signer.id)},
    )
    return _public(req)


def _challenge(req: SigningRequest) -> Dict[str, Any]:
    message = dsc.canonical_signing_message(
        request_id=str(req.id), entity_type=req.entity_type, entity_id=req.entity_id, gate_id=req.gate_id,
        document_hash=req.document_hash, nonce=req.nonce, signer_id=str(req.signer_id), expires_at=_aware(req.expires_at),
    )
    out = _public(req)
    out["nonce"] = req.nonce
    out["message_b64"] = base64.b64encode(message).decode("ascii")
    return out


@router.get("/requests/pending")
def pending_for_me(user: CurrentUser, db: Session = Depends(get_db)):
    """Polled by the desktop signer: only the assigned partner receives the challenge (with nonce)."""
    rows = db.execute(
        select(SigningRequest).where(
            SigningRequest.tenant_id == user.tenant_id,
            SigningRequest.signer_id == user.id,
            SigningRequest.status == SigningStatus.PENDING,
        ).order_by(SigningRequest.created_at.asc())
    ).scalars().all()
    live = [_expire_if_due(db, r) for r in rows]
    return [_challenge(r) for r in live if r.status == SigningStatus.PENDING]


@router.get("/requests")
def list_requests(
    user: CurrentUser,
    entity_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Requesters and signers see request status; the nonce is never included here."""
    q = select(SigningRequest).where(SigningRequest.tenant_id == user.tenant_id)
    if entity_id:
        q = q.where(SigningRequest.entity_id == entity_id)
    if ROLE_HIERARCHY.get(user.role.upper(), 0) < ROLE_HIERARCHY["MANAGER"]:
        q = q.where(SigningRequest.signer_id == user.id)
    rows = db.execute(q.order_by(SigningRequest.created_at.desc()).limit(100)).scalars().all()
    return [_public(_expire_if_due(db, r)) for r in rows]


@router.get("/requests/{request_id}")
def get_request(request_id: str, user: CurrentUser, db: Session = Depends(get_db)):
    req = _load_request(db, request_id, user)
    is_party = user.id in (req.signer_id, req.requested_by)
    if not is_party and ROLE_HIERARCHY.get(user.role.upper(), 0) < ROLE_HIERARCHY["MANAGER"]:
        raise HTTPException(status_code=404, detail="Signing request not found.")
    return _challenge(req) if user.id == req.signer_id and req.status == SigningStatus.PENDING else _public(req)


class CompleteSigningRequest(BaseModel):
    signature_b64: str = Field(min_length=64, max_length=4096)
    certificate_pem: str = Field(min_length=100, max_length=20000)
    signer_device: Optional[str] = Field(default=None, max_length=120)


@router.post("/requests/{request_id}/complete")
def complete_request(
    request_id: str,
    body: CompleteSigningRequest,
    user: Annotated[User, Depends(require_role("PARTNER"))],
    db: Session = Depends(get_db),
):
    req = _load_request(db, request_id, user)
    if req.signer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the assigned signing partner may complete this request.")
    if req.status != SigningStatus.PENDING:
        raise HTTPException(status_code=409, detail=f"Signing request is {req.status.value}.")

    def _fail(reason: str, code: int = 422):
        req.attempts += 1
        req.failure_reason = reason[:300]
        if req.attempts >= MAX_ATTEMPTS:
            req.status = SigningStatus.FAILED
        db.commit()
        append_audit_block(
            db, user.tenant_id, str(user.id), user.role, "SIGNING_REJECTED_BY_SERVER", "SIGNING_REQUEST",
            str(req.id), {"reason": reason, "attempts": req.attempts},
        )
        raise HTTPException(status_code=code, detail=reason)

    try:
        cert = dsc.load_certificate(body.certificate_pem)
        dsc.validate_certificate(cert, trusted_issuer=_trusted_issuer())
    except dsc.CertificateError as exc:
        _fail(str(exc))

    fp = dsc.fingerprint_sha256(cert)
    registered = db.execute(
        select(DSCCertificate).where(
            DSCCertificate.tenant_id == user.tenant_id,
            DSCCertificate.user_id == user.id,
            DSCCertificate.fingerprint_sha256 == fp,
            DSCCertificate.status == DSCCertStatus.ACTIVE,
        )
    ).scalar_one_or_none()
    if registered is None:
        _fail("Certificate is not registered to this partner or has been revoked.", 403)

    try:
        signature = base64.b64decode(body.signature_b64, validate=True)
    except (binascii.Error, ValueError):
        _fail("signature_b64 is not valid base64.")

    message = dsc.canonical_signing_message(
        request_id=str(req.id), entity_type=req.entity_type, entity_id=req.entity_id, gate_id=req.gate_id,
        document_hash=req.document_hash, nonce=req.nonce, signer_id=str(req.signer_id), expires_at=_aware(req.expires_at),
    )
    if not dsc.verify_signature(cert, message, signature):
        _fail("Signature verification failed.")

    now = _utcnow()
    req.status = SigningStatus.SIGNED
    req.signature_b64 = body.signature_b64
    req.cert_fingerprint = fp
    req.signed_at = now
    req.signer_device = body.signer_device
    req.failure_reason = None

    if req.entity_type == "GST_RETURN":
        try:
            ret = db.execute(
                select(GSTReturn).where(GSTReturn.id == uuid.UUID(req.entity_id), GSTReturn.tenant_id == user.tenant_id)
            ).scalar_one_or_none()
        except ValueError:
            ret = None
        if ret is not None and ret.payload_hash == req.document_hash:
            ret.status = ReturnStatus.SIGNED
            ret.signing_partner_id = user.id
    db.commit()

    block = append_audit_block(
        db, user.tenant_id, str(user.id), user.role, "DSC_SIGNED", "SIGNING_REQUEST", str(req.id),
        {
            "entity": f"{req.entity_type}:{req.entity_id}", "document_hash": req.document_hash,
            "cert_fingerprint": fp, "signer_device": body.signer_device, "gate_id": req.gate_id,
        },
    )
    req.audit_block_hash = block.block_hash
    db.commit()
    return _public(req)


class RejectSigningRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


@router.post("/requests/{request_id}/reject")
def reject_request(
    request_id: str,
    body: RejectSigningRequest,
    user: Annotated[User, Depends(require_role("PARTNER"))],
    db: Session = Depends(get_db),
):
    req = _load_request(db, request_id, user)
    if req.signer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the assigned signing partner may reject this request.")
    if req.status != SigningStatus.PENDING:
        raise HTTPException(status_code=409, detail=f"Signing request is {req.status.value}.")
    req.status = SigningStatus.REJECTED
    req.failure_reason = body.reason
    db.commit()
    append_audit_block(
        db, user.tenant_id, str(user.id), user.role, "SIGNING_REJECTED_BY_PARTNER", "SIGNING_REQUEST",
        str(req.id), {"reason": body.reason},
    )
    return _public(req)
