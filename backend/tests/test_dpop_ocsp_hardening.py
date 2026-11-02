"""DPoP-bound signer tokens, OCSP revocation, shared store and production config guards."""
import base64
import hashlib
import time
import uuid
from datetime import datetime, timedelta, timezone

import fakeredis
import jwt
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from cryptography.x509 import ocsp
from cryptography.x509.oid import AuthorityInformationAccessOID, ExtendedKeyUsageOID, NameOID

from app.api.v1 import signer_devices
from app.core import shared_store
from app.core.config import Settings, settings
from app.deterministic_core import dsc_revocation
from app.deterministic_core.dsc_signing import CertificateError
from app.deterministic_core.dsc_trust import TrustAnchorError, read_trust_anchor
from app.models import SignerDevice, SigningRequest

from .test_api_security_gates import env, open_request, reviewed, token  # noqa: F401
from .test_signer_devices_and_revocation import configure, pki, register, sign_message

BASE = "http://testserver"


@pytest.fixture(autouse=True)
def fresh_state(monkeypatch):
    shared_store.set_store(None)
    signer_devices.reset_rate_limits()
    dsc_revocation.clear_cache()
    monkeypatch.setattr(signer_devices, "POLL_INTERVAL_SECONDS", 0)
    monkeypatch.setattr(settings, "DSC_TRUSTED_CA_PEM_PATH", None)
    monkeypatch.setattr(settings, "DSC_TRUSTED_CA_PEM", None)
    monkeypatch.setattr(settings, "DSC_REVOCATION_MODE", "soft")
    monkeypatch.setattr(settings, "SIGNER_REQUIRE_DPOP", True)
    monkeypatch.setattr(settings, "PUBLIC_API_URL", None)
    yield
    shared_store.set_store(None)


# ------------------------------------------------------------------ DPoP helpers
def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


