"""Phase 1 ops-tracker API: per-record storage, login required, and firm isolation."""
import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.database import create_tables, SessionLocal
from app.core.security import create_access_token
from app.models.tenant import Firm, User
from app.main import app

client = TestClient(app)


def _token(tenant, role="PARTNER", email=None):
    # Sessions are revalidated against the users table on every request, so the
    # user (and its firm) must really exist for the token to be honoured.
    uid = uuid.uuid4()
    email = email or f"{uid.hex[:8]}@firm.test"
    with SessionLocal() as db:
        if db.get(Firm, tenant) is None:
            db.add(Firm(id=tenant, firm_code=f"fx-{uuid.UUID(str(tenant)).hex[:10]}", firm_name="Test Firm"))
        # emails are globally unique; drop any leftover from a previous run so the suite is re-runnable
        db.query(User).filter(User.email == email).delete(synchronize_session=False)
        db.add(User(id=uid, firm_id=tenant, email=email, full_name="Test Person",
                    role=role, hashed_password="x", is_active=True))
        db.commit()
    return create_access_token(
        {"sub": str(uid), "tenant_id": str(tenant), "role": role, "email": email,
         "full_name": "Test Person"},
        expires_delta=timedelta(minutes=30),
    )


def _h(tenant, role="PARTNER", email=None):
    return {"Authorization": f"Bearer {_token(tenant, role, email)}"}


CLIENT = {"id": "c01", "name": "Kesarla Moulded Products Pvt Ltd", "short": "Kesarla", "type": "Private company",
          "pan": "AAJCK4417M", "tags": ["co", "gstm"], "partner": "srinivas", "manager": "farhan", "team": ["lavanya"],
          "turnover": 142000000, "risk": "Medium", "books": "Tally Prime (desktop)"}
OBLIGATION = {"id": "ob-1", "client": "c01", "form": "GSTR-3B", "d": "GST", "period": "Oct 2026",
              "due": "2026-11-20T11:30:00.000Z", "state": "awaiting", "prep": "lavanya", "rev": "farhan",
              "partner": "srinivas", "docs": [5, 0], "amount": 12345.5}


@pytest.fixture(scope="module", autouse=True)
def _schema():
    create_tables()


@pytest.fixture
def firm():
    tenant = uuid.uuid4()
    gstin = f"36{uuid.uuid4().hex[:13].upper()}"
    return tenant, {**CLIENT, "gstin": gstin}


def test_every_ops_route_requires_login():
    for method, path in [("get", "/api/v1/ops/workspace"), ("get", "/api/v1/ops/me"),
                         ("put", "/api/v1/ops/tasks/tk1"), ("post", "/api/v1/ops/daybook"),
                         ("get", "/api/v1/firm-os/state"), ("get", "/api/v1/billing/invoices"),
                         ("post", "/api/v1/bank-reco/reconcile")]:
        r = client.request(method.upper(), path, json={} if method != "get" else None)
        assert r.status_code == 401, (path, r.status_code)


def test_client_portal_users_are_refused(firm):
    tenant, _ = firm
    assert client.get("/api/v1/ops/workspace", headers=_h(tenant, "CLIENT_USER")).status_code == 403


def test_records_round_trip(firm):
    tenant, c = firm
    h = _h(tenant)
    assert client.put("/api/v1/ops/clients/c01", json=c, headers=h).status_code == 200
    r = client.put("/api/v1/ops/obligations/ob-1", json=OBLIGATION, headers=h)
    assert r.status_code == 200, r.text
    task = {"id": "tk1", "title": "Call the MD", "client": "c01", "who": "srinivas", "due": "2026-11-12T10:00:00Z", "done": False}
    assert client.put("/api/v1/ops/tasks/tk1", json=task, headers=h).status_code == 200
    inv = {"no": "NC/26-27/0412", "client": "c01", "amt": 371700, "status": "Draft — G9", "date": "2026-11-11T10:00:00Z"}
    # invoice numbers contain '/', so they are saved through the batch endpoint (the tracker always batches)
    assert client.post("/api/v1/ops/invoices/batch", json={"upserts": [inv]}, headers=h).status_code == 200

    ws = client.get("/api/v1/ops/workspace", headers=h).json()
    assert [x["id"] for x in ws["clients"]] == ["c01"]
    assert ws["clients"][0]["team"] == ["lavanya"]  # full tracker profile survives
    ob = ws["obligations"][0]
    assert ob["id"] == "ob-1" and ob["docs"] == [5, 0] and ob["state"] == "awaiting"
    assert ws["tasks"][0]["title"] == "Call the MD"
    assert ws["invoices"][0]["no"] == "NC/26-27/0412"
    assert ws["empty"] is False

    # update moves the record, delete removes it
    assert client.put("/api/v1/ops/obligations/ob-1", json={**OBLIGATION, "state": "received"}, headers=h).status_code == 200
    assert client.delete("/api/v1/ops/tasks/tk1", headers=h).status_code == 200
    ws = client.get("/api/v1/ops/workspace", headers=h).json()
    assert ws["obligations"][0]["state"] == "received"
    assert ws["tasks"] == []


