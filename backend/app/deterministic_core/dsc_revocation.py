"""CRL-based revocation checking for registered DSC certificates.

Order: OCSP first (when enabled and the certificate has an AIA OCSP responder), then the CRL.
Policy (settings.DSC_REVOCATION_MODE):
  off    - never check.
  soft   - a certificate listed as revoked is always refused; if revocation status cannot be
           determined (no CRL distribution point, CRL unreachable, no trust anchor to verify the
           CRL signature) the signature is accepted and the gap is logged. Safe default for rollout.
  strict - "unknown" is refused too. Use once the CCA/CA trust anchor is configured.

The CRL is only believed if its signature verifies against the configured trusted issuer, and is
fetched with SSRF protection (http/https only, public addresses only, size and time limits).
"""
import ipaddress
import logging
import socket
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Callable, Dict, Optional, Tuple
from urllib.parse import urlparse

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa
from cryptography.x509 import ocsp
from cryptography.x509.oid import AuthorityInformationAccessOID, ExtendedKeyUsageOID

from .dsc_signing import CertificateError

logger = logging.getLogger("dsc.revocation")

MAX_CRL_BYTES = 5 * 1024 * 1024
MAX_OCSP_BYTES = 1024 * 1024
FETCH_TIMEOUT_SECONDS = 5.0

Fetcher = Callable[[str], bytes]
OcspPoster = Callable[[str, bytes], bytes]
_ocsp_cache: Dict[Tuple[str, int], float] = {}
_cache: Dict[str, Tuple[float, x509.CertificateRevocationList]] = {}
_lock = threading.Lock()


def _assert_public_http_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("CRL URL must be http(s).")
    for info in socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80)):
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise ValueError("CRL URL resolves to a non-public address.")


def default_fetch(url: str) -> bytes:
    import httpx

    _assert_public_http_url(url)
    with httpx.Client(timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=False) as client:
        with client.stream("GET", url) as resp:
            resp.raise_for_status()
            data = b""
            for chunk in resp.iter_bytes():
                data += chunk
                if len(data) > MAX_CRL_BYTES:
                    raise ValueError("CRL exceeds size limit.")
            return data


def default_ocsp_post(url: str, body: bytes) -> bytes:
    import httpx

    _assert_public_http_url(url)
    headers = {"Content-Type": "application/ocsp-request", "Accept": "application/ocsp-response"}
    with httpx.Client(timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=False) as client:
        with client.stream("POST", url, content=body, headers=headers) as resp:
            resp.raise_for_status()
            data = b""
            for chunk in resp.iter_bytes():
                data += chunk
                if len(data) > MAX_OCSP_BYTES:
                    raise ValueError("OCSP response exceeds size limit.")
            return data


def _ocsp_urls(cert: x509.Certificate):
    try:
        aia = cert.extensions.get_extension_for_class(x509.AuthorityInformationAccess).value
    except x509.ExtensionNotFound:
        return []
    return [
        d.access_location.value
        for d in aia
        if d.access_method == AuthorityInformationAccessOID.OCSP
        and isinstance(d.access_location, x509.UniformResourceIdentifier)
    ]


def _verify_with_key(public_key, signature: bytes, data: bytes, hash_alg) -> None:
    if isinstance(public_key, rsa.RSAPublicKey):
        public_key.verify(signature, data, padding.PKCS1v15(), hash_alg)
    elif isinstance(public_key, ec.EllipticCurvePublicKey):
        public_key.verify(signature, data, ec.ECDSA(hash_alg))
    else:
        raise InvalidSignature("unsupported responder key type")


def _responder_key(resp: ocsp.OCSPResponse, issuer: x509.Certificate, now: datetime):
    """The CA itself, or a delegated responder certificate it issued with the OCSP-signing EKU."""
    for candidate in resp.certificates:
        try:
            candidate.verify_directly_issued_by(issuer)
            eku = candidate.extensions.get_extension_for_class(x509.ExtendedKeyUsage).value
        except (ValueError, TypeError, InvalidSignature, x509.ExtensionNotFound):
            continue
        if ExtendedKeyUsageOID.OCSP_SIGNING in eku and candidate.not_valid_before_utc <= now <= candidate.not_valid_after_utc:
            return candidate.public_key()
    return issuer.public_key()


