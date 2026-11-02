"""End-to-end API security tests: authN/Z, tenant isolation, four-eyes, and the G7
desktop-signer challenge/response protocol (the signing helper below is the reference
implementation of what the desktop signer does on the USB token).
"""
import base64
import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.deterministic_core.audit_chain import verify_firm_audit_chain
from app.main import app
from app.models import Client, Firm, GateDecision, GSTReturn, SigningRequest, User
from app.models.clients import ClientStatus, ClientType, ERPType, RiskTier
from app.models.gates import GateStatus, GateTier, RequiredRole
from app.models.returns import ReturnStatus, ReturnType
from app.models.signing import SigningStatus

FIRM_A = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
FIRM_B = uuid.UUID("bbbbbbbb-0000-0000-0000-000000000001")


# ----------------------------------------------------------------------------- helpers
def make_cert(*, bits=2048, days_valid=365, start_offset_days=-1, cn="CA Test Partner"):
    key = rsa.generate_private_key(public_exponent=65537, key_size=bits)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now + timedelta(days=start_offset_days))
        .not_valid_after(now + timedelta(days=start_offset_days + days_valid))
        .add_extension(x509.KeyUsage(True, True, False, False, False, False, False, False, False), critical=True)
        .sign(key, hashes.SHA256())
    )
    return key, cert.public_bytes(serialization.Encoding.PEM).decode()


def sign(key, message_b64: str) -> str:
    return base64.b64encode(
        key.sign(base64.b64decode(message_b64), padding.PKCS1v15(), hashes.SHA256())
    ).decode()


def token(user: User, tenant=None) -> dict:
    t = create_access_token({"sub": str(user.id), "tenant_id": str(tenant or user.firm_id), "role": user.role})
    return {"Authorization": f"Bearer {t}"}