def test_firms_cannot_see_or_touch_each_other(firm):
    tenant_a, c = firm
    tenant_b = uuid.uuid4()
    client.put("/api/v1/ops/clients/c01", json=c, headers=_h(tenant_a))
    client.put("/api/v1/ops/obligations/ob-1", json=OBLIGATION, headers=_h(tenant_a))

    ws_b = client.get("/api/v1/ops/workspace", headers=_h(tenant_b)).json()
    assert ws_b["clients"] == [] and ws_b["obligations"] == []
    # firm B cannot attach work to firm A's client, or delete firm A's records
    r = client.put("/api/v1/ops/obligations/ob-9", json={**OBLIGATION, "id": "ob-9"}, headers=_h(tenant_b))
    assert r.status_code == 422 and "does not exist in this firm" in r.json()["detail"]
    assert client.delete("/api/v1/ops/obligations/ob-1", headers=_h(tenant_b)).status_code == 404
    assert len(client.get("/api/v1/ops/workspace", headers=_h(tenant_a)).json()["obligations"]) == 1


def test_validation_rejects_bad_records(firm):
    tenant, c = firm
    h = _h(tenant)
    client.put("/api/v1/ops/clients/c01", json=c, headers=h)
    bad = [
        ("obligations", {**OBLIGATION, "state": "teleported"}, "state"),
        ("obligations", {**OBLIGATION, "due": "next tuesday"}, "due"),
        ("obligations", {**OBLIGATION, "amount": -5}, "amount"),
        ("clients", {**c, "pan": "NOTAPAN"}, "pan"),
        ("staff", {"id": "x", "name": "X", "role": "GOD"}, "role"),
    ]
    for entity, rec, word in bad:
        r = client.put(f"/api/v1/ops/{entity}/{rec['id']}", json=rec, headers=h)
        assert r.status_code == 422 and word in r.json()["detail"], (entity, r.text)
    assert client.put("/api/v1/ops/obligations/ob-2", json=OBLIGATION, headers=h).status_code == 422  # id mismatch


def test_duplicate_gstin_is_a_conflict(firm):
    tenant, c = firm
    h = _h(tenant)
    assert client.put("/api/v1/ops/clients/c01", json=c, headers=h).status_code == 200
    r = client.put("/api/v1/ops/clients/c02", json={**c, "id": "c02"}, headers=h)
    assert r.status_code == 409


def test_roles_limit_what_each_person_can_change(firm):
    tenant, c = firm
    client.put("/api/v1/ops/clients/c01", json=c, headers=_h(tenant))
    trainee = _h(tenant, "ARTICLE_TRAINEE")
    # trainees work on obligations but cannot add clients, staff, or delete clients
    assert client.put("/api/v1/ops/obligations/ob-1", json=OBLIGATION, headers=trainee).status_code == 200
    assert client.put("/api/v1/ops/clients/c09", json={**c, "id": "c09", "gstin": None}, headers=trainee).status_code == 403
    assert client.put("/api/v1/ops/staff/z", json={"id": "z", "name": "Z", "role": "PT"}, headers=trainee).status_code == 403
    assert client.delete("/api/v1/ops/clients/c01", headers=_h(tenant, "MANAGER")).status_code == 403
    # privileged settings (capabilities, ethical walls) are partner-only
    assert client.put("/api/v1/ops/settings", json={"data": {"caps": {"x": ["AR"]}}}, headers=trainee).status_code == 403
    assert client.put("/api/v1/ops/settings", json={"data": {"automations": {"a1": True}}}, headers=trainee).status_code == 200
    assert client.put("/api/v1/ops/settings", json={"data": {"caps": {"x": ["PT"]}}}, headers=_h(tenant)).status_code == 200


