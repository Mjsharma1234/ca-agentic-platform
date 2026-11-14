import uuid
from typing import Dict, Any
from datetime import datetime, date, timedelta
from decimal import Decimal
import hashlib
import json
from sqlalchemy.orm import Session
from sqlalchemy import select, delete

from ..models.billing import FirmBillingInvoice
from ..models.clients import Client, ClientType, ClientStatus, ERPType, RiskTier
from ..models.invoices import Invoice, InvoiceDirection, InvoiceSource, IMSStatus, InvoiceStatus
from ..models.gates import GateDecision, GateStatus, GateTier, RequiredRole
from ..models.returns import GSTReturn, ReturnType, ReturnStatus
from ..models.tenant import Firm

TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
CLIENT_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
CLIENT_GSTIN = "27AABCR1234F1Z8"

SAMPLE_PURCHASE_BILLS = [
    {
        "id": "22222222-0000-0000-0000-000000000001",
        "inv_no": "TEX/24-25/1042",
        "date": "2024-09-04",
        "supplier_gstin": "27AAACW1234M1Z2",
        "supplier_name": "Maharashtra Cotton Mills Ltd",
        "desc": "Cotton Grey Yarn 40s Combed",
        "hsn": "5205",
        "taxable": 240000.00,
        "cgst": 6000.00,
        "sgst": 6000.00,
        "igst": 0.00,
        "confidence": 0.99
    },
    {
        "id": "22222222-0000-0000-0000-000000000002",
        "inv_no": "LOG-89102",
        "date": "2024-09-08",
        "supplier_gstin": "24AAACG5678K1ZQ",
        "supplier_name": "Gujarat Express Roadlines",
        "desc": "Freight Transport Services (Interstate)",
        "hsn": "9965",
        "taxable": 45000.00,
        "cgst": 0.00,
        "sgst": 0.00,
        "igst": 8100.00,
        "confidence": 0.98
    },
    {
        "id": "22222222-0000-0000-0000-000000000003",
        "inv_no": "PAC-2024-091",
        "date": "2024-09-11",
        "supplier_gstin": "27AAACD9988P1Z4",
        "supplier_name": "Apex Poly Packaging LLP",
        "desc": "Corrugated Boxes & Shrink Film",
        "hsn": "4819",
        "taxable": 68000.00,
        "cgst": 6120.00,
        "sgst": 6120.00,
        "igst": 0.00,
        "confidence": 0.97
    },
    {
        "id": "22222222-0000-0000-0000-000000000004",
        "inv_no": "CAR-INS-7721",
        "date": "2024-09-14",
        "supplier_gstin": "27AAACI4321Q1Z9",
        "supplier_name": "Bajaj General Insurance Ltd",
        "desc": "Motor Vehicle Comprehensive Insurance (Director's Car)",
        "hsn": "8703",
        "taxable": 52000.00,
        "cgst": 4680.00,
        "sgst": 4680.00,
        "igst": 0.00,
        "confidence": 0.96
    },
    {
        "id": "22222222-0000-0000-0000-000000000005",
        "inv_no": "DYE/982/24",
        "date": "2024-09-18",
        "supplier_gstin": "27AAACT5544J1Z1",
        "supplier_name": "Surat Specialty Dyes & Chemicals",
        "desc": "Reactive Reactive Dyes Navy Blue",
        "hsn": "3204",
        "taxable": 115000.00,
        "cgst": 10350.00,
        "sgst": 10350.00,
        "igst": 0.00,
        "confidence": 0.99
    },
    {
        "id": "22222222-0000-0000-0000-000000000006",
        "inv_no": "INV-004491",
        "date": "2024-09-21",
        "supplier_gstin": "27AAACR7766T1Z5",
        "supplier_name": "Radha Krishna Spares & Services",
        "desc": "Loom Spare Parts & Machine Bearings",
        "hsn": "8448",
        "taxable": 32000.00,
        "cgst": 2880.00,
        "sgst": 2880.00,
        "igst": 0.00,
        "confidence": 0.88  # Trigger Gate G2
    },
    {
        "id": "22222222-0000-0000-0000-000000000007",
        "inv_no": "AWS-IN-2024-9",
        "date": "2024-09-25",
        "supplier_gstin": "9917USA29005OS7",
        "supplier_name": "Amazon Web Services India",
        "desc": "Cloud Infrastructure & ERP Hosting",
        "hsn": "9983",
        "taxable": 48000.00,
        "cgst": 0.00,
        "sgst": 0.00,
        "igst": 8640.00,
        "confidence": 0.99
    },
    {
        "id": "22222222-0000-0000-0000-000000000008",
        "inv_no": "PETRO-09-411",
        "date": "2024-09-28",
        "supplier_gstin": "27AAACB2211H1Z3",
        "supplier_name": "Bharat Petroleum Dealer Fort",
        "desc": "Diesel for Factory Generator Sets",
        "hsn": "2710",
        "taxable": 35000.00,
        "cgst": 0.00,
        "sgst": 0.00,
        "igst": 0.00,
        "confidence": 0.95
    }
]

