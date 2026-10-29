import pytest
import uuid
from decimal import Decimal
from datetime import datetime

from app.core.database import create_tables, SessionLocal
from app.models.tenant import Firm, User, AuditBlock, FirmConstitution, PlanTier, UserRole
from app.deterministic_core.audit_chain import append_audit_block, verify_firm_audit_chain, compute_block_hash
from app.deterministic_core.filings_engine import (
    generate_gstr1_payload,
    compute_gstr3b_liability,
    simulate_gsp_filing_submission,
    validate_gstin_format
)
from app.api.v1.firm_os import (
    get_firm_state,
    sync_firm_state,
    decide_gate,
    execute_dsc_signature,
    export_reconciliation_csv,
    get_client_portal_summary,
    create_employee_id,
    list_employee_members,
    get_live_tracker_telemetry,
    trigger_portal_live_sync,
    get_live_statutory_calendar,
    sync_live_statutory_calendar,
    CreateEmployeeRequest,
    PortalSyncRequest,
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

def test_multi_tenant_firm_and_user_creation(db_session):
    firm_code = f"firm-{uuid.uuid4().hex[:8]}"
    unique_frn = f"00{uuid.uuid4().hex[:4].upper()}N"
    firm = Firm(
        firm_code=firm_code,
        firm_name="Gupta & Associates, CAs",
        frn=unique_frn,
        constitution=FirmConstitution.PARTNERSHIP.value,
        plan_tier=PlanTier.ENTERPRISE.value,
        pan="AABFG1234F",
        gstin="07AABFG1234F1Z1",
        head_office_city="New Delhi"
    )
    db_session.add(firm)
    db_session.commit()
    db_session.refresh(firm)

    assert firm.id is not None
    assert firm.firm_code == firm_code

    user = User(
        firm_id=firm.id,
        email=f"partner-{uuid.uuid4().hex[:6]}@guptaca.in",
        full_name="CA Ankit Gupta",
        role=UserRole.PARTNER.value,
        membership_no="504321",
        hashed_password="secure-hashed-pwd-demo"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    assert user.id is not None
    assert user.firm_id == firm.id
    assert user.role == UserRole.PARTNER.value

def test_cryptographic_audit_chain_sqc1_verification(db_session):
    test_firm_id = uuid.uuid4()
    
    # Block 1
    b1 = append_audit_block(
        db=db_session,
        firm_id=test_firm_id,
        actor_id="srinivas",
        actor_role="PT",
        action="CLIENT_ONBOARDED",
        entity_type="CLIENT",
        entity_id="c01",
        payload={"client_name": "Zenith Infotech"}
    )
    assert b1.sequence == 1
    assert b1.prev_hash == "0000000000000000000000000000000000000000000000000000000000000000"

    # Block 2
    b2 = append_audit_block(
        db=db_session,
        firm_id=test_firm_id,
        actor_id="rohit",
        actor_role="SA",
        action="GSTR3B_PREPARED",
        entity_type="RETURN",
        entity_id="GSTR3B-092026",
        payload={"liability": 3842600.0}
    )
    assert b2.sequence == 2
    assert b2.prev_hash == b1.block_hash

    # Verify chain mathematically
    report = verify_firm_audit_chain(db_session, test_firm_id)
    assert report["chain_valid"] is True
    assert report["tamper_detected"] is False
    assert report["total_blocks"] == 2
    assert report["head_hash"] == b2.block_hash

def test_cryptographic_audit_chain_tamper_detection(db_session):
    test_firm_id = uuid.uuid4()

    # Append block
    block = append_audit_block(
        db=db_session,
        firm_id=test_firm_id,
        actor_id="kavitha",
        actor_role="AR",
        action="INVOICE_DATA_ENTRY",
        entity_type="INVOICE",
        entity_id="INV-001",
        payload={"amount": 50000}
    )

    # Maliciously modify payload without updating hash (simulate DB tampering)
    block.payload_json = {"amount": 5000000} # 100x modified!
    db_session.commit()

    # Verification must flag tampering
    report = verify_firm_audit_chain(db_session, test_firm_id)
    assert report["chain_valid"] is False
    assert report["tamper_detected"] is True
    assert "Content tampering detected" in report["error"]

def test_gstr1_payload_generator_compliance():
    supplier_gstin = "36AAACN1234F1Z5"
    period = "092026"
    invoices = [
        {
            "invoice_number": "INV-101",
            "invoice_date": "10-09-2026",
            "customer_gstin": "36AABCB2212R1Z8", # Intra-state Telangana (36)
            "pos": "36",
            "taxable_value": 100000.0,
            "tax_rate": 18.0,
            "hsn_code": "998311"
        },
        {
            "invoice_number": "INV-102",
            "invoice_date": "15-09-2026",
            "customer_gstin": "29AAACV5514E1Z3", # Inter-state Karnataka (29)
            "pos": "29",
            "taxable_value": 200000.0,
            "tax_rate": 18.0,
            "hsn_code": "998312"
        },
        {
            "invoice_number": "INV-103",
            "invoice_date": "20-09-2026",
            "customer_gstin": None, # B2C Small
            "pos": "36",
            "taxable_value": 50000.0,
            "tax_rate": 18.0,
            "hsn_code": "998311"
        }
    ]

    res = generate_gstr1_payload(supplier_gstin, period, invoices)
    assert res["status"] == "VALID"
    summary = res["summary"]
    assert summary["invoice_count"] == 3
    assert summary["b2b_buyers"] == 2
    assert summary["total_taxable"] == 350000.0
    # IGST: 200000 * 18% = 36000
    assert summary["total_igst"] == 36000.0
    # CGST & SGST: (100000 + 50000) * 9% = 13500 each
    assert summary["total_cgst"] == 13500.0
    assert summary["total_sgst"] == 13500.0
    assert len(res["payload_hash"]) == 64

def test_gstr3b_liability_and_sec50_interest_computation():
    comp = compute_gstr3b_liability(
        outward_taxable=1000000.0,
        outward_igst=50000.0,
        outward_cgst=65000.0,
        outward_sgst=65000.0,
        eligible_itc_igst=30000.0,
        eligible_itc_cgst=40000.0,
        eligible_itc_sgst=40000.0,
        ineligible_itc=5000.0,
        days_delayed=30 # 30 days delay -> Sec 50 interest applies
    )
    assert comp["status"] == "COMPUTED"
    # Net cash payable: (50k-30k) + (65k-40k) + (65k-40k) = 20k + 25k + 25k = 70,000
    assert comp["cash_tax_payable"]["total_cash"] == 70000.0
    # Section 50 interest: 70000 * 18% * 30 / 365 = 1035.62 -> ₹1036
    penalties = comp["statutory_penalties"]
    assert penalties["section_50_interest"] > 1000.0
    assert penalties["late_fee_cgst"] == 25 * 30
    assert penalties["late_fee_sgst"] == 25 * 30

def test_gsp_filing_simulator_with_arn():
    res = simulate_gsp_filing_submission(
        return_type="GSTR-3B",
        gstin="36AAACN1234F1Z5",
        period="092026",
        dsc_signature="a1b2c3d4e5f6...",
        partner_id="srinivas"
    )
    assert res["status"] == "FILED_SUCCESSFULLY"
    assert res["arn"].startswith("AA36")
    assert len(res["arn"]) >= 15
    assert len(res["receipt_sha256"]) == 64

def test_csv_reconciliation_export():
    csv_resp = export_reconciliation_csv()
    content = csv_resp.body.decode()
    assert "Status,Invoice Number" in content
    assert "Action Required" in content

def test_client_portal_summary_endpoint():
    portal = get_client_portal_summary("c01")
    assert portal["status"] == "success"
    assert portal["client_name"] == "Zenith Infotech Solutions Pvt Ltd"
    assert len(portal["filings"]) >= 3
    assert len(portal["active_notices"]) >= 1

def test_partner_employee_id_creation_and_rbac(db_session):
    # Partner provisions Manager ID
    req = CreateEmployeeRequest(
        full_name="CA Divya Reddy",
        email=f"divya-{uuid.uuid4().hex[:6]}@nallamala.in",
        role="MG",
        membership_no="249812",
        focus="GST Advisory & Rule 88D Reconciliations",
        partner_id="srinivas",
        partner_role="PT"
    )
    res = create_employee_id(req, db_session)
    assert res["status"] == "CREATED"
    assert res["employee_id"].startswith("EMP-")
    assert res["role"] == "MG"
    assert res["role_title"] == "Manager"
    assert res["sqc1_logged"] is True

def test_employee_creation_non_partner_rejection(db_session):
    # Article Trainee (AR) attempts to create employee ID
    unauthorized_req = CreateEmployeeRequest(
        full_name="Unauthorized Person",
        email="unauth@nallamala.in",
        role="AR",
        partner_id="kavitha",
        partner_role="AR" # Not a partner!
    )
    with pytest.raises(HTTPException) as exc_info:
        create_employee_id(unauthorized_req, db_session)
    assert exc_info.value.status_code == 403
    assert "Statutory Authority Violation" in exc_info.value.detail

def test_live_tracker_telemetry_and_portal_sync(db_session):
    # Check live tracker
    telemetry = get_live_tracker_telemetry(db_session)
    assert telemetry["status"] == "LIVE_TELEMETRY"
    assert "statutory_clock" in telemetry
    assert "gstr1" in telemetry["statutory_clock"]
    assert "gstr3b" in telemetry["statutory_clock"]
    assert len(telemetry["live_filing_stream"]) >= 3
    assert "stage_6_filed_and_acknowledged" in telemetry["pipeline_stages"]

    # Trigger live portal sync handshake
    sync_res = trigger_portal_live_sync(PortalSyncRequest(period="2026-09"))
    assert sync_res["status"] == "PORTAL_SYNC_COMPLETED"
    assert sync_res["handshake_latency_ms"] > 0
    assert sync_res["updates_detected"]["new_vendor_invoices_in_2b"] > 0

def test_live_statutory_calendar_deadlines_and_buffers():
    cal = get_live_statutory_calendar()
    assert cal["status"] == "LIVE_CALENDAR_ACTIVE"
    assert cal["total_deadlines"] >= 10
    assert cal["internal_safe_buffer_days"] == 3
    forms = [d["form"] for d in cal["deadlines"]]
    assert "GSTR-1" in forms
    assert "GSTR-3B" in forms
    assert "Form 3CA / 3CB - 3CD" in forms

def test_live_statutory_calendar_portal_sync_handshake(db_session):
    sync_res = sync_live_statutory_calendar(db_session)
    assert sync_res["status"] == "SYNCED_WITH_PORTALS"
    assert "gstn" in sync_res["portals"]
    assert "incometax" in sync_res["portals"]
    assert len(sync_res["active_government_notifications"]) >= 2
    assert len(sync_res["calendar_hash"]) == 64