class DpopKey:
    def __init__(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        n = self.key.public_key().public_numbers()
        self.jwk = {
            "kty": "EC", "crv": "P-256",
            "x": b64url(n.x.to_bytes(32, "big")), "y": b64url(n.y.to_bytes(32, "big")),
        }

    def proof(self, method, path, access_token=None, *, iat=None, jti=None, htm=None, htu=None, alg_header=None):
        claims = {
            "jti": jti or uuid.uuid4().hex, "htm": htm or method, "htu": htu or BASE + path,
            "iat": int(time.time()) if iat is None else iat,
        }
        if access_token:
            claims["ath"] = b64url(hashlib.sha256(access_token.encode()).digest())
        return jwt.encode(claims, self.key, algorithm="ES256", headers={"typ": alg_header or "dpop+jwt", "jwk": self.jwk})


def signed_headers(tok, dp, method, path, **kw):
    return {"Authorization": f"Bearer {tok['access_token']}", "DPoP": dp.proof(method, path, tok["access_token"], **kw)}


def enrol_bound(env, partner, dp, name="WIN11-ACCT-04 signer 1.0"):
    http = env["http"]
    code = http.post("/api/v1/signing/device/code", json={"device_name": name}).json()
    ok = http.post("/api/v1/signing/device/approve", json={"user_code": code["user_code"]}, headers=token(partner))
    assert ok.status_code == 200, ok.text
    path = "/api/v1/signing/device/token"
    res = http.post(path, json={"device_code": code["device_code"]}, headers={"DPoP": dp.proof("POST", path)})
    assert res.status_code == 200, res.text
    return res.json()


# ------------------------------------------------------------------ DPoP: enrolment & use
def test_enrolment_requires_a_dpop_proof_and_binds_the_key(env):
    http, partner = env["http"], env["users"]["partner"]
    code = http.post("/api/v1/signing/device/code", json={"device_name": "WIN11-ACCT-04 signer 1.0"}).json()
    http.post("/api/v1/signing/device/approve", json={"user_code": code["user_code"]}, headers=token(partner))
    no_proof = http.post("/api/v1/signing/device/token", json={"device_code": code["device_code"]})
    assert no_proof.status_code == 401 and "DPoP" in no_proof.headers["www-authenticate"]

    dp = DpopKey()
    tok = http.post(
        "/api/v1/signing/device/token", json={"device_code": code["device_code"]},
        headers={"DPoP": dp.proof("POST", "/api/v1/signing/device/token")},
    ).json()
    claims = jwt.decode(tok["access_token"], options={"verify_signature": False})
    env["db"].expire_all()
    device = env["db"].query(SignerDevice).one()
    assert device.dpop_jkt and claims["cnf"] == {"jkt": device.dpop_jkt}


def test_signing_flow_works_end_to_end_with_dpop(env):
    reviewed(env)
    partner, dp = env["users"]["partner"], DpopKey()
    m = pki(with_cdp=False)
    assert register(env, partner, m["leaf_pem"]).status_code == 201
    tok = enrol_bound(env, partner, dp)
    assert open_request(env, token(env["users"]["manager"]), partner).status_code == 201
    pend = "/api/v1/signing/requests/pending"
    pending = env["http"].get(pend, headers=signed_headers(tok, dp, "GET", pend)).json()[0]
    path = f"/api/v1/signing/requests/{pending['id']}/complete"
    done = env["http"].post(
        path, json={"signature_b64": sign_message(m["key"], pending["message_b64"]), "certificate_pem": m["leaf_pem"]},
        headers=signed_headers(tok, dp, "POST", path),
    )
    assert done.status_code == 200 and done.json()["status"] == "SIGNED"


@pytest.mark.parametrize("mutate", ["no_header", "replay", "wrong_method", "wrong_url", "stale", "future",
                                    "no_ath", "wrong_ath", "wrong_typ", "other_key", "garbage"])
def test_bad_dpop_proofs_are_refused(env, mutate):
    partner, dp = env["users"]["partner"], DpopKey()
    tok = enrol_bound(env, partner, dp)
    http, path = env["http"], "/api/v1/signing/requests/pending"
    at = tok["access_token"]
    if mutate == "replay":
        headers = signed_headers(tok, dp, "GET", path)
        assert http.get(path, headers=headers).status_code == 200
        res = http.get(path, headers=headers)
    else:
        auth = {"Authorization": f"Bearer {at}"}
        proofs = {
            "no_header": None,
            "wrong_method": dp.proof("POST", path, at),
            "wrong_url": dp.proof("GET", path + "x", at),
            "stale": dp.proof("GET", path, at, iat=int(time.time()) - 600),
            "future": dp.proof("GET", path, at, iat=int(time.time()) + 600),
            "no_ath": dp.proof("GET", path, None),
            "wrong_ath": dp.proof("GET", path, "some.other.token"),
            "wrong_typ": dp.proof("GET", path, at, alg_header="JWT"),
            "other_key": DpopKey().proof("GET", path, at),
            "garbage": "not-a-jwt",
        }
        if proofs[mutate] is not None:
            auth["DPoP"] = proofs[mutate]
        res = http.get(path, headers=auth)
    assert res.status_code == 401, (mutate, res.text)


def test_bearer_only_use_of_a_stolen_token_fails_and_refresh_without_the_key_does_not_rotate(env):
    partner, dp = env["users"]["partner"], DpopKey()
    tok = enrol_bound(env, partner, dp)
    http = env["http"]
    assert http.get("/api/v1/signing/requests/pending", headers={"Authorization": f"Bearer {tok['access_token']}"}).status_code == 401
    # attacker with only the refresh token (no key)
    stolen = http.post("/api/v1/signing/device/refresh", json={"refresh_token": tok["refresh_token"]})
    assert stolen.status_code == 401
    forged = http.post(
        "/api/v1/signing/device/refresh", json={"refresh_token": tok["refresh_token"]},
        headers={"DPoP": DpopKey().proof("POST", "/api/v1/signing/device/refresh")},
    )
    assert forged.status_code == 401 and forged.json()["detail"]["error"] == "invalid_grant"
    # the legitimate signer can still refresh with the original refresh token (it was not consumed)
    ok = http.post(
        "/api/v1/signing/device/refresh", json={"refresh_token": tok["refresh_token"]},
        headers={"DPoP": dp.proof("POST", "/api/v1/signing/device/refresh")},
    )
    assert ok.status_code == 200
    new = ok.json()
    path = "/api/v1/signing/requests/pending"
    assert http.get(path, headers=signed_headers(new, dp, "GET", path)).status_code == 200


def test_access_token_from_one_device_cannot_be_used_with_another_devices_key(env):
    partner, a, b = env["users"]["partner"], DpopKey(), DpopKey()
    tok_a = enrol_bound(env, partner, a, "WIN11-ACCT-01 signer")
    enrol_bound(env, partner, b, "WIN11-ACCT-02 signer")
    path = "/api/v1/signing/requests/pending"
    res = env["http"].get(path, headers=signed_headers(tok_a, b, "GET", path))
    assert res.status_code == 401


def test_unbound_legacy_device_is_refused_when_dpop_required_and_works_when_not(env, monkeypatch):
    partner = env["users"]["partner"]
    monkeypatch.setattr(settings, "SIGNER_REQUIRE_DPOP", False)
    http = env["http"]
    code = http.post("/api/v1/signing/device/code", json={"device_name": "legacy signer 0.9"}).json()
    http.post("/api/v1/signing/device/approve", json={"user_code": code["user_code"]}, headers=token(partner))
    tok = http.post("/api/v1/signing/device/token", json={"device_code": code["device_code"]}).json()
    path = "/api/v1/signing/requests/pending"
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    assert http.get(path, headers=h).status_code == 200
    monkeypatch.setattr(settings, "SIGNER_REQUIRE_DPOP", True)
    refused = http.get(path, headers=h)
    assert refused.status_code == 401 and "Re-enrol" in refused.json()["detail"]


def test_dpop_htu_uses_public_api_url_behind_a_proxy(env, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_API_URL", "https://api.example.com")
    partner, dp = env["users"]["partner"], DpopKey()
    http = env["http"]
    code = http.post("/api/v1/signing/device/code", json={"device_name": "proxy signer 1.0"}).json()
    http.post("/api/v1/signing/device/approve", json={"user_code": code["user_code"]}, headers=token(partner))
    path = "/api/v1/signing/device/token"
    ok = http.post(path, json={"device_code": code["device_code"]},
                   headers={"DPoP": dp.proof("POST", path, htu="https://api.example.com" + path)})
    assert ok.status_code == 200, ok.text


# ------------------------------------------------------------------ shared store
def test_shared_store_rate_limit_and_replay_work_across_instances():
    server = fakeredis.FakeServer()
    a = shared_store.SharedStore(fakeredis.FakeRedis(server=server))
    b = shared_store.SharedStore(fakeredis.FakeRedis(server=server))  # a "second worker"
    assert all(a.allow("k", 3, 60) for _ in range(2)) and b.allow("k", 3, 60)
    assert not a.allow("k", 3, 60) and not b.allow("k", 3, 60)
    assert a.once("jti", 60) and not b.once("jti", 60)
    a.reset()
    assert b.once("jti", 60)


def test_shared_store_degrades_to_memory_when_redis_fails():
    class Broken:
        def pipeline(self):
            raise ConnectionError("down")

        def set(self, *a, **k):
            raise ConnectionError("down")

    s = shared_store.SharedStore(Broken())
    assert s.allow("k", 1, 60) and not s.allow("k", 1, 60)
    assert s.once("x", 60) and not s.once("x", 60)


def test_rate_limit_endpoint_uses_the_shared_store(env):
    shared_store.set_store(shared_store.SharedStore(fakeredis.FakeRedis()))
    codes = [env["http"].post("/api/v1/signing/device/code", json={"device_name": "burst signer 1.0"}).status_code
             for _ in range(11)]
    assert codes[:10] == [200] * 10 and codes[10] == 429


# ------------------------------------------------------------------ OCSP
def make_ocsp_pki(*, aia=True, cdp=False, delegated=False):
    now = datetime.now(timezone.utc)
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "OCSP Test CA")])
    ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name).public_key(ca_key.public_key())
          .serial_number(x509.random_serial_number()).not_valid_before(now - timedelta(days=30))
          .not_valid_after(now + timedelta(days=3650))
          .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True).sign(ca_key, hashes.SHA256()))
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    b = (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "CA Partner")]))
         .issuer_name(ca_name).public_key(key.public_key()).serial_number(x509.random_serial_number())
         .not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=365)))
    if aia:
        b = b.add_extension(x509.AuthorityInformationAccess([x509.AccessDescription(
            AuthorityInformationAccessOID.OCSP, x509.UniformResourceIdentifier("http://ocsp.test.example"))]), critical=False)
    if cdp:
        b = b.add_extension(x509.CRLDistributionPoints([x509.DistributionPoint(
            full_name=[x509.UniformResourceIdentifier("http://crl.test.example/ca.crl")], relative_name=None,
            reasons=None, crl_issuer=None)]), critical=False)
    leaf = b.sign(ca_key, hashes.SHA256())
    out = {"ca": ca, "ca_key": ca_key, "leaf": leaf, "key": key, "now": now}
    if delegated:
        rkey = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        out["responder_key"] = rkey
        out["responder"] = (
            x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "OCSP Responder")]))
            .issuer_name(ca_name).public_key(rkey.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=30))
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.OCSP_SIGNING]), critical=False)
            .sign(ca_key, hashes.SHA256())
        )
    return out