def _ocsp_check(cert, issuer, url, post, cache_seconds, now) -> str:
    """'good' or 'unknown'; raises CertificateError when the certifying authority says revoked."""
    key = (url, cert.serial_number)
    with _lock:
        cached = _ocsp_cache.get(key)
    if cached and time.time() - cached < cache_seconds:
        return "good"
    request = ocsp.OCSPRequestBuilder().add_certificate(cert, issuer, hashes.SHA1()).build()  # RFC 6960 CertID uses SHA-1
    try:
        resp = ocsp.load_der_ocsp_response(post(url, request.public_bytes(serialization.Encoding.DER)))
    except Exception as exc:  # noqa: BLE001 - network/parse failures are "unknown", not fatal
        logger.warning("OCSP request to %s failed: %s", url, exc)
        return "unknown"
    if resp.response_status != ocsp.OCSPResponseStatus.SUCCESSFUL:
        logger.warning("OCSP responder %s answered %s", url, resp.response_status.name)
        return "unknown"
    try:
        _verify_with_key(
            _responder_key(resp, issuer, now), resp.signature, resp.tbs_response_bytes, resp.signature_hash_algorithm
        )
    except (InvalidSignature, ValueError, TypeError):
        logger.warning("OCSP response from %s failed signature verification", url)
        return "unknown"
    if resp.serial_number != cert.serial_number:
        return "unknown"
    if resp.this_update_utc > now + timedelta(minutes=5) or (
        resp.next_update_utc is not None and resp.next_update_utc < now
    ):
        logger.warning("OCSP response from %s is not current", url)
        return "unknown"
    if resp.certificate_status == ocsp.OCSPCertStatus.REVOKED:
        raise CertificateError("Certificate has been revoked by its certifying authority.")
    if resp.certificate_status != ocsp.OCSPCertStatus.GOOD:
        return "unknown"
    with _lock:
        _ocsp_cache[key] = time.time()
    return "good"


def _distribution_points(cert: x509.Certificate):
    try:
        ext = cert.extensions.get_extension_for_class(x509.CRLDistributionPoints).value
    except x509.ExtensionNotFound:
        return []
    urls = []
    for dp in ext:
        for name in dp.full_name or []:
            if isinstance(name, x509.UniformResourceIdentifier):
                urls.append(name.value)
    return urls


def _load_crl(data: bytes) -> x509.CertificateRevocationList:
    try:
        return x509.load_der_x509_crl(data)
    except ValueError:
        return x509.load_pem_x509_crl(data)


def check_revocation(
    cert: x509.Certificate,
    *,
    issuer: Optional[x509.Certificate],
    mode: str,
    cache_seconds: int = 3600,
    fetch: Optional[Fetcher] = None,
    now: Optional[datetime] = None,
    ocsp_enabled: bool = False,
    ocsp_cache_seconds: int = 300,
    ocsp_post: Optional[OcspPoster] = None,
) -> str:
    """Returns 'good', 'skipped' or 'unknown'. Raises CertificateError when the cert must be refused."""
    if mode == "off":
        return "skipped"
    fetch = fetch or default_fetch  # resolved at call time so deployments/tests can swap the transport
    now = now or datetime.now(timezone.utc)

    def unknown(reason: str) -> str:
        if mode == "strict":
            raise CertificateError(f"Revocation status could not be established ({reason}).")
        logger.warning("DSC revocation status unknown: %s (serial %x)", reason, cert.serial_number)
        return "unknown"

    if issuer is None:
        return unknown("no trusted issuer configured to verify CRLs")
    if ocsp_enabled:
        post = ocsp_post or default_ocsp_post  # resolved at call time (swappable in tests/deployments)
        for responder in _ocsp_urls(cert):
            if _ocsp_check(cert, issuer, responder, post, ocsp_cache_seconds, now) == "good":
                return "good"
    urls = _distribution_points(cert)
    if not urls:
        return unknown("no OCSP or CRL answer (certificate has no usable revocation endpoint)")

    for url in urls:
        crl = None
        with _lock:
            hit = _cache.get(url)
        if hit and time.time() - hit[0] < cache_seconds:
            crl = hit[1]
        else:
            try:
                crl = _load_crl(fetch(url))
            except Exception as exc:  # noqa: BLE001 - network/parse failures are "unknown", not fatal
                logger.warning("CRL fetch failed for %s: %s", url, exc)
                continue
            with _lock:
                _cache[url] = (time.time(), crl)
        if not crl.is_signature_valid(issuer.public_key()):
            return unknown("CRL signature does not verify against the trusted issuer")
        next_update = crl.next_update_utc
        if next_update is not None and next_update < now:
            return unknown("CRL is stale (past nextUpdate)")
        if crl.get_revoked_certificate_by_serial_number(cert.serial_number) is not None:
            raise CertificateError("Certificate has been revoked by its certifying authority.")
        return "good"
    return unknown("no CRL could be retrieved")


def clear_cache() -> None:
    with _lock:
        _cache.clear()
        _ocsp_cache.clear()
