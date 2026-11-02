"""RFC 9449 DPoP proof verification (ES256 only) for sender-constrained desktop-signer tokens.

The signer generates a P-256 key pair once, sends a signed proof with every request, and the
server binds the device (and its access tokens, via cnf.jkt) to that key's thumbprint. A stolen
access or refresh token is useless without the private key that lives only on the signer's machine.

Deviation: the access token keeps the "Bearer" scheme in Authorization (proof goes in the DPoP
header); only the sender-constraint semantics of RFC 9449 are enforced.
"""
import base64
import hashlib
import json
import time
from typing import Optional
from urllib.parse import urlsplit

import jwt
from fastapi import HTTPException, Request, status

from .config import settings
from .shared_store import get_store

PROOF_MAX_AGE_SECONDS = 60
MAX_PROOF_BYTES = 4096


class DPoPError(Exception):
    pass


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def jwk_thumbprint(jwk: dict) -> str:
    """RFC 7638 thumbprint of an EC P-256 public JWK."""
    canonical = json.dumps(
        {"crv": jwk["crv"], "kty": jwk["kty"], "x": jwk["x"], "y": jwk["y"]}, separators=(",", ":"), sort_keys=True
    )
    return _b64url(hashlib.sha256(canonical.encode("ascii")).digest())


def request_htu(request: Request) -> str:
    base = (settings.PUBLIC_API_URL or "").rstrip("/")
    if base:
        return f"{base}{request.url.path}"
    return f"{request.url.scheme}://{request.url.netloc}{request.url.path}"


def _normal(url: str):
    parts = urlsplit(url)
    default = 443 if parts.scheme.lower() == "https" else 80
    return (parts.scheme.lower(), (parts.hostname or "").lower(), parts.port or default, parts.path or "/")


def verify_dpop_proof(
    proof: str, *, method: str, htu: str, access_token: Optional[str], now: Optional[float] = None
) -> str:
    """Validates the proof and returns the key's JWK thumbprint. Raises DPoPError otherwise."""
    if not proof or len(proof) > MAX_PROOF_BYTES:
        raise DPoPError("Missing or oversized DPoP proof.")
    try:
        header = jwt.get_unverified_header(proof)
    except jwt.PyJWTError as exc:
        raise DPoPError("Malformed DPoP proof.") from exc
    if header.get("typ") != "dpop+jwt" or header.get("alg") != "ES256":
        raise DPoPError("DPoP proof must be a dpop+jwt signed with ES256.")
    jwk = header.get("jwk")
    if (
        not isinstance(jwk, dict) or jwk.get("kty") != "EC" or jwk.get("crv") != "P-256"
        or "d" in jwk or not isinstance(jwk.get("x"), str) or not isinstance(jwk.get("y"), str)
    ):
        raise DPoPError("DPoP proof must embed a public P-256 JWK.")
    try:
        key = jwt.algorithms.ECAlgorithm.from_jwk(json.dumps({k: jwk[k] for k in ("kty", "crv", "x", "y")}))
        claims = jwt.decode(
            proof, key, algorithms=["ES256"],
            options={"require": ["jti", "htm", "htu", "iat"], "verify_exp": False, "verify_aud": False,
                     "verify_iat": False, "verify_nbf": False},
        )
    except (jwt.PyJWTError, ValueError, KeyError) as exc:
        raise DPoPError("DPoP proof signature is invalid.") from exc

    if claims["htm"] != method.upper():
        raise DPoPError("DPoP proof is for a different HTTP method.")
    if not isinstance(claims["htu"], str) or _normal(claims["htu"]) != _normal(htu):
        raise DPoPError("DPoP proof is for a different URL.")
    issued = claims["iat"]
    clock = now if now is not None else time.time()
    if isinstance(issued, bool) or not isinstance(issued, (int, float)) or abs(clock - issued) > PROOF_MAX_AGE_SECONDS:
        raise DPoPError("DPoP proof is expired or from the future.")
    jti = claims["jti"]
    if not isinstance(jti, str) or not 8 <= len(jti) <= 128:
        raise DPoPError("DPoP proof has an invalid jti.")
    if access_token is not None:
        expected = _b64url(hashlib.sha256(access_token.encode("ascii", "ignore")).digest())
        if claims.get("ath") != expected:
            raise DPoPError("DPoP proof is not bound to this access token.")
    thumbprint = jwk_thumbprint(jwk)
    # Replay protection last, so garbage proofs cannot fill the store.
    if not get_store().once(f"dpop:{thumbprint}:{jti}", PROOF_MAX_AGE_SECONDS * 2 + 5):
        raise DPoPError("DPoP proof was already used.")
    return thumbprint


def require_dpop(request: Request, access_token: Optional[str]) -> str:
    """FastAPI-side helper: verifies the DPoP header on this request or raises 401 with a DPoP challenge."""
    try:
        return verify_dpop_proof(
            request.headers.get("DPoP", ""), method=request.method, htu=request_htu(request), access_token=access_token
        )
    except DPoPError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": 'DPoP error="invalid_dpop_proof", algs="ES256"'},
        ) from exc