def ocsp_der(m, status, *, sign_key=None, this_update=None, next_update=None, with_responder=False):
    now = m["now"]
    revoked = status == ocsp.OCSPCertStatus.REVOKED
    builder = ocsp.OCSPResponseBuilder().add_response(
        cert=m["leaf"], issuer=m["ca"], algorithm=hashes.SHA1(), cert_status=status,
        this_update=this_update or now - timedelta(minutes=5), next_update=next_update or now + timedelta(days=1),
        revocation_time=now - timedelta(days=1) if revoked else None,
        revocation_reason=x509.ReasonFlags.key_compromise if revoked else None,
    )
    responder = m.get("responder") if with_responder else m["ca"]
    key = sign_key or (m["responder_key"] if with_responder else m["ca_key"])
    if sign_key is not None:
        # a stranger's self-signed "responder": not issued by the CA, so it must never be trusted
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Evil Responder")])
        responder = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
                     .serial_number(x509.random_serial_number()).not_valid_before(now - timedelta(days=1))
                     .not_valid_after(now + timedelta(days=30))
                     .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.OCSP_SIGNING]), critical=False)
                     .sign(key, hashes.SHA256()))
    builder = builder.responder_id(ocsp.OCSPResponderEncoding.HASH, responder)
    if with_responder or sign_key is not None:
        builder = builder.certificates([responder])
    return builder.sign(key, hashes.SHA256()).public_bytes(serialization.Encoding.DER)


