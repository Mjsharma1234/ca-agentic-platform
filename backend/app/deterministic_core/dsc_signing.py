"""Pure cryptographic helpers for Gate G7 desktop-signer verification.

No private key, PIN or token ever reaches this module: it only parses public
certificates and verifies signatures produced on the partner's own machine.
"""
import hashlib
from datetime import datetime, timezone
from typing import Optional, Tuple

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa

MESSAGE_PREFIX = "CAFOS-DSC-V1"
MIN_RSA_BITS = 2048
ALLOWED_CURVES = ("secp256r1", "secp384r1")


class CertificateError(ValueError):
    """Raised when a presented DSC certificate is unacceptable."""


def canonical_signing_message(
    *,
    request_id: str,
    entity_type: str,
    entity_id: str,
    gate_id: str,
    document_hash: str,
    nonce: str,
    signer_id: str,
    expires_at: datetime,
) -> bytes:
    """The exact bytes the desktop signer signs. Binding every field defeats replay and
    substitution: a signature for one document/nonce/signer is useless for any other."""
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    parts = [
        MESSAGE_PREFIX,
        f"request:{request_id}",
        f"entity:{entity_type}:{entity_id}",
        f"gate:{gate_id}",
        f"sha256:{document_hash}",
        f"nonce:{nonce}",
        f"signer:{signer_id}",
        f"expires:{expires_at.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}",
    ]
    return "\n".join(parts).encode("utf-8")


def load_certificate(pem: str) -> x509.Certificate:
    try:
        return x509.load_pem_x509_certificate(pem.encode("utf-8"))
    except Exception as exc:  # noqa: BLE001 - any parse failure is a rejection
        raise CertificateError("Certificate is not valid PEM-encoded X.509.") from exc


def fingerprint_sha256(cert: x509.Certificate) -> str:
    return hashlib.sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest()


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def validate_certificate(
    cert: x509.Certificate,
    *,
    now: Optional[datetime] = None,
    trusted_issuer: Optional[x509.Certificate] = None,
) -> None:
    """Reject weak keys, expired/not-yet-valid certs, certs unfit for signing, and (when a
    trust anchor is configured) certs not directly issued by it."""
    now = now or datetime.now(timezone.utc)
    if now < _utc(cert.not_valid_before_utc) or now > _utc(cert.not_valid_after_utc):
        raise CertificateError("Certificate is outside its validity period.")

    key = cert.public_key()
    if isinstance(key, rsa.RSAPublicKey):
        if key.key_size < MIN_RSA_BITS:
            raise CertificateError(f"RSA key too small ({key.key_size} bits); minimum is {MIN_RSA_BITS}.")
    elif isinstance(key, ec.EllipticCurvePublicKey):
        if key.curve.name not in ALLOWED_CURVES:
            raise CertificateError(f"Unsupported EC curve {key.curve.name}.")
    else:
        raise CertificateError("Unsupported public key type; use RSA or ECDSA.")

    try:
        usage = cert.extensions.get_extension_for_class(x509.KeyUsage).value
        if not (usage.digital_signature or usage.content_commitment):
            raise CertificateError("Certificate key usage does not permit digital signatures.")
    except x509.ExtensionNotFound:
        pass  # key usage absent: permitted by RFC 5280

    try:
        basic = cert.extensions.get_extension_for_class(x509.BasicConstraints).value
        if basic.ca:
            raise CertificateError("A CA certificate cannot be registered as a signer DSC.")
    except x509.ExtensionNotFound:
        pass

    if trusted_issuer is not None:
        try:
            cert.verify_directly_issued_by(trusted_issuer)
        except Exception as exc:  # noqa: BLE001
            raise CertificateError("Certificate was not issued by a trusted certifying authority.") from exc


def verify_signature(cert: x509.Certificate, message: bytes, signature: bytes) -> bool:
    key = cert.public_key()
    try:
        if isinstance(key, rsa.RSAPublicKey):
            key.verify(signature, message, padding.PKCS1v15(), hashes.SHA256())
        elif isinstance(key, ec.EllipticCurvePublicKey):
            key.verify(signature, message, ec.ECDSA(hashes.SHA256()))
        else:
            return False
        return True
    except InvalidSignature:
        return False


def subject_summary(cert: x509.Certificate) -> Tuple[str, str, str]:
    return cert.subject.rfc4514_string(), cert.issuer.rfc4514_string(), format(cert.serial_number, "x")
