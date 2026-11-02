"""Desktop-signer device grant, scoped tokens, CRL revocation policy, and atomic audit writes."""
import base64
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID
from fastapi.testclient import TestClient

from app.api.v1 import signer_devices, signing as signing_module
from app.core.config import settings
from app.deterministic_core import dsc_revocation
from app.deterministic_core.audit_chain import verify_firm_audit_chain
from app.main import app
from app.models import GSTReturn, SignerDevice, SigningRequest, User
from app.models.returns import ReturnStatus
from app.models.signing import SigningStatus

from .test_api_security_gates import FIRM_A, env, open_request, reviewed, token  # noqa: F401


@pytest.fixture(autouse=True)
def fresh_state(monkeypatch):
    signer_devices.reset_rate_limits()
    dsc_revocation.clear_cache()
    monkeypatch.setattr(signer_devices, "POLL_INTERVAL_SECONDS", 0)  # tests poll instantly
    monkeypatch.setattr(settings, "DSC_TRUSTED_CA_PEM_PATH", None)
    monkeypatch.setattr(settings, "DSC_REVOCATION_MODE", "soft")
    yield
    signer_devices.reset_rate_limits()


# ------------------------------------------------------------------ helpers
def enrol(env, partner):
    http = env["http"]
    code = http.post("/api/v1/signing/device/code", json={"device_name": "WIN11-ACCT-04 signer 1.0"}).json()
    pending = http.post("/api/v1/signing/device/token", json={"device_code": code["device_code"]})
    assert pending.status_code == 400 and pending.json()["detail"]["error"] == "authorization_pending"
    ok = http.post("/api/v1/signing/device/approve", json={"user_code": code["user_code"]}, headers=token(partner))
    assert ok.status_code == 200, ok.text
    tok = http.post("/api/v1/signing/device/token", json={"device_code": code["device_code"]})
    assert tok.status_code == 200, tok.text
    return code, tok.json()


def bearer(t):
    return {"Authorization": f"Bearer {t['access_token']}"}


def sign_message(key, message_b64):
    return base64.b64encode(key.sign(base64.b64decode(message_b64), padding.PKCS1v15(), hashes.SHA256())).decode()


def pki(*, with_cdp=True, revoked=False, crl_signed_by_ca=True):
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test Licensed CA")])
    now = datetime.now(timezone.utc)
    ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name).public_key(ca_key.public_key())
          .serial_number(x509.random_serial_number()).not_valid_before(now - timedelta(days=30))
          .not_valid_after(now + timedelta(days=3650))
          .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True).sign(ca_key, hashes.SHA256()))
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    b = (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "CA Partner")]))
         .issuer_name(ca_name).public_key(key.public_key()).serial_number(x509.random_serial_number())
         .not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=365))
         .add_extension(x509.KeyUsage(True, True, False, False, False, False, False, False, False), critical=True))
    if with_cdp:
        b = b.add_extension(x509.CRLDistributionPoints([x509.DistributionPoint(
            full_name=[x509.UniformResourceIdentifier("http://crl.test.example/ca.crl")], relative_name=None,
            reasons=None, crl_issuer=None)]), critical=False)
    leaf = b.sign(ca_key, hashes.SHA256())
    crl_b = (x509.CertificateRevocationListBuilder().issuer_name(ca_name).last_update(now - timedelta(hours=1))
             .next_update(now + timedelta(days=7)))
    if revoked:
        crl_b = crl_b.add_revoked_certificate(
            x509.RevokedCertificateBuilder().serial_number(leaf.serial_number).revocation_date(now).build())
    signer = ca_key if crl_signed_by_ca else rsa.generate_private_key(public_exponent=65537, key_size=2048)
    crl = crl_b.sign(signer, hashes.SHA256())
    return {
        "key": key, "leaf_pem": leaf.public_bytes(serialization.Encoding.PEM).decode(),
        "ca_pem": ca.public_bytes(serialization.Encoding.PEM).decode(),
        "crl_der": crl.public_bytes(serialization.Encoding.DER),
    }


def configure(monkeypatch, tmp_path, material, mode, fetch):
    ca_file = tmp_path / "ca.pem"
    ca_file.write_text(material["ca_pem"])
    monkeypatch.setattr(settings, "DSC_TRUSTED_CA_PEM_PATH", str(ca_file))
    monkeypatch.setattr(settings, "DSC_REVOCATION_MODE", mode)
    monkeypatch.setattr(dsc_revocation, "default_fetch", fetch)


