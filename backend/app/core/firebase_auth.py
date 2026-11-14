"""Verification of Firebase Authentication ID tokens (phone OTP sign-in).

Implements Google's documented checks (https://firebase.google.com/docs/auth/admin/verify-id-tokens) with PyJWT, so
no service-account credential is needed on the server, only the project id:

  * RS256 signature against Google's published securetoken certificates, selected by `kid`
  * `aud` == project id, `iss` == https://securetoken.google.com/<project id>, `exp`/`iat` valid
  * non-empty `sub` (the Firebase uid)
  * the sign-in was by phone OTP and carries an E.164 `phone_number`
  * `auth_time` is recent: a leaked or old token cannot start a new session
  * each token can be exchanged once (replay cache), so a token captured in transit is worthless

There is deliberately no "accept unverified" fallback.
"""
import hashlib
import re
import threading
import time
from typing import Any, Dict, Optional

import httpx
import jwt
from cryptography import x509

from .shared_store import get_store

CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_E164 = re.compile(r"^\+[1-9]\d{7,14}$")

_lock = threading.Lock()
_certs: Dict[str, Any] = {"keys": {}, "expires": 0.0}


class FirebaseAuthError(Exception):
    """The ID token is not acceptable. The message is safe to log, never to show to the caller verbatim."""


def _fetch_certs() -> tuple:
    """Returns ({kid: public_key}, max_age_seconds). Replaced in tests."""
    resp = httpx.get(CERTS_URL, timeout=5.0)
    resp.raise_for_status()
    keys = {
        kid: x509.load_pem_x509_certificate(pem.encode("utf-8")).public_key()
        for kid, pem in resp.json().items()
    }
    match = re.search(r"max-age=(\d+)", resp.headers.get("cache-control", ""))
    return keys, int(match.group(1)) if match else 3600


def _signing_key(kid: Optional[str]):
    now = time.time()
    with _lock:
        stale = now >= _certs["expires"] or (kid is not None and kid not in _certs["keys"])
        # Google rotates keys; a token signed by an unknown kid may just mean our cache is old. Refetch at most
        # once a minute so a stream of garbage tokens cannot turn into a stream of outbound requests.
        if stale and now - _certs.get("fetched", 0.0) > 60:
            try:
                keys, max_age = _fetch_certs()
            except Exception as exc:  # network or parse failure: keep serving the cache if we have one
                if not _certs["keys"]:
                    raise FirebaseAuthError(f"could not load Google signing certificates: {exc}") from exc
            else:
                _certs.update(keys=keys, expires=now + max_age, fetched=now)
        key = _certs["keys"].get(kid or "")
    if key is None:
        raise FirebaseAuthError("token signed with an unknown key id")
    return key


def clear_cache() -> None:
    with _lock:
        _certs.update(keys={}, expires=0.0, fetched=0.0)


def verify_firebase_phone_token(
    token: str, *, project_id: str, max_auth_age_seconds: int = 300, now: Optional[float] = None
) -> Dict[str, Any]:
    """Returns the verified claims (uid, phone_number, auth_time, ...) or raises FirebaseAuthError."""
    if not project_id:
        raise FirebaseAuthError("FIREBASE_PROJECT_ID is not configured")
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise FirebaseAuthError("malformed token") from exc
    if header.get("alg") != "RS256":
        raise FirebaseAuthError("unexpected signing algorithm")
    key = _signing_key(header.get("kid"))
    try:
        claims = jwt.decode(
            token, key, algorithms=["RS256"], audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}",
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
            leeway=10,
        )
    except jwt.PyJWTError as exc:
        raise FirebaseAuthError(f"token rejected: {exc}") from exc

    uid = claims.get("sub")
    if not isinstance(uid, str) or not uid or len(uid) > 128:
        raise FirebaseAuthError("invalid subject")
    if (claims.get("firebase") or {}).get("sign_in_provider") != "phone":
        raise FirebaseAuthError("token is not from phone OTP sign-in")
    phone = claims.get("phone_number")
    if not isinstance(phone, str) or not _E164.match(phone):
        raise FirebaseAuthError("token has no verified E.164 phone number")

    clock = now if now is not None else time.time()
    auth_time = claims.get("auth_time")
    if not isinstance(auth_time, (int, float)) or auth_time > clock + 10:
        raise FirebaseAuthError("invalid auth_time")
    if clock - auth_time > max_auth_age_seconds:
        raise FirebaseAuthError("sign-in is too old; verify the phone number again")

    # One exchange per token: replay of a captured token is refused for as long as it could be valid.
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    if not get_store().once(f"fb-token:{digest}", max_auth_age_seconds + 3600):
        raise FirebaseAuthError("token already used")
    return claims