SAMPLE_GSTR2B_FEEDS = [
    # Matches TEX/24-25/1042 exactly
    {"supplier_gstin": "27AAACW1234M1Z2", "supplier_name": "Maharashtra Cotton Mills Ltd", "invoice_number": "TEX/24-25/1042", "invoice_date": "2024-09-04", "taxable_value": 240000.00, "cgst": 6000.00, "sgst": 6000.00, "igst": 0.00},
    # Matches LOG-89102 via normalized fuzzy
    {"supplier_gstin": "24AAACG5678K1ZQ", "supplier_name": "Gujarat Express Roadlines", "invoice_number": "LOG/89102", "invoice_date": "2024-09-08", "taxable_value": 45000.00, "cgst": 0.00, "sgst": 0.00, "igst": 8100.00},
    # Value mismatch on PAC-2024-091 (Supplier reported 78,000 instead of 68,000)
    {"supplier_gstin": "27AAACD9988P1Z4", "supplier_name": "Apex Poly Packaging LLP", "invoice_number": "PAC-2024-091", "invoice_date": "2024-09-11", "taxable_value": 78000.00, "cgst": 7020.00, "sgst": 7020.00, "igst": 0.00},
    # Ineligible credit under 17(5) reported in 2B
    {"supplier_gstin": "27AAACI4321Q1Z9", "supplier_name": "Bajaj General Insurance Ltd", "invoice_number": "CAR-INS-7721", "invoice_date": "2024-09-14", "taxable_value": 52000.00, "cgst": 4680.00, "sgst": 4680.00, "igst": 0.00},
    # Matches DYE/982/24 exactly
    {"supplier_gstin": "27AAACT5544J1Z1", "supplier_name": "Surat Specialty Dyes & Chemicals", "invoice_number": "DYE/982/24", "invoice_date": "2024-09-18", "taxable_value": 115000.00, "cgst": 10350.00, "sgst": 10350.00, "igst": 0.00},
    # In 2B but missing in client books (Opportunity: ₹14,400 unclaimed credit)
    {"supplier_gstin": "27AAACS9911D1ZX", "supplier_name": "Siemens India Switchgears", "invoice_number": "SIE/OCT/102", "invoice_date": "2024-09-22", "taxable_value": 80000.00, "cgst": 7200.00, "sgst": 7200.00, "igst": 0.00},
    # Matches AWS exactly
    {"supplier_gstin": "9917USA29005OS7", "supplier_name": "Amazon Web Services India", "invoice_number": "AWS-IN-2024-9", "invoice_date": "2024-09-25", "taxable_value": 48000.00, "cgst": 0.00, "sgst": 0.00, "igst": 8640.00}
]

