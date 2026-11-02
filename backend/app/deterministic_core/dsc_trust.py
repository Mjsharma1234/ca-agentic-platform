"""Loads the certifying-authority certificate that DSC certificates, CRLs and OCSP responses must chain to."""
from typing import Optional

from cryptography import x509


class TrustAnchorError(ValueError):
    pass


def read_trust_anchor(path: Optional[str], inline_pem: Optional[str]) -> x509.Certificate:
    """Returns the configured issuer certificate or raises TrustAnchorError with an operator-friendly message."""
    if inline_pem and inline_pem.strip():
        pem = inline_pem.replace(chr(92) + "n", chr(10))  # env vars often carry PEM newlines as a literal backslash-n
    elif path:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                pem = fh.read()
        except OSError as exc:
            raise TrustAnchorError(f"DSC_TRUSTED_CA_PEM_PATH {path!r} cannot be read ({exc.strerror or exc}).") from exc
    else:
        raise TrustAnchorError("set DSC_TRUSTED_CA_PEM_PATH (or DSC_TRUSTED_CA_PEM) to the certifying authority's PEM certificate.")
    try:
        cert = x509.load_pem_x509_certificate(pem.encode("utf-8"))
    except ValueError as exc:
        raise TrustAnchorError("the trust anchor is not a valid PEM X.509 certificate.") from exc
    try:
        ca = cert.extensions.get_extension_for_class(x509.BasicConstraints).value.ca
    except x509.ExtensionNotFound:
        ca = False
    if not ca:
        raise TrustAnchorError("the trust anchor is not a CA certificate (BasicConstraints CA=true is missing).")
    return cert