def run_check(m, post, mode="soft", **kw):
    return dsc_revocation.check_revocation(
        m["leaf"], issuer=m["ca"], mode=mode, fetch=kw.pop("fetch", lambda url: (_ for _ in ()).throw(OSError("no crl"))),
        ocsp_enabled=True, ocsp_post=post, **kw,
    )


def test_ocsp_good_is_accepted_and_cached():
    m, calls = make_ocsp_pki(), []
    resp = ocsp_der(m, ocsp.OCSPCertStatus.GOOD)

    def post(url, body):
        calls.append(url)
        return resp

    assert run_check(m, post, "strict") == "good"
    assert run_check(m, post, "strict") == "good"
    assert calls == ["http://ocsp.test.example"]  # second answer came from the cache


def test_ocsp_revoked_is_refused_in_every_mode():
    m = make_ocsp_pki()
    resp = ocsp_der(m, ocsp.OCSPCertStatus.REVOKED)
    for mode in ("soft", "strict"):
        with pytest.raises(CertificateError, match="revoked"):
            run_check(m, lambda u, b: resp, mode)


def test_ocsp_delegated_responder_is_accepted():
    m = make_ocsp_pki(delegated=True)
    assert run_check(m, lambda u, b: ocsp_der(m, ocsp.OCSPCertStatus.GOOD, with_responder=True), "strict") == "good"


def test_ocsp_response_signed_by_a_stranger_is_not_believed():
    m = make_ocsp_pki()
    forged = ocsp_der(m, ocsp.OCSPCertStatus.GOOD, sign_key=rsa.generate_private_key(public_exponent=65537, key_size=2048))
    assert run_check(m, lambda u, b: forged, "soft") == "unknown"
    with pytest.raises(CertificateError):
        run_check(m, lambda u, b: forged, "strict")
    # and a forged "revoked"/"good" can neither hide nor fake a revocation
    forged_revoked = ocsp_der(m, ocsp.OCSPCertStatus.REVOKED, sign_key=rsa.generate_private_key(public_exponent=65537, key_size=2048))
    assert run_check(m, lambda u, b: forged_revoked, "soft") == "unknown"


def test_ocsp_stale_or_unknown_or_unreachable_responses():
    m = make_ocsp_pki()
    now = m["now"]
    stale = ocsp_der(m, ocsp.OCSPCertStatus.GOOD, this_update=now - timedelta(days=3), next_update=now - timedelta(days=1))
    assert run_check(m, lambda u, b: stale, "soft") == "unknown"
    unknown = ocsp_der(m, ocsp.OCSPCertStatus.UNKNOWN)
    assert run_check(m, lambda u, b: unknown, "soft") == "unknown"

    def down(url, body):
        raise OSError("connection refused")

    assert run_check(m, down, "soft") == "unknown"
    with pytest.raises(CertificateError):
        run_check(m, down, "strict")
    malformed_ok = ocsp.OCSPResponseBuilder.build_unsuccessful(ocsp.OCSPResponseStatus.TRY_LATER).public_bytes(serialization.Encoding.DER)
    assert run_check(m, lambda u, b: malformed_ok, "soft") == "unknown"