# Demo firm-billing invoices (the firm's own fee invoices, shown on the Billing screen).
# Previously a process-global dict inside app/api/v1/billing.py; now seeded into the
# tenant-scoped firm_billing_invoices table, for the demo tenant only, via the DEBUG-only
# /api/v1/seed endpoint.
SAMPLE_FIRM_BILLING_INVOICES = [
    {
        "invoice_number": "NC/26-27/00138", "client_id": "c1",
        "client_name": "Rajesh Textiles Pvt Ltd", "client_gstin": "27AAACR1234F1Z5", "client_pan": "AAACR1234F",
        "services": [
            {"description": "GST Monthly Compliance (GSTR-1, GSTR-3B, IMS)", "sac_code": "998215", "quantity": 1, "rate": 8000, "amount": 8000},
            {"description": "TDS Quarterly Return (26Q/27Q)", "sac_code": "998215", "quantity": 1, "rate": 6000, "amount": 6000},
        ],
        "status": "PAID", "issue_date": "2026-10-01", "due_date": "2026-10-15",
        "period_of_service": "September 2026", "payment_received": 15340.0,
        "payment_date": "2026-10-10", "payment_reference": "NEFT/HDFC/20261010/882341",
        "notes": "Payment received via NEFT. TDS Certificate (Form 16A) to be collected.",
        "template": "standard", "sent_at": "2026-10-02T09:00:00",
    },
    {
        "invoice_number": "NC/26-27/00139", "client_id": "c2",
        "client_name": "Mumbai Steel Corporation", "client_gstin": "27BBBCM5678G1Z2", "client_pan": "BBBCM5678G",
        "services": [
            {"description": "Tax Audit Report (Form 3CD)", "sac_code": "998215", "quantity": 1, "rate": 75000, "amount": 75000},
            {"description": "Income Tax Return - Company (ITR-6)", "sac_code": "998215", "quantity": 1, "rate": 35000, "amount": 35000},
        ],
        "status": "OVERDUE", "issue_date": "2026-09-15", "due_date": "2026-09-30",
        "period_of_service": "FY 2025-26",
        "notes": "Follow up with Finance team (Mr. Kapoor). Last reminder sent on 10-Oct-2026.",
        "template": "detailed", "sent_at": "2026-09-16T10:00:00",
    },
    {
        "invoice_number": "NC/26-27/00140", "client_id": "c3",
        "client_name": "Global Tech Solutions LLP", "client_gstin": "29CCCGT9012H1Z8", "client_pan": "CCCGT9012H",
        "services": [
            {"description": "GST Monthly Compliance (GSTR-1, GSTR-3B, IMS)", "sac_code": "998215", "quantity": 1, "rate": 12000, "amount": 12000},
            {"description": "ROC Annual Filing (MGT-7, AOC-4)", "sac_code": "998215", "quantity": 1, "rate": 15000, "amount": 15000},
        ],
        "status": "SENT", "issue_date": "2026-10-05", "due_date": "2026-10-20",
        "period_of_service": "October 2026",
        "notes": "Includes LLP Annual Return for FY 2025-26.",
        "template": "standard", "sent_at": "2026-10-05T11:30:00",
    },
    {
        "invoice_number": "NC/26-27/00141", "client_id": "c4",
        "client_name": "Sharma & Sons Logistics", "client_gstin": "07DDDSA3456J1Z1", "client_pan": "DDDSA3456J",
        "services": [
            {"description": "Notice Handling & Reply", "sac_code": "998215", "quantity": 1, "rate": 20000, "amount": 20000},
            {"description": "Income Tax Return - Individual", "sac_code": "998215", "quantity": 2, "rate": 5000, "amount": 10000},
        ],
        "status": "DRAFT", "issue_date": "2026-10-28", "due_date": "2026-11-12",
        "period_of_service": "October 2026",
        "notes": "Notice received under Sec 143(2). ITR for Mr. Sharma and Mrs. Sharma.",
        "template": "standard",
    },
    {
        "invoice_number": "NC/26-27/00142", "client_id": "c5",
        "client_name": "Kerala Spices Export Pvt Ltd", "client_gstin": "32EEEKS7890K1Z4", "client_pan": "EEEKS7890K",
        "services": [
            {"description": "GSTR-9C Reconciliation Statement", "sac_code": "998215", "quantity": 1, "rate": 50000, "amount": 50000},
            {"description": "GST Monthly Compliance (GSTR-1, GSTR-3B, IMS)", "sac_code": "998215", "quantity": 3, "rate": 8000, "amount": 24000},
        ],
        "status": "PARTIALLY_PAID", "issue_date": "2026-09-20", "due_date": "2026-10-05",
        "period_of_service": "FY 2025-26 (Retainer Q3)", "payment_received": 40000.0,
        "payment_date": "2026-10-01", "payment_reference": "IMPS/ICICI/20261001/441882",
        "notes": "Advance of ₹40,000 received. Balance ₹43,584 outstanding.",
        "template": "retainer", "sent_at": "2026-09-21T09:00:00",
    },
    {
        "invoice_number": "NC/26-27/00143", "client_id": "c6",
        "client_name": "Deccan Precision Auto Ltd", "client_gstin": "36FFFDP4321L1Z9", "client_pan": "FFFDP4321L",
        "services": [
            {"description": "Notice Handling & Reply", "sac_code": "998215", "quantity": 1, "rate": 20000, "amount": 20000},
            {"description": "Tax Audit Report (Form 3CD)", "sac_code": "998215", "quantity": 1, "rate": 120000, "amount": 120000},
            {"description": "GSTR-9C Reconciliation Statement", "sac_code": "998215", "quantity": 1, "rate": 50000, "amount": 50000},
        ],
        "status": "SENT", "issue_date": "2026-10-25", "due_date": "2026-11-10",
        "period_of_service": "FY 2025-26",
        "notes": "DRC-01C Rule 88D Notice Handling. High-priority — partner involvement required.",
        "template": "detailed", "sent_at": "2026-10-25T14:00:00",
    },
]