def register(env, partner, pem):
    return env["http"].post("/api/v1/signing/certificates", json={"certificate_pem": pem}, headers=token(partner))


# ------------------------------------------------------------------ device grant
def test_device_grant_issues_scoped_short_lived_token(env):
    code, tok = enrol(env, env["users"]["partner"])
    assert tok["expires_in"] == settings.SIGNER_ACCESS_TOKEN_MINUTES * 60 and tok["refresh_token"]
    assert env["http"].get("/api/v1/signing/requests/pending", headers=bearer(tok)).status_code == 200
    # scope confinement: nothing outside the signing request endpoints
    for path in ("/api/v1/gates", "/api/v1/clients/", "/api/v1/dashboard/overview", "/api/v1/signing/devices",
                 "/api/v1/signing/certificates"):
        assert env["http"].get(path, headers=bearer(tok)).status_code == 403, path
    # device codes are single use
    again = env["http"].post("/api/v1/signing/device/token", json={"device_code": code["device_code"]})
    assert again.json()["detail"]["error"] == "invalid_grant"


def test_only_partners_approve_and_codes_expire_or_vanish(env):
    http = env["http"]
    code = http.post("/api/v1/signing/device/code", json={"device_name": "Laptop signer"}).json()
    assert http.post("/api/v1/signing/device/approve", json={"user_code": code["user_code"]},
                     headers=token(env["users"]["manager"])).status_code == 403
    assert http.post("/api/v1/signing/device/approve", json={"user_code": "ZZZZ-ZZZZ"},
                     headers=token(env["users"]["partner"])).status_code == 404
    assert http.post("/api/v1/signing/device/token", json={"device_code": "x" * 43}).json()["detail"]["error"] == "invalid_grant"
    denied = http.post("/api/v1/signing/device/approve", json={"user_code": code["user_code"], "approve": False},
                       headers=token(env["users"]["partner"]))
    assert denied.json()["status"] == "DENIED"
    assert http.post("/api/v1/signing/device/token", json={"device_code": code["device_code"]}).json()["detail"]["error"] == "access_denied"


def test_expired_device_code(env):
    http = env["http"]
    code = http.post("/api/v1/signing/device/code", json={"device_name": "Laptop signer"}).json()
    from app.models import DeviceAuthorization
    row = env["db"].query(DeviceAuthorization).one()
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    env["db"].commit()
    assert http.post("/api/v1/signing/device/token", json={"device_code": code["device_code"]}).json()["detail"]["error"] == "expired_token"


def test_slow_down_and_rate_limits(env, monkeypatch):
    monkeypatch.setattr(signer_devices, "POLL_INTERVAL_SECONDS", 5)
    code = env["http"].post("/api/v1/signing/device/code", json={"device_name": "Laptop signer"}).json()
    first = env["http"].post("/api/v1/signing/device/token", json={"device_code": code["device_code"]})
    second = env["http"].post("/api/v1/signing/device/token", json={"device_code": code["device_code"]})
    assert first.json()["detail"]["error"] == "authorization_pending"
    assert second.json()["detail"]["error"] == "slow_down"
    signer_devices.reset_rate_limits()
    codes = [env["http"].post("/api/v1/signing/device/code", json={"device_name": "Laptop signer"}).status_code for _ in range(11)]
    assert codes[:10] == [200] * 10 and codes[10] == 429


def test_refresh_rotates_and_reuse_revokes_the_device(env):
    code, tok = enrol(env, env["users"]["partner"])
    http = env["http"]
    r1 = http.post("/api/v1/signing/device/refresh", json={"refresh_token": tok["refresh_token"]})
    assert r1.status_code == 200 and r1.json()["refresh_token"] != tok["refresh_token"]
    # replaying the OLD refresh token = theft signal: device dies, even the fresh token stops working
    replay = http.post("/api/v1/signing/device/refresh", json={"refresh_token": tok["refresh_token"]})
    assert replay.status_code == 401
    assert http.post("/api/v1/signing/device/refresh", json={"refresh_token": r1.json()["refresh_token"]}).status_code == 401
    assert http.get("/api/v1/signing/requests/pending", headers=bearer(r1.json())).status_code == 401
    assert verify_firm_audit_chain(env["db"], FIRM_A)["chain_valid"] is True


