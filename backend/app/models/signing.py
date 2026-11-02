"""Gate G7 desktop-signer persistence.

The platform never holds a DSC private key or PIN. A partner registers the *public*
certificate of their Class-3 DSC once; each signing ceremony is a server-issued
challenge (`SigningRequest`) that the partner's desktop signer answers with a
signature produced locally on the USB token. See docs/DESKTOP_DSC_SIGNER_SPEC.md.
"""
import enum

from sqlalchemy import Column, String, Integer, Enum, DateTime, Text, Index

from .base import BaseModel, UUID


class DSCCertStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"


class SigningStatus(str, enum.Enum):
    PENDING = "PENDING"
    SIGNED = "SIGNED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    FAILED = "FAILED"


class DSCCertificate(BaseModel):
    """Public certificate of a partner's Class-3 DSC (never any private material)."""
    __tablename__ = "dsc_certificates"

    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    fingerprint_sha256 = Column(String(64), nullable=False, unique=True, index=True)
    serial_number = Column(String(80), nullable=False)
    subject_dn = Column(String(500), nullable=False)
    issuer_dn = Column(String(500), nullable=False)
    not_before = Column(DateTime(timezone=True), nullable=False)
    not_after = Column(DateTime(timezone=True), nullable=False)
    certificate_pem = Column(Text, nullable=False)
    status = Column(Enum(DSCCertStatus), default=DSCCertStatus.ACTIVE, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)


class SigningRequest(BaseModel):
    """A single-use signing challenge bound to one document hash and one signer."""
    __tablename__ = "signing_requests"
    __table_args__ = (
        Index("ix_signing_requests_signer_status", "signer_id", "status"),
    )

    entity_type = Column(String(40), nullable=False)          # e.g. GST_RETURN
    entity_id = Column(String(64), nullable=False, index=True)
    gate_id = Column(String(8), nullable=False, default="G7")
    document_hash = Column(String(64), nullable=False)        # SHA-256 hex of the canonical payload
    document_label = Column(String(200), nullable=False)      # human-readable text shown on the signer

    requested_by = Column(UUID(as_uuid=True), nullable=False)
    signer_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    preparer_id = Column(UUID(as_uuid=True), nullable=True)

    nonce = Column(String(64), nullable=False, unique=True)   # 256-bit random, single use
    status = Column(Enum(SigningStatus), default=SigningStatus.PENDING, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    signature_b64 = Column(Text, nullable=True)
    cert_fingerprint = Column(String(64), nullable=True)
    signed_at = Column(DateTime(timezone=True), nullable=True)
    signer_device = Column(String(120), nullable=True)
    attempts = Column(Integer, default=0, nullable=False)
    failure_reason = Column(String(300), nullable=True)
    audit_block_hash = Column(String(64), nullable=True)


class DeviceGrantStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    CONSUMED = "CONSUMED"


class DeviceAuthorization(BaseModel):
    """RFC 8628 device authorization request. Only a hash of the device_code is stored."""
    __tablename__ = "device_authorizations"

    device_code_hash = Column(String(64), nullable=False, unique=True)
    user_code = Column(String(12), nullable=False, index=True)
    device_name = Column(String(120), nullable=False)
    status = Column(Enum(DeviceGrantStatus), default=DeviceGrantStatus.PENDING, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    approved_user_id = Column(UUID(as_uuid=True), nullable=True)
    last_polled_at = Column(DateTime(timezone=True), nullable=True)


class SignerDevice(BaseModel):
    """An approved desktop signer. Tokens carry its id; revoking the row kills them at once."""
    __tablename__ = "signer_devices"

    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    device_name = Column(String(120), nullable=False)
    refresh_hash = Column(String(64), nullable=False, unique=True)   # rotated on every refresh
    previous_refresh_hash = Column(String(64), nullable=True)         # reuse of this => theft => revoke
    refresh_expires_at = Column(DateTime(timezone=True), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