def _seed_firm_billing_invoices(session: Session) -> int:
    """Replaces the demo tenant's firm billing invoices with the sample set above."""
    from ..api.v1.billing import ServiceLine, compute_totals  # lazy: avoids import cycles at module load

    session.execute(delete(FirmBillingInvoice).where(FirmBillingInvoice.tenant_id == TENANT_ID))
    for raw in SAMPLE_FIRM_BILLING_INVOICES:
        services = [ServiceLine(**s) for s in raw["services"]]
        fin = compute_totals(services)
        session.add(FirmBillingInvoice(
            tenant_id=TENANT_ID,
            invoice_number=raw["invoice_number"],
            client_id=raw["client_id"],
            client_name=raw["client_name"],
            client_gstin=raw["client_gstin"],
            client_pan=raw["client_pan"],
            services=[s.model_dump() for s in services],
            subtotal=Decimal(str(fin["subtotal"])),
            gst_rate=Decimal(str(fin["gst_rate"])),
            gst_amount=Decimal(str(fin["gst_amount"])),
            total_amount=Decimal(str(fin["total_amount"])),
            tds_194j_rate=Decimal(str(fin["tds_194j_rate"])),
            tds_194j_amount=Decimal(str(fin["tds_194j_amount"])),
            net_receivable=Decimal(str(fin["net_receivable"])),
            status=raw["status"],
            issue_date=date.fromisoformat(raw["issue_date"]),
            due_date=date.fromisoformat(raw["due_date"]),
            period_of_service=raw["period_of_service"],
            payment_received=Decimal(str(raw.get("payment_received", 0.0))),
            payment_date=date.fromisoformat(raw["payment_date"]) if raw.get("payment_date") else None,
            payment_reference=raw.get("payment_reference"),
            notes=raw.get("notes", ""),
            created_by="Amit Sharma",
            template=raw.get("template", "standard"),
            sent_at=datetime.fromisoformat(raw["sent_at"]) if raw.get("sent_at") else None,
        ))
    return len(SAMPLE_FIRM_BILLING_INVOICES)