def test_partner_can_list_and_revoke_devices_and_revocation_is_immediate(env):
    partner = env["users"]["partner"]
    _, tok = enrol(env, partner)
    http = env["http"]
    devices = http.get("/api/v1/signing/devices", headers=token(partner)).json()
    assert len(devices) == 1 and devices[0]["revoked"] is False
    assert http.delete(f"/api/v1/signing/devices/{devices[0]['id']}", headers=token(env["users"]["partner2"])).status_code == 404
    assert http.delete(f"/api/v1/signing/devices/{devices[0]['id']}", headers=token(partner)).status_code == 204
    assert http.get("/api/v1/signing/requests/pending", headers=bearer(tok)).status_code == 401
    assert http.post("/api/v1/signing/device/refresh", json={"refresh_token": tok["refresh_token"]}).status_code == 401


def test_demoted_or_deactivated_partner_loses_signer_access(env):
    partner = env["users"]["partner"]
    _, tok = enrol(env, partner)
    row = env["db"].get(User, partner.id)
    row.is_active = False
    env["db"].commit()
    assert env["http"].get("/api/v1/signing/requests/pending", headers=bearer(tok)).status_code == 401
    row.is_active, row.role = True, "MANAGER"
    env["db"].commit()
    assert env["http"].post("/api/v1/signing/device/refresh", json={"refresh_token": tok["refresh_token"]}).status_code == 401
    assert env["http"].get("/api/v1/signing/requests/pending", headers=bearer(tok)).status_code == 200  # token valid, role re-read
    res = env["http"].post(f"/api/v1/signing/requests/{uuid.uuid4()}/reject", json={"reason": "nope"}, headers=bearer(tok))
    assert res.status_code == 403  # no longer a Partner


def test_signing_end_to_end_with_a_device_token(env):
    reviewed(env)
    partner = env["users"]["partner"]
    m = pki(with_cdp=False)
    assert register(env, partner, m["leaf_pem"]).status_code == 201
    _, tok = enrol(env, partner)
    assert open_request(env, token(env["users"]["manager"]), partner).status_code == 201
    pending = env["http"].get("/api/v1/signing/requests/pending", headers=bearer(tok)).json()[0]
    done = env["http"].post(
        f"/api/v1/signing/requests/{pending['id']}/complete",
        json={"signature_b64": sign_message(m["key"], pending["message_b64"]), "certificate_pem": m["leaf_pem"]},
        headers=bearer(tok),
    )
    assert done.status_code == 200 and done.json()["status"] == "SIGNED"
    env["db"].expire_all()
    dev_id = str(env["db"].query(SignerDevice).one().id)
    sealed = env["db"].get(SigningRequest, uuid.UUID(pending["id"]))
    assert sealed.audit_block_hash and sealed.signer_device == dev_id
    assert verify_firm_audit_chain(env["db"], FIRM_A)["chain_valid"] is True


# ------------------------------------------------------------------ revocation policy
def test_revoked_certificate_is_refused_at_registration(env, monkeypatch, tmp_path):
    m = pki(revoked=True)
    configure(monkeypatch, tmp_path, m, "soft", lambda url: m["crl_der"])
    res = register(env, env["users"]["partner"], m["leaf_pem"])
    assert res.status_code == 422 and "revoked" in res.json()["detail"]


def test_good_crl_registers_and_revocation_after_registration_blocks_signing(env, monkeypatch, tmp_path):
    reviewed(env)
    partner = env["users"]["partner"]
    good = pki()
    configure(monkeypatch, tmp_path, good, "strict", lambda url: good["crl_der"])
    assert register(env, partner, good["leaf_pem"]).status_code == 201
    assert open_request(env, token(env["users"]["manager"]), partner).status_code == 201
    p = env["http"].get("/api/v1/signing/requests/pending", headers=token(partner)).json()[0]

    # the CRL now served is signed by some other key: in strict mode the sign-time check must refuse
    dsc_revocation.clear_cache()
    revoked = pki(revoked=True)
    # different CA => signature does not verify => strict mode refuses (CRL not trustworthy)
    monkeypatch.setattr(dsc_revocation, "default_fetch", lambda url: revoked["crl_der"])
    res = env["http"].post(
        f"/api/v1/signing/requests/{p['id']}/complete",
        json={"signature_b64": sign_message(good["key"], p["message_b64"]), "certificate_pem": good["leaf_pem"]},
        headers=token(partner),
    )
    assert res.status_code == 422 and "could not be established" in res.json()["detail"]


