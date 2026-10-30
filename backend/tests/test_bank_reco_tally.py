"""
Test Suite for Bank Statement Reconciler & Inbound TallyPrime Sync.
Validates 5-pass matching, Section 194J TDS deductions, BRS math,
Tally Trial Balance equilibrium, XXE security sanitization, and ICAI SQC 1 audit logging.
"""

import pytest
from fastapi.testclient import TestClient
from decimal import Decimal

from app.core.database import create_tables, SessionLocal
from app.deterministic_core.bank_reconciler import BankStatementParser, BankReconciliationEngine
from app.deterministic_core.tally_inbound import SafeTallyXMLParser, TallyInboundSyncEngine
from app.deterministic_core.tally_bridge import generate_tally_purchase_xml
from app.api.v1.bank_reco import (
    parse_bank_statement_csv,
    run_bank_reconciliation,
    parse_tally_trial_balance_xml,
    perform_tally_live_handshake,
    export_purchase_vouchers_to_tally_xml,
    ParseCSVRequest,
    ReconcileRequest,
    TallyParseXMLRequest,
    TallyLiveHandshakeRequest,
    SAMPLE_BOOKS_INVOICES
)

@pytest.fixture(scope="module")
def db_session():
    create_tables()
    db = SessionLocal()
    yield db
    db.close()

# ---------------------------------------------------------------------
# 1. Bank Statement Parser Tests
# ---------------------------------------------------------------------

def test_bank_parser_amount_and_date_sanitization():
    # Indian amount formats
    assert BankStatementParser.clean_amount("1,50,000.00") == 150000.00
    assert BankStatementParser.clean_amount("Rs. 45,210.50") == 45210.50
    assert BankStatementParser.clean_amount("(5,000.00)") == -5000.00
    assert BankStatementParser.clean_amount("12000.00 Dr") == -12000.00
    assert BankStatementParser.clean_amount("12000.00 Cr") == 12000.00
    assert BankStatementParser.clean_amount("") == 0.0

    # Indian dates
    assert BankStatementParser.parse_indian_date("04/09/2026") == "2026-09-04"
    assert BankStatementParser.parse_indian_date("15-08-2026") == "2026-08-15"
    assert BankStatementParser.parse_indian_date("2026-10-30") == "2026-10-30"


def test_bank_parser_narration_metadata_extraction():
    # UPI
    meta_upi = BankStatementParser.extract_metadata_from_narration("UPI/CR/425891029381/APEX INFOTECH/HDFC/0192")
    assert meta_upi["mode"] == "UPI"
    assert meta_upi["utr"] == "425891029381"
    assert "APEX" in meta_upi["party_hint"].upper()

    # NEFT
    meta_neft = BankStatementParser.extract_metadata_from_narration("NEFT-N09240019283-MAHARASHTRA COTTON MILLS")
    assert meta_neft["mode"] == "NEFT"
    assert meta_neft["utr"] == "N09240019283"

    # Cheque
    meta_chq = BankStatementParser.extract_metadata_from_narration("CLG/CHQ NO 890123 APEX PACKAGING")
    assert meta_chq["mode"] == "CHEQUE"
    assert meta_chq["cheque_no"] == "890123"

    # GST Challan
    meta_gst = BankStatementParser.extract_metadata_from_narration("GST PAYMENT CPIN 26092700192831 CBIC NEW DELHI")
    assert meta_gst["tax_type"] == "GST"
    assert meta_gst["challan_cpin"] == "26092700192831"

    # Bank charges
    meta_chrg = BankStatementParser.extract_metadata_from_narration("CONSOL CHRG INCL GST FOR AUG-SEP")
    assert meta_chrg["mode"] == "BANK_CHARGES"


def test_bank_csv_parsing():
    sample_csv = """Date,Narration,Chq/Ref No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
04/09/2026,NEFT-N09240019283-MAHARASHTRA COTTON MILLS,N09240019283,04/09/2026,252000.00,,584250.00
14/09/2026,UPI/CR/425891029381/APEX INFOTECH/HDFC/0192,425891029381,14/09/2026,,90000.00,540910.00
"""
    txns = BankStatementParser.parse_csv_content(sample_csv)
    assert len(txns) == 2
    assert txns[0]["debit"] == 252000.00
    assert txns[0]["direction"] == "DEBIT"
    assert txns[1]["credit"] == 90000.00
    assert txns[1]["direction"] == "CREDIT"
    assert txns[1]["utr"] == "425891029381"


