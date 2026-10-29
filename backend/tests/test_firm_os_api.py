import pytest
import uuid
from decimal import Decimal
from datetime import datetime
from fastapi.testclient import TestClient

from app.main import app

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c

def test_health_check(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "v1.1-firm-os" in data["version"]

def test_firm_os_state_lifecycle(client):
    # 1. Sync sample state
    sample_state = {
        "firm_name": "Nallamala & Co.",
        "persona": "srinivas",
        "obligations": [{"id": "ob-1", "form": "GSTR-3B", "state": "preparing"}],
        "gates": [{"id": "q01", "gate": "G7", "status": "pending", "amount": 3842600}]
    }
    sync_resp = client.post("/api/v1/firm-os/state/sync", json={"state": sample_state, "synced_by": "srinivas"})
    assert sync_resp.status_code == 200
    sync_data = sync_resp.json()
    assert sync_data["status"] == "success"
    assert len(sync_data["hash"]) == 64  # Valid SHA-256

    # 2. Retrieve state
    get_resp = client.get("/api/v1/firm-os/state")
    assert get_resp.status_code == 200
    get_data = get_resp.json()
    assert get_data["status"] == "success"
    assert get_data["state"]["firm_name"] == "Nallamala & Co."

def test_four_eyes_invariant_enforcement(client):
    # Violation: Preparer attempts to review their own return at G6
    bad_req = {
        "item_id": "q01",
        "gate_code": "G6",
        "action": "APPROVED",
        "notes": "Self review",
        "actor_id": "rohit",
        "actor_role": "SA",
        "preparer_id": "rohit"  # Same person!
    }
    resp = client.post("/api/v1/firm-os/gates/G6/decide", json=bad_req)
    assert resp.status_code == 400
    assert "Four-Eyes Invariant Violation" in resp.json()["detail"]

    # Valid: Distinct reviewer
    good_req = {
        "item_id": "q01",
        "gate_code": "G6",
        "action": "APPROVED",
        "notes": "Reviewed and verified against books",
        "actor_id": "divya",
        "actor_role": "MG",
        "preparer_id": "rohit"  # Distinct person!
    }
    good_resp = client.post("/api/v1/firm-os/gates/G6/decide", json=good_req)
    assert good_resp.status_code == 200
    assert good_resp.json()["four_eyes_verified"] is True

def test_partner_authority_boundary(client):
    # Article Assistant tries to approve G7 Partner DSC Signing
    unauthorized_req = {
        "item_id": "q01",
        "gate_code": "G7",
        "action": "APPROVED",
        "actor_id": "kavitha",
        "actor_role": "AR"  # Article assistant
    }
    resp = client.post("/api/v1/firm-os/gates/G7/decide", json=unauthorized_req)
    assert resp.status_code == 403
    assert "Statutory Boundary Violation" in resp.json()["detail"]

    # Partner approves G7
    authorized_req = {
        "item_id": "q01",
        "gate_code": "G7",
        "action": "APPROVED",
        "actor_id": "srinivas",
        "actor_role": "PT"  # Partner
    }
    auth_resp = client.post("/api/v1/firm-os/gates/G7/decide", json=authorized_req)
    assert auth_resp.status_code == 200
    assert auth_resp.json()["action"] == "APPROVED"

def test_high_value_transaction_threshold(client):
    # Amount ₹1,50,000 at Gate G3 requires Partner (Senior Assistant role fails)
    req_over_50k = {
        "item_id": "q-ims-01",
        "gate_code": "G3",
        "action": "APPROVED",
        "actor_id": "rohit",
        "actor_role": "SA",
        "amount": 150000.0
    }
    resp = client.post("/api/v1/firm-os/gates/G3/decide", json=req_over_50k)
    assert resp.status_code == 403
    assert "Value Threshold Exceeded" in resp.json()["detail"]

def test_dsc_signing_ceremony(client):
    # Invalid short PIN
    short_pin_resp = client.post("/api/v1/firm-os/dsc/sign", json={
        "item_id": "q01",
        "partner_id": "srinivas",
        "pin": "123"
    })
    assert short_pin_resp.status_code == 400

    # Valid 6-digit PIN
    valid_resp = client.post("/api/v1/firm-os/dsc/sign", json={
        "item_id": "q01",
        "partner_id": "srinivas",
        "pin": "Pass1234!"
    })
    assert valid_resp.status_code == 200
    data = valid_resp.json()
    assert data["status"] == "signed"
    assert data["signature_token"].startswith("PKCS7-")
    assert data["pin_memory_wiped"] is True

def test_reconciliation_engine(client):
    resp = client.post("/api/v1/firm-os/reconciliation/run", json={"client_id": "c01", "period": "2026-09"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    summary = data["summary"]
    assert summary["total_books_invoices"] > 0
    assert "gstr3b_table_4" in summary
    assert summary["gstr3b_table_4"]["net_itc_available"] > 0

def test_tally_xml_export(client):
    resp = client.get("/api/v1/firm-os/export/tally-xml")
    assert resp.status_code == 200
    assert "application/xml" in resp.headers["content-type"]
    assert b"<ENVELOPE>" in resp.content
    assert b"<VOUCHER" in resp.content

def test_audit_trail_retrieval(client):
    resp = client.get("/api/v1/firm-os/audit-trail")
    assert resp.status_code == 200
    data = resp.json()
    assert "trail" in data
    assert data["count"] > 0