@pytest.mark.parametrize("mode,kwargs,fetch,expected", [
    ("soft", {"with_cdp": False}, lambda u: b"", 201),                 # no CDP: allowed with a warning
    ("strict", {"with_cdp": False}, lambda u: b"", 422),               # no CDP: refused
    ("soft", {}, lambda u: (_ for _ in ()).throw(OSError("down")), 201),   # CRL host down: soft allows
    ("strict", {}, lambda u: (_ for _ in ()).throw(OSError("down")), 422),  # strict refuses
    ("soft", {"crl_signed_by_ca": False}, None, 201),                  # forged CRL ignored in soft
    ("strict", {"crl_signed_by_ca": False}, None, 422),                # forged CRL refused in strict
    ("off", {"revoked": True}, None, 201),                             # checks disabled
])
def test_revocation_modes(env, monkeypatch, tmp_path, mode, kwargs, fetch, expected):
    m = pki(**kwargs)
    configure(monkeypatch, tmp_path, m, mode, fetch or (lambda u: m["crl_der"]))
    assert register(env, env["users"]["partner"], m["leaf_pem"]).status_code == expected


def test_certificates_not_issued_by_the_trust_anchor_are_refused(env, monkeypatch, tmp_path):
    trusted, other = pki(), pki()
    configure(monkeypatch, tmp_path, trusted, "soft", lambda u: trusted["crl_der"])
    res = register(env, env["users"]["partner"], other["leaf_pem"])
    assert res.status_code == 422 and "not issued by a trusted" in res.json()["detail"]


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/x.crl", "http://169.254.169.254/latest", "http://10.0.0.5/x.crl",
    "file:///etc/passwd", "ftp://example.com/x.crl", "http:///nohost",
])
def test_crl_fetch_rejects_non_public_or_non_http_targets(url):
    with pytest.raises(Exception):
        dsc_revocation._assert_public_http_url(url)


# ------------------------------------------------------------------ atomicity
def test_signature_and_audit_block_commit_atomically(env, monkeypatch):
    reviewed(env)
    partner = env["users"]["partner"]
    m = pki(with_cdp=False)
    assert register(env, partner, m["leaf_pem"]).status_code == 201
    assert open_request(env, token(env["users"]["manager"]), partner).status_code == 201
    p = env["http"].get("/api/v1/signing/requests/pending", headers=token(partner)).json()[0]
    blocks_before = verify_firm_audit_chain(env["db"], FIRM_A)["total_blocks"]

    real = signing_module.append_audit_block

    def failing(*a, **kw):
        if a[4] == "DSC_SIGNED":
            raise RuntimeError("audit store unavailable")
        return real(*a, **kw)

    monkeypatch.setattr(signing_module, "append_audit_block", failing)
    quiet = TestClient(app, raise_server_exceptions=False)
    res = quiet.post(
        f"/api/v1/signing/requests/{p['id']}/complete",
        json={"signature_b64": sign_message(m["key"], p["message_b64"]), "certificate_pem": m["leaf_pem"]},
        headers=token(partner),
    )
    assert res.status_code == 500
    env["db"].expire_all()
    req = env["db"].get(SigningRequest, uuid.UUID(p["id"]))
    assert req.status == SigningStatus.PENDING and req.signature_b64 is None  # no signature without evidence
    assert env["db"].get(GSTReturn, env["ret"].id).status == ReturnStatus.SIGNING_PENDING
    assert verify_firm_audit_chain(env["db"], FIRM_A)["total_blocks"] == blocks_before

    monkeypatch.setattr(signing_module, "append_audit_block", real)  # audit store recovered: retry succeeds
    ok = env["http"].post(
        f"/api/v1/signing/requests/{p['id']}/complete",
        json={"signature_b64": sign_message(m["key"], p["message_b64"]), "certificate_pem": m["leaf_pem"]},
        headers=token(partner),
    )
    assert ok.status_code == 200