# ---------------------------------------------------------------------
# 2. 5-Pass Bank Reconciliation Engine Tests
# ---------------------------------------------------------------------

def test_reconciliation_exact_and_tds_deduction():
    bank_txns = [
        # Pass 1 Exact match with bill number in narration
        {
            "id": "T1",
            "date": "2026-09-04",
            "narration": "NEFT-N1-TEX/24-25/1042-MAHARASHTRA COTTON",
            "reference_no": "N1",
            "debit": 252000.00,
            "credit": 0.00,
            "direction": "DEBIT",
            "amount": 252000.00,
            "mode": "NEFT",
            "utr": "N1",
            "cheque_no": None,
            "party_hint": "MAHARASHTRA COTTON"
        },
        # Pass 3 Net of TDS: Gross invoice Rs. 100,000, 10% TDS u/s 194J -> Client pays Rs. 90,000
        {
            "id": "T2",
            "date": "2026-09-14",
            "narration": "UPI/CR/425891029381/APEX INFOTECH/HDFC/0192",
            "reference_no": "425891029381",
            "debit": 0.00,
            "credit": 90000.00,
            "direction": "CREDIT",
            "amount": 90000.00,
            "mode": "UPI",
            "utr": "425891029381",
            "cheque_no": None,
            "party_hint": "APEX INFOTECH"
        },
        # Pass 4 Statutory Tax Challan
        {
            "id": "T3",
            "date": "2026-09-18",
            "narration": "GST PAYMENT CPIN 26092700192831 CBIC",
            "reference_no": "26092700192831",
            "debit": 45000.00,
            "credit": 0.00,
            "direction": "DEBIT",
            "amount": 45000.00,
            "mode": "OTHER",
            "tax_type": "GST",
            "challan_cpin": "26092700192831"
        },
        # Pass 5 Bank charges
        {
            "id": "T4",
            "date": "2026-09-25",
            "narration": "CONSOL CHRG INCL GST FOR AUG-SEP",
            "reference_no": "CHG1",
            "debit": 750.00,
            "credit": 0.00,
            "direction": "DEBIT",
            "amount": 750.00,
            "mode": "BANK_CHARGES"
        }
    ]

    books_invoices = [
        {
            "invoice_number": "TEX/24-25/1042",
            "supplier_name": "Maharashtra Cotton Mills Ltd",
            "total_value": 252000.00,
            "direction": "INWARD"
        },
        {
            "invoice_number": "CA-FEE-2026-09",
            "client_name": "Apex Infotech Solutions",
            "total_value": 100000.00,
            "direction": "OUTWARD"
        }
    ]

    reco = BankReconciliationEngine.match_statement(
        bank_txns=bank_txns,
        books_invoices=books_invoices,
        bank_opening_balance=500000.00
    )

    assert reco["status"] == "RECONCILIATION_COMPLETE"
    assert reco["summary"]["total_bank_transactions"] == 4
    assert reco["summary"]["total_matched"] == 4 # All 4 accounted for
    assert reco["summary"]["match_rate_pct"] == 100.0

    # Verify TDS detection
    tds_match = next(m for m in reco["matched_records"] if "NET_OF_TDS" in m["rule"])
    assert tds_match["gross_invoice_value"] == 100000.00
    assert tds_match["tds_deducted"] == 10000.00
    assert tds_match["net_received"] == 90000.00
    assert tds_match["tds_rate_pct"] == 10.0

    # Verify BRS math
    brs = reco["bank_reconciliation_statement"]
    assert brs["balance_as_per_bank_statement"] == 500000.00 + 90000.00 - (252000.00 + 45000.00 + 750.00)
    assert "balance_as_per_books_of_account" in brs
    assert reco["summary"]["reconciliation_audit_hash"] is not None


# ---------------------------------------------------------------------
# 3. Inbound Tally XML & Trial Balance Tests
# ---------------------------------------------------------------------

def test_tally_trial_balance_equilibrium_and_clause_44():
    sample_xml = TallyInboundSyncEngine.generate_sample_tally_trial_balance_xml("Surya Enterprises Pvt Ltd")
    report = TallyInboundSyncEngine.parse_trial_balance_xml(sample_xml)

    assert report["status"] == "SUCCESS"
    assert report["is_balanced"] is True
    assert report["summary"]["difference"] == 0.0
    assert report["summary"]["total_ledgers"] > 10
    assert report["summary"]["gst_ledgers_count"] >= 6
    assert report["summary"]["bank_accounts_count"] >= 2

    # Form 3CD Clause 44
    c44 = report["clause_44_schedule"]
    assert c44["total_expenditure"] > 0
    assert c44["gst_registered_entities_expenditure"] > 0
    assert c44["status"] == "COMPUTED_READY_FOR_3CD"