def seed_database(session: Session) -> Dict[str, Any]:
    """Clears and seeds the database with a full, realistic CA firm operating dataset."""
    # 1. Clear existing sample data
    session.execute(delete(GateDecision).where(GateDecision.client_id == CLIENT_ID))
    session.execute(delete(Invoice).where(Invoice.client_id == CLIENT_ID))
    session.execute(delete(GSTReturn).where(GSTReturn.client_id == CLIENT_ID))
    session.execute(delete(Client).where(Client.id == CLIENT_ID))
    session.commit()

    # 1b. Ensure the demo firm exists so seeded rows share a tenant with logged-in users
    if session.get(Firm, TENANT_ID) is None and session.execute(select(Firm).limit(1)).first() is None:
        session.add(Firm(
            id=TENANT_ID, firm_code="sharma-associates",
            firm_name="Sharma & Associates, Chartered Accountants", frn="012345S",
            constitution="PARTNERSHIP", head_office_city="Hyderabad",
        ))
        session.flush()

    # 2. Create Client
    client = Client(
        id=CLIENT_ID,
        tenant_id=TENANT_ID,
        client_name="Rajesh Fabrics Private Limited",
        trade_name="Rajesh Textiles Mumbai",
        pan="AABCR1234F",
        gstin=CLIENT_GSTIN,
        client_type=ClientType.COMPANY,
        status=ClientStatus.ACTIVE,
        erp_type=ERPType.TALLY_PRIME,
        risk_tier=RiskTier.LOW,
        annual_turnover=Decimal("18500000.00"),
        is_composition=False,
        financial_year_start="2024-04-01",
        financial_year_end="2025-03-31"
    )
    session.add(client)
    session.flush()

    # 3. Create Invoices
    for b in SAMPLE_PURCHASE_BILLS:
        inv = Invoice(
            id=uuid.UUID(b["id"]),
            tenant_id=TENANT_ID,
            client_id=CLIENT_ID,
            gstin=CLIENT_GSTIN,
            direction=InvoiceDirection.INWARD,
            invoice_number=b["inv_no"],
            invoice_date=b["date"],
            supplier_gstin=b["supplier_gstin"],
            supplier_name=b["supplier_name"],
            buyer_gstin=CLIENT_GSTIN,
            buyer_name="Rajesh Fabrics Pvt Ltd",
            taxable_value=Decimal(str(b["taxable"])),
            cgst=Decimal(str(b["cgst"])),
            sgst=Decimal(str(b["sgst"])),
            igst=Decimal(str(b["igst"])),
            total_value=Decimal(str(b["taxable"] + b["cgst"] + b["sgst"] + b["igst"])),
            hsn_code=b["hsn"],
            source=InvoiceSource.PORTAL_UPLOAD,
            extraction_confidence=b["confidence"],
            ims_status=IMSStatus.PENDING,
            status=InvoiceStatus.VERIFIED if b["confidence"] >= 0.95 else InvoiceStatus.EXTRACTED,
            itc_eligible=False if b["hsn"] == "8703" else True,
            itc_blocked_reason="Section 17(5)(a) Motor Vehicle" if b["hsn"] == "8703" else None,
            metadata_={"goods_description": b["desc"]}
        )
        session.add(inv)

    # 4. Create Active Human Gates
    gate_g2 = GateDecision(
        id=uuid.UUID("33333333-0000-0000-0000-000000000002"),
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        gate_id="G2",
        gate_name="Low-Confidence OCR Verification",
        entity_type="INVOICE",
        entity_id=uuid.UUID("22222222-0000-0000-0000-000000000006"),
        status=GateStatus.PENDING,
        tier=GateTier.L2_STAFF,
        required_role=RequiredRole.STAFF,
        evidence_pack={
            "invoice_number": "INV-004491",
            "supplier_name": "Radha Krishna Spares & Services",
            "confidence_score": 0.88,
            "flagged_fields": ["cgst_amount", "hsn_code"],
            "image_url": "/api/v1/documents/sample-spare-parts.png"
        },
        sla_deadline=datetime.utcnow() + timedelta(hours=4)
    )

    gate_g3 = GateDecision(
        id=uuid.UUID("33333333-0000-0000-0000-000000000003"),
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        gate_id="G3",
        gate_name="Invoice Management System (IMS) Inward Decision Commit",
        entity_type="IMS_BATCH",
        entity_id=CLIENT_ID,
        status=GateStatus.PENDING,
        tier=GateTier.L2_STAFF,
        required_role=RequiredRole.REVIEWER,
        evidence_pack={
            "period": "092024",
            "total_inward_invoices": 7,
            "recommended_accept": 5,
            "recommended_reject": 1,
            "recommended_pending": 1,
            "tax_impact_itc": 47730.00
        },
        sla_deadline=datetime.utcnow() + timedelta(hours=8)
    )

    gate_g4 = GateDecision(
        id=uuid.UUID("33333333-0000-0000-0000-000000000004"),
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        gate_id="G4",
        gate_name="ITC Mismatch & Section 17(5) Claim Review",
        entity_type="ITC_RECO",
        entity_id=CLIENT_ID,
        status=GateStatus.PENDING,
        tier=GateTier.L2_STAFF,
        required_role=RequiredRole.REVIEWER,
        evidence_pack={
            "flagged_item": "CAR-INS-7721 - Bajaj General Insurance",
            "taxable_value": 52000.00,
            "tax_amount": 9360.00,
            "statute_section": "17(5)(a)",
            "warning": "Motor vehicle passenger insurance is blocked unless transportation business."
        },
        sla_deadline=datetime.utcnow() + timedelta(hours=12)
    )

    gate_g6 = GateDecision(
        id=uuid.UUID("33333333-0000-0000-0000-000000000006"),
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        gate_id="G6",
        gate_name="Four-Eyes Return Approval (Maker-Checker Review)",
        entity_type="GST_RETURN",
        entity_id=uuid.UUID("44444444-0000-0000-0000-000000000001"),
        status=GateStatus.PENDING,
        tier=GateTier.L2_STAFF,
        required_role=RequiredRole.MANAGER,
        evidence_pack={
            "return_type": "GSTR-3B",
            "period": "September 2024",
            "preparer": "Rohit Verma (Article Assistant)",
            "outward_tax_liability": 94500.00,
            "eligible_itc_claimed": 31110.00,
            "net_cash_payable": 63390.00,
            "blocking_rules_failed": 0
        },
        sla_deadline=datetime.utcnow() + timedelta(hours=2)
    )

    session.add_all([gate_g2, gate_g3, gate_g4, gate_g6])

    # 5. Create GSTR-3B Return
    gst_return = GSTReturn(
        id=uuid.UUID("44444444-0000-0000-0000-000000000001"),
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        gstin=CLIENT_GSTIN,
        return_type=ReturnType.GSTR3B,
        period="092024",
        financial_year="2024-25",
        status=ReturnStatus.REVIEW_PENDING,
        total_taxable_outward=Decimal("525000.00"),
        total_tax_liability=Decimal("94500.00"),
        total_itc_claimed=Decimal("31110.00"),
        net_tax_payable=Decimal("63390.00"),
        due_date=date(2024, 10, 20)
    )
    return_payload = {
        "return_type": "GSTR3B", "gstin": CLIENT_GSTIN, "period": "092024",
        "total_taxable_outward": "525000.00", "total_tax_liability": "94500.00",
        "total_itc_claimed": "31110.00", "net_tax_payable": "63390.00",
    }
    gst_return.payload_json = return_payload
    gst_return.payload_hash = hashlib.sha256(
        json.dumps(return_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    session.add(gst_return)

    # 6. Firm billing invoices (the firm's own fee invoices, demo tenant only)
    firm_billing_count = _seed_firm_billing_invoices(session)

    session.commit()

    return {
        "status": "success",
        "message": "Database seeded successfully with Rajesh Fabrics Pvt Ltd operating data",
        "client_id": str(CLIENT_ID),
        "invoices_count": len(SAMPLE_PURCHASE_BILLS),
        "gates_count": 4,
        "sample_gstr2b_count": len(SAMPLE_GSTR2B_FEEDS),
        "firm_billing_invoices_count": firm_billing_count,
    }