def payload_hash(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


# ----------------------------------------------------------------------------- fixtures
@pytest.fixture()
def env():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    db = Session()

    def mk_user(firm, role, name):
        u = User(
            firm_id=firm, email=f"{name}-{uuid.uuid4().hex[:6]}@t.in", full_name=name, role=role,
            hashed_password="x", is_active=True,
        )
        db.add(u)
        db.flush()
        return u

    db.add_all([Firm(id=FIRM_A, firm_code="a", firm_name="Firm A"), Firm(id=FIRM_B, firm_code="b", firm_name="Firm B")])
    db.flush()
    users = {
        "partner": mk_user(FIRM_A, "PARTNER", "partner"),
        "partner2": mk_user(FIRM_A, "PARTNER", "partner2"),
        "manager": mk_user(FIRM_A, "MANAGER", "manager"),
        "preparer": mk_user(FIRM_A, "ARTICLE_TRAINEE", "preparer"),
        "client": mk_user(FIRM_A, "CLIENT_USER", "client"),
        "other_partner": mk_user(FIRM_B, "PARTNER", "other_partner"),
    }
    client = Client(
        tenant_id=FIRM_A, client_name="Rajesh Fabrics", pan="AABCR1234F", gstin="27AABCR1234F1Z8",
        client_type=ClientType.COMPANY, status=ClientStatus.ACTIVE, erp_type=ERPType.MANUAL, risk_tier=RiskTier.LOW,
        financial_year_start="2026-04-01", financial_year_end="2027-03-31",
    )
    db.add(client)
    db.flush()
    body = {"return_type": "GSTR3B", "period": "102026", "net": "63390.00"}
    ret = GSTReturn(
        tenant_id=FIRM_A, client_id=client.id, gstin="27AABCR1234F1Z8", return_type=ReturnType.GSTR3B,
        period="102026", financial_year="2026-27", status=ReturnStatus.REVIEW_PENDING,
        payload_json=body, payload_hash=payload_hash(body), preparer_id=users["preparer"].id,
    )
    db.add(ret)
    db.flush()
    g6 = GateDecision(
        tenant_id=FIRM_A, client_id=client.id, gate_id="G6", gate_name="Four-Eyes Return Approval",
        entity_type="GST_RETURN", entity_id=ret.id, tier=GateTier.L2_STAFF, required_role=RequiredRole.MANAGER,
        evidence_pack={"description": "Review GSTR-3B"}, sla_deadline=datetime.now(timezone.utc) + timedelta(hours=2),
    )
    g7 = GateDecision(
        tenant_id=FIRM_A, client_id=client.id, gate_id="G7", gate_name="Partner DSC Signing",
        entity_type="GST_RETURN", entity_id=ret.id, tier=GateTier.L3_PARTNER, required_role=RequiredRole.PARTNER,
        evidence_pack={}, sla_deadline=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add_all([g6, g7])
    db.commit()

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    yield {"db": db, "users": users, "client": client, "ret": ret, "g6": g6, "g7": g7, "http": TestClient(app)}
    app.dependency_overrides.pop(get_db, None)
    db.close()
    engine.dispose()


def open_request(env, hdr, signer, **over):
    body = {
        "entity_type": "GST_RETURN", "entity_id": str(env["ret"].id), "document_hash": env["ret"].payload_hash,
        "document_label": "GSTR-3B Oct 2026", "signer_id": str(signer.id),
    }
    body.update(over)
    return env["http"].post("/api/v1/signing/requests", json=body, headers=hdr)


def reviewed(env):
    r = env["db"].get(GSTReturn, env["ret"].id)
    r.status, r.reviewer_id = ReturnStatus.REVIEWED, env["users"]["manager"].id
    env["db"].commit()


def register(env, partner, **kw):
    key, pem = make_cert(**kw)
    res = env["http"].post("/api/v1/signing/certificates", json={"certificate_pem": pem}, headers=token(partner))
    return key, pem, res


# ----------------------------------------------------------------------------- authN / authZ
@pytest.mark.parametrize("path", ["/api/v1/gates", "/api/v1/clients/", "/api/v1/dashboard/overview", "/api/v1/signing/requests/pending"])
def test_unauthenticated_requests_are_rejected(env, path):
    assert env["http"].get(path).status_code == 401


def test_forged_and_tampered_tokens_are_rejected(env):
    bad = env["http"].get("/api/v1/gates", headers={"Authorization": "Bearer not.a.jwt"})
    assert bad.status_code == 401
    good = token(env["users"]["partner"])["Authorization"][7:]
    assert env["http"].get("/api/v1/gates", headers={"Authorization": f"Bearer {good[:-3]}abc"}).status_code == 401


def test_client_portal_role_cannot_read_firm_data(env):
    hdr = token(env["users"]["client"])
    for path in ("/api/v1/gates", "/api/v1/clients/", "/api/v1/dashboard/overview"):
        assert env["http"].get(path, headers=hdr).status_code == 403


def test_tenant_isolation(env):
    other = token(env["users"]["other_partner"])
    assert env["http"].get("/api/v1/gates", headers=other).json() == []
    assert env["http"].get("/api/v1/clients/", headers=other).json() == []
    assert env["http"].get(f"/api/v1/gates/{env['g6'].id}", headers=other).status_code == 404
    assert env["http"].get(f"/api/v1/clients/{env['client'].id}", headers=other).status_code == 404
    assert env["http"].post(f"/api/v1/gates/{env['g6'].id}/approve", json={}, headers=other).status_code == 404


# ----------------------------------------------------------------------------- DSC registration
def test_register_certificate_happy_path_and_duplicate(env):
    _, pem, res = register(env, env["users"]["partner"])
    assert res.status_code == 201
    dup = env["http"].post("/api/v1/signing/certificates", json={"certificate_pem": pem}, headers=token(env["users"]["partner2"]))
    assert dup.status_code == 409


@pytest.mark.parametrize("kw,fragment", [
    ({"bits": 1024}, "too small"),
    ({"start_offset_days": -400, "days_valid": 30}, "validity"),
])
def test_register_rejects_weak_or_expired_certificates(env, kw, fragment):
    _, _, res = register(env, env["users"]["partner"], **kw)
    assert res.status_code == 422 and fragment in res.json()["detail"]


def test_only_partners_register_certificates(env):
    _, _, res = register(env, env["users"]["manager"])
    assert res.status_code == 403


# ----------------------------------------------------------------------------- signing flow
def test_full_signing_flow_updates_return_and_audit_chain(env):
    reviewed(env)
    partner = env["users"]["partner"]
    key, pem, _ = register(env, partner)

    created = open_request(env, token(env["users"]["manager"]), partner)
    assert created.status_code == 201, created.text
    assert "nonce" not in created.json()  # requesters never see the challenge nonce

    pending = env["http"].get("/api/v1/signing/requests/pending", headers=token(partner)).json()
    assert len(pending) == 1
    done = env["http"].post(
        f"/api/v1/signing/requests/{pending[0]['id']}/complete",
        json={"signature_b64": sign(key, pending[0]["message_b64"]), "certificate_pem": pem, "signer_device": "test-rig"},
        headers=token(partner),
    )
    assert done.status_code == 200 and done.json()["status"] == "SIGNED"

    env["db"].expire_all()
    ret = env["db"].get(GSTReturn, env["ret"].id)
    assert ret.status == ReturnStatus.SIGNED and ret.signing_partner_id == partner.id
    assert verify_firm_audit_chain(env["db"], FIRM_A)["chain_valid"] is True

    replay = env["http"].post(
        f"/api/v1/signing/requests/{pending[0]['id']}/complete",
        json={"signature_b64": sign(key, pending[0]["message_b64"]), "certificate_pem": pem}, headers=token(partner),
    )
    assert replay.status_code == 409  # single use


def test_prepare_returns_server_held_hash_and_eligible_partners(env):
    reviewed(env)
    q = f"/api/v1/signing/prepare?entity_type=GST_RETURN&entity_id={env['ret'].id}"
    assert env["http"].get(q, headers=token(env["users"]["preparer"])).status_code == 403
    res = env["http"].get(q, headers=token(env["users"]["manager"]))
    assert res.status_code == 200
    body = res.json()
    assert body["document_hash"] == env["ret"].payload_hash
    assert {s["id"] for s in body["eligible_signers"]} == {str(env["users"]["partner"].id), str(env["users"]["partner2"].id)}
    other = token(env["users"]["other_partner"])
    assert env["http"].get(q, headers=other).status_code == 404


def test_request_creation_guards(env):
    reviewed(env)
    partner, manager = env["users"]["partner"], env["users"]["manager"]
    assert open_request(env, token(env["users"]["preparer"]), partner).status_code == 403
    assert open_request(env, token(manager), partner, document_hash="0" * 64).status_code == 409
    assert open_request(env, token(manager), partner, document_hash="XYZ").status_code == 422
    assert open_request(env, token(manager), env["users"]["manager"]).status_code == 422  # signer must be a partner
    assert open_request(env, token(manager), env["users"]["other_partner"]).status_code == 422  # cross-tenant signer
    assert open_request(env, token(manager), partner).status_code == 201
    assert open_request(env, token(manager), partner).status_code == 409  # duplicate pending


def test_unreviewed_return_cannot_be_signed(env):
    res = open_request(env, token(env["users"]["manager"]), env["users"]["partner"])
    assert res.status_code == 409 and "four-eyes" in res.json()["detail"].lower()


def test_preparer_cannot_be_signer(env):
    reviewed(env)
    r = env["db"].get(GSTReturn, env["ret"].id)
    r.preparer_id = env["users"]["partner"].id
    env["db"].commit()
    res = open_request(env, token(env["users"]["manager"]), env["users"]["partner"])
    assert res.status_code == 409 and "preparer" in res.json()["detail"]


def test_wrong_signature_unregistered_cert_and_other_partner(env):
    reviewed(env)
    partner, partner2 = env["users"]["partner"], env["users"]["partner2"]
    key, pem, _ = register(env, partner)
    created = open_request(env, token(env["users"]["manager"]), partner).json()
    pending = env["http"].get("/api/v1/signing/requests/pending", headers=token(partner)).json()[0]
    url = f"/api/v1/signing/requests/{created['id']}/complete"

    # another partner may not complete it
    assert env["http"].post(url, json={"signature_b64": "A" * 80, "certificate_pem": pem}, headers=token(partner2)).status_code == 403

    # a valid signature from an unregistered key is refused
    rogue_key, rogue_pem = make_cert()
    r = env["http"].post(url, json={"signature_b64": sign(rogue_key, pending["message_b64"]), "certificate_pem": rogue_pem}, headers=token(partner))
    assert r.status_code == 403

    # a registered key signing the WRONG bytes is refused; the rogue attempt above already
    # used one of the 3 strikes, so the request locks after two more
    wrong = base64.b64encode(b"some other document").decode()
    for _ in range(2):
        r = env["http"].post(url, json={"signature_b64": sign(key, wrong), "certificate_pem": pem}, headers=token(partner))
        assert r.status_code == 422
    final = env["http"].post(url, json={"signature_b64": sign(key, pending["message_b64"]), "certificate_pem": pem}, headers=token(partner))
    assert final.status_code == 409  # FAILED requests cannot be revived
    env["db"].expire_all()
    assert env["db"].get(GSTReturn, env["ret"].id).status == ReturnStatus.SIGNING_PENDING


def test_expired_request_cannot_be_completed(env):
    reviewed(env)
    partner = env["users"]["partner"]
    key, pem, _ = register(env, partner)
    created = open_request(env, token(env["users"]["manager"]), partner).json()
    msg = env["http"].get("/api/v1/signing/requests/pending", headers=token(partner)).json()[0]["message_b64"]
    row = env["db"].get(SigningRequest, uuid.UUID(created["id"]))
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    env["db"].commit()
    r = env["http"].post(f"/api/v1/signing/requests/{created['id']}/complete",
                         json={"signature_b64": sign(key, msg), "certificate_pem": pem}, headers=token(partner))
    assert r.status_code == 409 and "EXPIRED" in r.json()["detail"]


def test_partner_can_reject_a_request(env):
    reviewed(env)
    partner = env["users"]["partner"]
    created = open_request(env, token(env["users"]["manager"]), partner).json()
    r = env["http"].post(f"/api/v1/signing/requests/{created['id']}/reject", json={"reason": "figures disputed"}, headers=token(partner))
    assert r.status_code == 200 and r.json()["status"] == "REJECTED"


# ----------------------------------------------------------------------------- gates
def test_g6_four_eyes_and_return_state(env):
    url = f"/api/v1/gates/{env['g6'].id}/approve"
    assert env["http"].post(url, json={}, headers=token(env["users"]["preparer"])).status_code == 403  # below required role
    r = env["db"].get(GSTReturn, env["ret"].id)
    r.preparer_id = env["users"]["manager"].id  # now the manager is the maker
    env["db"].commit()
    assert env["http"].post(url, json={}, headers=token(env["users"]["manager"])).status_code == 400
    ok = env["http"].post(url, json={"notes": "checked"}, headers=token(env["users"]["partner"]))
    assert ok.status_code == 200 and ok.json()["status"] == "approved"
    env["db"].expire_all()
    ret = env["db"].get(GSTReturn, env["ret"].id)
    assert ret.status == ReturnStatus.REVIEWED and ret.reviewer_id == env["users"]["partner"].id
    assert env["http"].post(url, json={}, headers=token(env["users"]["partner"])).status_code == 409  # no double decision


def test_reject_and_escalate_require_a_reason(env):
    hdr = token(env["users"]["manager"])
    assert env["http"].post(f"/api/v1/gates/{env['g6'].id}/reject", json={}, headers=hdr).status_code == 422
    assert env["http"].post(f"/api/v1/gates/{env['g6'].id}/escalate", json={"notes": ""}, headers=hdr).status_code == 422
    esc = env["http"].post(f"/api/v1/gates/{env['g6'].id}/escalate", json={"notes": "needs partner view"}, headers=hdr)
    assert esc.status_code == 200 and esc.json()["status"] == "escalated"


def test_g7_requires_verified_desktop_signature(env):
    reviewed(env)
    partner = env["users"]["partner"]
    url = f"/api/v1/gates/{env['g7'].id}/approve"
    assert env["http"].post(url, json={}, headers=token(env["users"]["manager"])).status_code == 403
    blocked = env["http"].post(url, json={}, headers=token(partner))
    assert blocked.status_code == 409 and "desktop-signer" in blocked.json()["detail"]

    key, pem, _ = register(env, partner)
    open_request(env, token(env["users"]["manager"]), partner)
    p = env["http"].get("/api/v1/signing/requests/pending", headers=token(partner)).json()[0]
    env["http"].post(f"/api/v1/signing/requests/{p['id']}/complete",
                     json={"signature_b64": sign(key, p["message_b64"]), "certificate_pem": pem}, headers=token(partner))
    assert env["http"].post(url, json={"notes": "signed"}, headers=token(partner)).status_code == 200


# ----------------------------------------------------------------------------- clients / dashboard
def test_client_validation_permissions_and_uniqueness(env):
    http = env["http"]
    manager, trainee = token(env["users"]["manager"]), token(env["users"]["preparer"])
    good = {"name": "Kerala Spices", "pan": "EEEKS7890K", "gstin": "32EEEKS7890K1Z4", "type": "LLP", "turnover": 1000}
    assert http.post("/api/v1/clients/", json=good, headers=trainee).status_code == 403
    assert http.post("/api/v1/clients/", json={**good, "pan": "bad"}, headers=manager).status_code == 422
    assert http.post("/api/v1/clients/", json={**good, "gstin": "32ZZZZZ9999Z1Z4"}, headers=manager).status_code == 422  # PAN mismatch
    created = http.post("/api/v1/clients/", json=good, headers=manager)
    assert created.status_code == 201 and created.json()["tasks_count"] > 0
    assert http.post("/api/v1/clients/", json=good, headers=manager).status_code == 409  # duplicate GSTIN
    assert len(http.get("/api/v1/clients/", headers=trainee).json()) == 2
    assert http.delete(f"/api/v1/clients/{created.json()['id']}", headers=manager).status_code == 403
    assert http.delete(f"/api/v1/clients/{created.json()['id']}", headers=token(env["users"]["partner"])).status_code == 204
    assert len(http.get("/api/v1/clients/", headers=trainee).json()) == 1


def test_dashboard_is_computed_from_database(env):
    hdr = token(env["users"]["manager"])
    ov = env["http"].get("/api/v1/dashboard/overview", headers=hdr).json()
    assert ov["clients_count"] == 1 and ov["pending_gates"] == 2 and ov["returns_status"] == {"filed": 0, "pending": 1}
    tracker = env["http"].get("/api/v1/dashboard/filing-tracker", headers=hdr).json()
    assert tracker == {"completed": 0, "in_progress": 1, "not_started": 0}


def test_audit_chain_stays_valid_across_logins_and_actions(env):
    """Regression: login blocks used a different timestamp format and made the chain verify as tampered."""
    manager = env["users"]["manager"]
    for _ in range(2):
        sent = env["http"].post("/api/v1/auth/otp/send", json={"identifier": manager.email, "channel": "EMAIL"})
        assert sent.status_code == 200, sent.text
        otp = sent.json().get("dev_otp")
        assert otp, "sandbox OTP expected in test configuration"
        ok = env["http"].post("/api/v1/auth/otp/verify", json={"identifier": manager.email, "otp": otp})
        assert ok.status_code == 200, ok.text
    env["http"].post(f"/api/v1/gates/{env['g6'].id}/escalate", json={"notes": "needs partner view"}, headers=token(manager))
    result = verify_firm_audit_chain(env["db"], FIRM_A)
    assert result["chain_valid"] is True and result["total_blocks"] >= 3, result


# ----------------------------------------------------------------------------- production posture
def test_production_config_fails_closed():
    from app.core.config import Settings
    with pytest.raises(ValueError):
        Settings(DEBUG=False)  # default secret
    with pytest.raises(ValueError):
        Settings(DEBUG=False, SECRET_KEY="x" * 40)  # OTP sandbox still on
    with pytest.raises(ValueError, match="trust anchor"):
        Settings(DEBUG=False, SECRET_KEY="x" * 40, OTP_SANDBOX_MODE=False)  # no DSC CA configured


def test_server_side_pin_signing_disabled_in_production(env, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "DEBUG", False)
    res = env["http"].post(
        "/api/v1/firm-os/dsc/sign",
        json={"item_id": "i", "partner_id": "p", "pin": "123456"}, headers=token(env["users"]["partner"]),
    )
    assert res.status_code in (404, 410)
