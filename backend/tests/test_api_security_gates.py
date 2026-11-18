"""End-to-end API security tests: authN/Z, tenant isolation and four-eyes gate decisions."""
import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.deterministic_core.audit_chain import verify_firm_audit_chain
from app.main import app
from app.models import Client, Firm, GateDecision, GSTReturn, User
from app.models.clients import ClientStatus, ClientType, ERPType, RiskTier
from app.models.gates import GateStatus, GateTier, RequiredRole
from app.models.returns import ReturnStatus, ReturnType

FIRM_A = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
FIRM_B = uuid.UUID("bbbbbbbb-0000-0000-0000-000000000001")


# ----------------------------------------------------------------------------- helpers
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
        tenant_id=FIRM_A, client_id=client.id, gate_id="G7", gate_name="Partner Approval",
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


def reviewed(env):
    r = env["db"].get(GSTReturn, env["ret"].id)
    r.status, r.reviewer_id = ReturnStatus.REVIEWED, env["users"]["manager"].id
    env["db"].commit()


# ----------------------------------------------------------------------------- authN / authZ
@pytest.mark.parametrize("path", ["/api/v1/gates", "/api/v1/clients/", "/api/v1/dashboard/overview", "/api/v1/returns/"])
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


def test_g7_is_an_ordinary_partner_approval(env):
    reviewed(env)
    url = f"/api/v1/gates/{env['g7'].id}/approve"
    assert env["http"].post(url, json={}, headers=token(env["users"]["manager"])).status_code == 403
    ok = env["http"].post(url, json={"notes": "approved"}, headers=token(env["users"]["partner"]))
    assert ok.status_code == 200 and ok.json()["status"] == "approved"


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
    with pytest.raises(ValueError, match="Firebase"):
        Settings(DEBUG=False, SECRET_KEY="x" * 40, OTP_SANDBOX_MODE=False)  # login provider not firebase
