"""Tally agent pairing (device-code flow) and automatic company linking."""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import tally_enroll
from app.core.database import SessionLocal, create_tables
from app.core.shared_store import get_store
from app.main import app
from app.models.clients import Client, ClientType, ERPType
from app.models.tally_agent import TallyEnrollment
from tests.test_tally_agent import _login

http = TestClient(app)
B = "/api/v1/tally-agent"


@pytest.fixture(scope="module", autouse=True)
def _schema():
    create_tables()


@pytest.fixture(autouse=True)
def _fresh_limits():
    get_store().reset()
    yield
    get_store().reset()


def _start(**kw):
    body = {"pc_name": "Reception PC", "agent_version": "0.2.0", "companies": ["Acme Pvt Ltd"], **kw}
    r = http.post(f"{B}/enroll/start", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _poll(device_code):
    return http.post(f"{B}/enroll/poll", json={"device_code": device_code})


def _client(tenant, name, trade=None):
    with SessionLocal() as db:
        c = Client(tenant_id=tenant, client_name=name, trade_name=trade, pan="AABCU9603R", gstin=None,
                   client_type=ClientType.COMPANY, erp_type=ERPType.TALLY_PRIME,
                   financial_year_start="2026-04-01", financial_year_end="2027-03-31")
        db.add(c)
        db.commit()
        return str(c.id)


# ---------------------------------------------------------------- the flow
def test_full_pairing_flow_gives_the_agent_a_working_key_exactly_once():
    tenant = uuid.uuid4()
    admin = _login(tenant)
    s = _start()
    assert s["verification_path"] == f"/#/tally/{s['user_code']}" and len(s["user_code"]) == 9
    assert _poll(s["device_code"]).json() == {"status": "pending"}

    seen = http.get(f"{B}/enroll/{s['user_code']}", headers=admin).json()      # what the manager sees
    assert seen["pc_name"] == "Reception PC" and seen["companies"] == ["Acme Pvt Ltd"]

    assert http.post(f"{B}/enroll/{s['user_code']}/approve", headers=admin).status_code == 200
    got = _poll(s["device_code"]).json()
    assert got["status"] == "approved" and got["key"].startswith("fosk_")

    # The key works, and belongs to the approving firm under the PC's name.
    hb = http.post(f"{B}/heartbeat", json={"agent_version": "0.2.0", "companies": []}, headers={"X-Agent-Key": got["key"]})
    assert hb.status_code == 200
    agents = http.get(f"{B}/agents", headers=admin).json()
    assert [a["name"] for a in agents] == ["Reception PC"] and agents[0]["id"] == got["agent_id"]

    # A second poll (or a replay) never returns the key again.
    again = _poll(s["device_code"]).json()
    assert again == {"status": "delivered"} and "key" not in again


def test_codes_are_stored_hashed_and_the_key_is_never_stored():
    s = _start()
    with SessionLocal() as db:
        row = db.query(TallyEnrollment).filter(TallyEnrollment.user_code == s["user_code"]).one()
        assert s["device_code"] not in (row.device_code_hash, row.user_code) and len(row.device_code_hash) == 64


def test_approval_needs_a_signed_in_manager():
    tenant = uuid.uuid4()
    s = _start()
    assert http.get(f"{B}/enroll/{s['user_code']}").status_code == 401
    assert http.post(f"{B}/enroll/{s['user_code']}/approve").status_code == 401
    trainee = _login(tenant, "ARTICLE_TRAINEE")
    assert http.post(f"{B}/enroll/{s['user_code']}/approve", headers=trainee).status_code == 403
    assert _poll(s["device_code"]).json() == {"status": "pending"}     # nothing happened


def test_deny_and_double_approve():
    admin = _login(uuid.uuid4())
    denied = _start()
    assert http.post(f"{B}/enroll/{denied['user_code']}/deny", headers=admin).status_code == 200
    assert _poll(denied["device_code"]).json() == {"status": "denied"}
    assert http.post(f"{B}/enroll/{denied['user_code']}/approve", headers=admin).status_code == 404

    s = _start()
    assert http.post(f"{B}/enroll/{s['user_code']}/approve", headers=admin).status_code == 200
    assert http.post(f"{B}/enroll/{s['user_code']}/approve", headers=admin).status_code == 404


def test_expired_and_unknown_codes_look_identical():
    admin = _login(uuid.uuid4())
    assert _poll("fosd_" + "x" * 40).json() == {"status": "expired"}
    s = _start()
    with SessionLocal() as db:
        db.query(TallyEnrollment).filter(TallyEnrollment.user_code == s["user_code"]).update(
            {"expires_at": datetime.utcnow() - timedelta(minutes=1)})
        db.commit()
    assert _poll(s["device_code"]).json() == {"status": "expired"}
    assert http.get(f"{B}/enroll/{s['user_code']}", headers=admin).status_code == 404
    assert http.post(f"{B}/enroll/{s['user_code']}/approve", headers=admin).status_code == 404


def test_approved_but_uncollected_key_expires():
    admin = _login(uuid.uuid4())
    s = _start()
    http.post(f"{B}/enroll/{s['user_code']}/approve", headers=admin)
    with SessionLocal() as db:
        db.query(TallyEnrollment).filter(TallyEnrollment.user_code == s["user_code"]).update(
            {"expires_at": datetime.utcnow() - timedelta(seconds=1)})
        db.commit()
    assert _poll(s["device_code"]).json() == {"status": "expired"}
    assert http.get(f"{B}/agents", headers=admin).json() == []        # no orphan key was minted


def test_bad_codes_and_guessing_are_limited():
    admin = _login(uuid.uuid4())
    for bad in ("nope", "1234-5678", "ABCD-EFG", "ABCDEFGHI"):
        assert http.get(f"{B}/enroll/{bad}", headers=admin).status_code == 404
    codes = [http.get(f"{B}/enroll/ABCD-2345", headers=admin).status_code for _ in range(40)]
    assert codes[:20] == [404] * 20 and 429 in codes                    # per-user cap stops brute force


def test_pending_requests_are_capped(monkeypatch):
    monkeypatch.setattr(tally_enroll, "MAX_PENDING", 0)
    r = http.post(f"{B}/enroll/start", json={"pc_name": "x"})
    assert r.status_code == 429


def test_start_input_is_bounded():
    assert http.post(f"{B}/enroll/start", json={"pc_name": "x" * 500}).status_code == 422
    assert http.post(f"{B}/enroll/start", json={"companies": ["c"] * 500}).status_code == 422
    r = http.post(f"{B}/enroll/start", json={"companies": ["  ", "Real Co", "Real Co"]})
    assert r.status_code == 200


def test_only_the_approving_firm_gets_the_agent():
    tenant_a, tenant_b = uuid.uuid4(), uuid.uuid4()
    admin_a, admin_b = _login(tenant_a), _login(tenant_b)
    s = _start()
    assert http.post(f"{B}/enroll/{s['user_code']}/approve", headers=admin_a).status_code == 200
    assert http.get(f"{B}/enroll/{s['user_code']}", headers=admin_b).status_code == 404     # no longer pending
    assert http.get(f"{B}/agents", headers=admin_b).json() == []
    assert len(http.get(f"{B}/agents", headers=admin_a).json()) == 0                         # created on first poll
    key = _poll(s["device_code"]).json()["key"]
    assert len(http.get(f"{B}/agents", headers=admin_a).json()) == 1
    assert http.get(f"{B}/agents", headers=admin_b).json() == []
    assert key.startswith("fosk_")


def test_pairing_is_audited():
    tenant = uuid.uuid4()
    admin = _login(tenant)
    s = _start()
    http.post(f"{B}/enroll/{s['user_code']}/approve", headers=admin)
    _poll(s["device_code"])
    with SessionLocal() as db:
        from app.models.tenant import AuditBlock
        actions = [b.action for b in db.query(AuditBlock).filter(AuditBlock.firm_id == tenant).all()]
    assert "TALLY_AGENT_PAIRING_APPROVED" in actions and "TALLY_AGENT_KEY_DELIVERED" in actions


# ---------------------------------------------------------------- automatic linking
def _paired_key(tenant, admin):
    s = _start()
    http.post(f"{B}/enroll/{s['user_code']}/approve", headers=admin)
    return _poll(s["device_code"]).json()["key"]


def _beat(key, *names):
    r = http.post(f"{B}/heartbeat", json={"companies": list(names)}, headers={"X-Agent-Key": key})
    assert r.status_code == 200, r.text
    return {c["company_name"]: c["linked"] for c in r.json()["companies"]}


def test_company_links_itself_on_an_exact_name_match():
    tenant = uuid.uuid4()
    admin = _login(tenant)
    client_id = _client(tenant, "Sharma & Sons Traders Pvt. Ltd.")
    key = _paired_key(tenant, admin)
    assert _beat(key, "SHARMA AND SONS", "sharma & sons traders pvt ltd") == {"SHARMA AND SONS": False, "sharma & sons traders pvt ltd": True}
    comp = {c["company_name"]: c for c in http.get(f"{B}/companies", headers=admin).json()}
    linked = comp["sharma & sons traders pvt ltd"]
    assert linked["client_id"] == client_id and linked["link_method"] == "auto"
    assert comp["SHARMA AND SONS"]["linked"] is False


def test_trade_name_also_matches():
    tenant = uuid.uuid4()
    admin = _login(tenant)
    _client(tenant, "Some Long Legal Name LLP", trade="Quick Mart")
    assert _beat(_paired_key(tenant, admin), "Quick Mart") == {"Quick Mart": True}


def test_ambiguous_or_taken_matches_are_left_for_a_person():
    tenant = uuid.uuid4()
    admin = _login(tenant)
    _client(tenant, "Twin Traders")
    _client(tenant, "Twin Traders")                       # two clients with the same name: ambiguous
    key = _paired_key(tenant, admin)
    assert _beat(key, "Twin Traders") == {"Twin Traders": False}

    solo = _client(tenant, "Solo Exports")
    assert _beat(key, "Solo Exports") == {"Solo Exports": True}
    assert _beat(key, "solo exports!") == {"solo exports!": False}      # that client already has a Tally company
    assert solo


def test_never_links_across_firms_or_to_deleted_clients():
    tenant, other = uuid.uuid4(), uuid.uuid4()
    admin = _login(tenant)
    _client(other, "Other Firm Client")
    gone = _client(tenant, "Deleted Client")
    with SessionLocal() as db:
        db.query(Client).filter(Client.id == uuid.UUID(gone)).update({"is_deleted": True})
        db.commit()
    key = _paired_key(tenant, admin)
    assert _beat(key, "Other Firm Client", "Deleted Client") == {"Other Firm Client": False, "Deleted Client": False}


def test_manual_link_is_recorded_as_manual_and_unlink_clears_it():
    tenant = uuid.uuid4()
    admin = _login(tenant)
    key = _paired_key(tenant, admin)
    _beat(key, "Manual Co")
    comp = http.get(f"{B}/companies", headers=admin).json()[0]
    cid = _client(tenant, "Different Name")
    assert http.put(f"{B}/companies/{comp['id']}/link", json={"client_id": cid}, headers=admin).json()["link_method"] == "manual"
    assert http.put(f"{B}/companies/{comp['id']}/link", json={"client_id": None}, headers=admin).json()["link_method"] is None