def test_ocsp_failure_falls_back_to_the_crl():
    m = make_ocsp_pki(cdp=True)
    now = m["now"]
    crl = (x509.CertificateRevocationListBuilder().issuer_name(m["ca"].subject).last_update(now - timedelta(hours=1))
           .next_update(now + timedelta(days=7))
           .add_revoked_certificate(x509.RevokedCertificateBuilder().serial_number(m["leaf"].serial_number).revocation_date(now).build())
           .sign(m["ca_key"], hashes.SHA256()).public_bytes(serialization.Encoding.DER))

    def down(url, body):
        raise OSError("responder down")

    with pytest.raises(CertificateError, match="revoked"):
        run_check(m, down, "soft", fetch=lambda url: crl)


def test_ocsp_url_to_a_private_address_is_never_contacted():
    with pytest.raises(ValueError):
        dsc_revocation.default_ocsp_post("http://127.0.0.1/ocsp", b"x")
    with pytest.raises(ValueError):
        dsc_revocation.default_ocsp_post("file:///etc/passwd", b"x")


def test_registration_refused_when_the_ocsp_responder_says_revoked(env, monkeypatch, tmp_path):
    m = make_ocsp_pki()
    ca_file = tmp_path / "ca.pem"
    ca_file.write_bytes(m["ca"].public_bytes(serialization.Encoding.PEM))
    monkeypatch.setattr(settings, "DSC_TRUSTED_CA_PEM_PATH", str(ca_file))
    resp = ocsp_der(m, ocsp.OCSPCertStatus.REVOKED)
    monkeypatch.setattr(dsc_revocation, "default_ocsp_post", lambda url, body: resp)
    res = register(env, env["users"]["partner"], m["leaf"].public_bytes(serialization.Encoding.PEM).decode())
    assert res.status_code == 422 and "revoked" in res.text.lower()


# ------------------------------------------------------------------ trust anchor & production config
def ca_pem(ca=True):
    m = make_ocsp_pki()
    cert = m["ca"] if ca else m["leaf"]
    return cert.public_bytes(serialization.Encoding.PEM).decode()


def prod(**over):
    base = dict(
        DEBUG=False, SECRET_KEY="k" * 40, OTP_SANDBOX_MODE=False, PUBLIC_WEB_URL="https://app.example.com",
        PUBLIC_API_URL="https://api.example.com", DSC_TRUSTED_CA_PEM=ca_pem(), DSC_REVOCATION_MODE="strict",
    )
    base.update(over)
    return Settings(_env_file=None, **base)


def test_production_boots_with_a_complete_configuration():
    assert prod().DEBUG is False
    assert prod(DSC_REVOCATION_MODE="soft")


@pytest.mark.parametrize("over,needle", [
    ({"DSC_TRUSTED_CA_PEM": None}, "trust anchor"),
    ({"DSC_TRUSTED_CA_PEM": "not a pem"}, "valid PEM"),
    ({"DSC_TRUSTED_CA_PEM": ca_pem(ca=False)}, "not a CA"),
    ({"DSC_TRUSTED_CA_PEM": None, "DSC_TRUSTED_CA_PEM_PATH": "/does/not/exist.pem"}, "cannot be read"),
    ({"DSC_REVOCATION_MODE": "off"}, "soft or strict"),
    ({"PUBLIC_WEB_URL": "http://app.example.com"}, "https"),
    ({"PUBLIC_API_URL": None}, "PUBLIC_API_URL"),
    ({"PUBLIC_API_URL": "http://api.example.com"}, "PUBLIC_API_URL"),
])
def test_production_refuses_to_boot_on_unsafe_dsc_or_url_config(over, needle):
    with pytest.raises(ValueError, match=needle):
        prod(**over)


def test_production_without_dpop_does_not_need_a_public_api_url():
    assert prod(SIGNER_REQUIRE_DPOP=False, PUBLIC_API_URL=None)


def test_dev_mode_does_not_require_a_trust_anchor():
    assert Settings(_env_file=None, DEBUG=True).DSC_TRUSTED_CA_PEM is None


def test_trust_anchor_loader_accepts_path_inline_and_escaped_newlines(tmp_path):
    pem = ca_pem()
    f = tmp_path / "ca.pem"
    f.write_text(pem)
    assert read_trust_anchor(str(f), None).subject == read_trust_anchor(None, pem).subject
    assert read_trust_anchor(None, pem.strip().replace("\n", "\\n")).subject
    with pytest.raises(TrustAnchorError):
        read_trust_anchor(None, None)


def test_signing_returns_503_not_a_silent_pass_when_the_anchor_is_unreadable(env, monkeypatch):
    monkeypatch.setattr(settings, "DSC_TRUSTED_CA_PEM_PATH", "/nonexistent/ca.pem")
    m = pki(with_cdp=False)
    res = register(env, env["users"]["partner"], m["leaf_pem"])
    assert res.status_code == 503 and "trust anchor" in res.text