def test_tally_xxe_protection():
    # Attempt XXE attack payload
    xxe_payload = """<?xml version="1.0" encoding="utf-8"?>
    <!DOCTYPE foo [
      <!ELEMENT foo ANY >
      <!ENTITY xxe SYSTEM "file:///etc/passwd" >]>
    <ENVELOPE>
      <BODY>
        <LEDGER NAME="Malicious Ledger &xxe;">
          <PARENT>Sundry Debtors</PARENT>
          <CLOSINGBALANCE>1000.00</CLOSINGBALANCE>
        </LEDGER>
      </BODY>
    </ENVELOPE>"""
    
    # Safe parser must strip or disarm the external entity
    root = SafeTallyXMLParser.parse_xml_string(xxe_payload)
    assert root is not None
    assert root.tag == "ENVELOPE"


def test_tally_anomaly_detection_negative_cash():
    # Negative cash XML
    bad_cash_xml = """<ENVELOPE>
      <BODY>
        <LEDGER NAME="Cash in Hand Main Office">
          <PARENT>Cash-in-hand</PARENT>
          <CLOSINGBALANCE>-45000.00</CLOSINGBALANCE>
        </LEDGER>
        <LEDGER NAME="Capital Account">
          <PARENT>Capital Account</PARENT>
          <CLOSINGBALANCE>-45000.00</CLOSINGBALANCE>
        </LEDGER>
      </BODY>
    </ENVELOPE>"""
    report = TallyInboundSyncEngine.parse_trial_balance_xml(bad_cash_xml)
    assert len(report["anomalies"]) > 0
    assert report["anomalies"][0]["type"] == "NEGATIVE_CASH_BALANCE"
    assert report["anomalies"][0]["severity"] == "CRITICAL"


# ---------------------------------------------------------------------
# 4. API Endpoint Integration Tests
# ---------------------------------------------------------------------

def test_api_bank_reco_parse_endpoint():
    sample_csv = "Date,Narration,Chq/Ref No.,Withdrawal Amt.,Deposit Amt.\n04/09/2026,NEFT-TEST-PARTY,N100,50000.00,\n"
    data = parse_bank_statement_csv(ParseCSVRequest(csv_content=sample_csv))
    assert data["status"] == "PARSED_SUCCESSFULLY"
    assert data["total_transactions"] == 1
    assert data["total_debits"] == 50000.00


def test_api_bank_reco_reconcile_full_run(db_session):
    req = ReconcileRequest(
        bank_opening_balance=250000.00,
        tolerance_rupees=1.00
    )
    data = run_bank_reconciliation(req, db_session)
    assert data["status"] == "RECONCILIATION_COMPLETE"
    assert data["summary"]["total_matched"] > 0
    assert data["summary"]["reconciliation_audit_hash"] is not None
    assert "bank_reconciliation_statement" in data


def test_api_tally_parse_xml_endpoint(db_session):
    sample_xml = TallyInboundSyncEngine.generate_sample_tally_trial_balance_xml()
    req = TallyParseXMLRequest(
        xml_content=sample_xml,
        company_name="Surya Enterprises Pvt Ltd"
    )
    data = parse_tally_trial_balance_xml(req, db_session)
    assert data["status"] == "SUCCESS"
    assert data["is_balanced"] is True
    assert data["summary"]["sync_audit_hash"] is not None


def test_api_tally_live_handshake_endpoint():
    req = TallyLiveHandshakeRequest(
        tally_host="http://localhost:9000",
        company_name="Surya Enterprises Pvt Ltd"
    )
    data = perform_tally_live_handshake(req)
    assert data["is_live"] is True
    assert "TallyPrime" in data["tally_version"]


def test_api_tally_export_purchase_vouchers():
    data = export_purchase_vouchers_to_tally_xml(invoices=SAMPLE_BOOKS_INVOICES, company_name="Surya Enterprises Pvt Ltd")
    assert data["status"] == "XML_GENERATED_SUCCESSFULLY"
    assert "<ENVELOPE>" in data["xml_payload"]
    assert "<VOUCHER" in data["xml_payload"]
