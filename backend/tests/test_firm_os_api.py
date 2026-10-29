import pytest
import uuid
from decimal import Decimal
from datetime import datetime

from app.core.database import create_tables, SessionLocal
from app.api.v1.firm_os import (
    get_firm_state,
    sync_firm_state,
    decide_gate,
    execute_dsc_signature,
    run_reconciliation,
    export_tally_xml,
    get_audit_trail,
    GateDecisionRequest,
    DSCSigningRequest,
    StateSyncRequest
)
from fastapi import HTTPException

@pytest.fixture(scope="module")
def db_session():
    create_tables()
    db = SessionLocal()
    yield db
    db.close()

def test_firm_os_state_lifecycle(db_session):
    # 1. Sync sample state
    sample_state = {
        "firm_name": "Nallamala & Co.",
        "persona": "srinivas",
        "obligations": [{"id": "ob-1", "form": "GSTR-3B", "state": "preparing"}],
        "gates": [{"id": "q01", "gate": "G7", "status": "pending", "amount": 3842600}]
    }
    sync_req = StateSyncRequest(state=sample_state, synced_by="srinivas")
    sync_resp = sync_firm_state(sync_req, db_session)
    assert sync_resp["status"] == "success"
    assert len(sync_resp["hash"]) == 64

    # 2. Retrieve state
    get_resp = get_firm_state(db_session)
    assert get_resp["status"] == "success"
    assert get_resp["state"]["firm_name"] == "Nallamala & Co."

def test_four_eyes_invariant_enforcement(db_session):
    # Violation: Preparer attempts to review their own return at G6
    bad_req = GateDecisionRequest(
        item_id="q01",
        gate_code="G6",
        action="APPROVED",
        notes="Self review",
        actor_id="rohit",
        actor_role="SA",
        preparer_id="rohit"  # Same person!
    )
    with pytest.raises(HTTPException) as exc_info:
        decide_gate("G6", bad_req, db_session)
    assert exc_info.value.status_code == 400
    assert "Four-Eyes Invariant Violation" in exc_info.value.detail

    # Valid: Distinct reviewer
    good_req = GateDecisionRequest(
        item_id="q01",
        gate_code="G6",
        action="APPROVED",
        notes="Reviewed and verified against books",
        actor_id="divya",
        actor_role="MG",
        preparer_id="rohit"  # Distinct person!
    )
    good_resp = decide_gate("G6", good_req, db_session)
    assert good_resp["status"] == "success"
    assert good_resp["four_eyes_verified"] is True

def test_partner_authority_boundary(db_session):
    # Article Assistant tries to approve G7 Partner DSC Signing
    unauthorized_req = GateDecisionRequest(
        item_id="q01",
        gate_code="G7",
        action="APPROVED",
        actor_id="kavitha",
        actor_role="AR"  # Article assistant
    )
    with pytest.raises(HTTPException) as exc_info:
        decide_gate("G7", unauthorized_req, db_session)
    assert exc_info.value.status_code == 403
    assert "Statutory Boundary Violation" in exc_info.value.detail

    # Partner approves G7
    authorized_req = GateDecisionRequest(
        item_id="q01",
        gate_code="G7",
        action="APPROVED",
        actor_id="srinivas",
        actor_role="PT"  # Partner
    )
    auth_resp = decide_gate("G7", authorized_req, db_session)
    assert auth_resp["status"] == "success"
    assert auth_resp["action"] == "APPROVED"

def test_high_value_transaction_threshold(db_session):
    # Amount ₹1,50,000 at Gate G3 requires Partner (Senior Assistant role fails)
    req_over_50k = GateDecisionRequest(
        item_id="q-ims-01",
        gate_code="G3",
        action="APPROVED",
        actor_id="rohit",
        actor_role="SA",
        amount=150000.0
    )
    with pytest.raises(HTTPException) as exc_info:
        decide_gate("G3", req_over_50k, db_session)
    assert exc_info.value.status_code == 403
    assert "Value Threshold Exceeded" in exc_info.value.detail

def test_dsc_signing_ceremony(db_session):
    # Invalid short PIN
    with pytest.raises(HTTPException) as exc_info:
        execute_dsc_signature(
            DSCSigningRequest(item_id="q01", partner_id="srinivas", pin="123"),
            db_session
        )
    assert exc_info.value.status_code == 400

    # Valid PIN
    valid_resp = execute_dsc_signature(
        DSCSigningRequest(item_id="q01", partner_id="srinivas", pin="Pass1234!"),
        db_session
    )
    assert valid_resp["status"] == "signed"
    assert valid_resp["signature_token"].startswith("PKCS7-")
    assert valid_resp["pin_memory_wiped"] is True

def test_reconciliation_engine():
    data = run_reconciliation("c01", "2026-09")
    assert data["status"] == "success"
    summary = data["summary"]
    assert summary["total_books_invoices"] > 0
    assert "gstr3b_table_4" in summary
    assert summary["gstr3b_table_4"]["net_itc_available"] > 0

def test_tally_xml_export():
    resp = export_tally_xml()
    assert "application/xml" in resp.headers["content-type"]
    assert b"<ENVELOPE>" in resp.body
    assert b"<VOUCHER" in resp.body

def test_audit_trail_retrieval(db_session):
    data = get_audit_trail(db_session)
    assert "trail" in data
    assert data["count"] > 0