def test_daybook_is_append_only_and_idempotent(firm):
    tenant, _ = firm
    h = _h(tenant)
    e1 = {"n": 1, "at": "2026-11-11T09:00:00Z", "actor": "srinivas", "kind": "human", "action": "signed in", "hash": "a1b2c3d4", "prev": "00000000"}
    e2 = {"n": 2, "at": "2026-11-11T09:05:00Z", "actor": "srinivas", "kind": "human", "action": "moved a card", "hash": "e5f6a7b8", "prev": "a1b2c3d4"}
    assert client.post("/api/v1/ops/daybook", json={"entries": [e1, e2]}, headers=h).json()["appended"] == 2
    assert client.post("/api/v1/ops/daybook", json={"entries": [e1, e2]}, headers=h).json()["appended"] == 0
    ws = client.get("/api/v1/ops/workspace", headers=h).json()
    assert [e["action"] for e in ws["daybook"]] == ["signed in", "moved a card"]
    # there is no update or delete route for the daybook
    assert client.delete("/api/v1/ops/daybook/a1b2c3d4-1", headers=h).status_code == 404


def test_me_links_the_login_to_a_staff_record(firm):
    tenant, _ = firm
    h = _h(tenant, "MANAGER", email="neha@firm.test")
    client.put("/api/v1/ops/staff/neha", json={"id": "neha", "name": "Neha Gupta", "role": "MG", "email": "neha@firm.test"}, headers=_h(tenant))
    me = client.get("/api/v1/ops/me", headers=h).json()
    assert me["staff"]["id"] == "neha" and me["staff"]["role"] == "MG"
    # an unknown login gets a staff record created for it, with a role derived from the account
    other = client.get("/api/v1/ops/me", headers=_h(tenant, "ARTICLE_TRAINEE", email="new.joiner@firm.test")).json()
    assert other["staff"]["id"] == "newjoiner" and other["staff"]["role"] == "AR"


def test_import_only_into_an_empty_firm(firm):
    tenant, c = firm
    payload = {
        "clients": [c], "staff": [{"id": "srinivas", "name": "CA Srinivas", "role": "MP"}],
        "obligations": [OBLIGATION], "tasks": [], "notices": [
            {"id": "n1", "client": "c01", "type": "ASMT-10", "demand": 682450, "received": "2026-11-08T10:00:00Z",
             "replyBy": "2026-11-20T10:00:00Z", "owner": "srinivas", "stage": "Draft reply"}],
        "invoices": [], "timesheets": [], "daybook": [], "settings": {"automations": {"a1": True}},
    }
    assert client.post("/api/v1/ops/workspace/import", json=payload, headers=_h(tenant, "MANAGER")).status_code == 403
    r = client.post("/api/v1/ops/workspace/import", json=payload, headers=_h(tenant))
    assert r.status_code == 200, r.text
    assert r.json()["counts"]["obligations"] == 1
    assert client.post("/api/v1/ops/workspace/import", json=payload, headers=_h(tenant)).status_code == 409
    ws = client.get("/api/v1/ops/workspace", headers=_h(tenant)).json()
    assert ws["notices"][0]["type"] == "ASMT-10" and ws["settings"]["automations"] == {"a1": True}


def test_dev_login_is_closed_when_firebase_is_the_provider(monkeypatch):
    from app.core.config import settings
    body = {"staff": {"id": "srinivas", "name": "CA Srinivas", "role": "MP"}}
    monkeypatch.setattr(settings, "LOGIN_PROVIDER", "firebase")
    monkeypatch.setattr(settings, "FIREBASE_PROJECT_ID", "proj")
    assert client.post("/api/v1/ops/dev-login", json=body).status_code == 404
    monkeypatch.setattr(settings, "LOGIN_PROVIDER", "otp")
    monkeypatch.setattr(settings, "DEBUG", False)
    assert client.post("/api/v1/ops/dev-login", json=body).status_code == 404
