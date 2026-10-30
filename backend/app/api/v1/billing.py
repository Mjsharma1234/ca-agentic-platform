"""
Billing & Invoicing API — Nallamala & Co., Chartered Accountants
Prefix: /billing
Pattern: In-memory data store, same as clients.py / gates.py
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime, date
import uuid

router = APIRouter(prefix="/billing", tags=["billing"])


# ---------------------------------------------------------------------------
# Enums & Pydantic models
# ---------------------------------------------------------------------------

class FirmInvoiceStatus(str, Enum):
    DRAFT = "DRAFT"
    SENT = "SENT"
    VIEWED = "VIEWED"
    PAID = "PAID"
    OVERDUE = "OVERDUE"
    PARTIALLY_PAID = "PARTIALLY_PAID"


class ServiceLine(BaseModel):
    description: str
    sac_code: str = "998215"
    quantity: float = 1.0
    rate: float
    amount: float


class FirmInvoice(BaseModel):
    id: str
    invoice_number: str            # e.g. "NC/26-27/00142"
    client_id: str
    client_name: str
    client_gstin: str
    client_pan: str
    services: List[ServiceLine]
    subtotal: float
    gst_rate: float                # 18 for CA services
    gst_amount: float
    total_amount: float
    tds_194j_rate: float           # 10% TDS under Section 194J
    tds_194j_amount: float
    net_receivable: float          # total_amount - tds_194j_amount
    status: FirmInvoiceStatus
    issue_date: str
    due_date: str
    period_of_service: str         # e.g. "October 2026"
    payment_received: float = 0.0
    payment_date: Optional[str] = None
    payment_reference: Optional[str] = None   # UTR / cheque no
    notes: str = ""
    created_by: str = "Amit Sharma"
    template: str = "standard"     # standard | detailed | retainer
    sent_at: Optional[str] = None


class CreateInvoiceRequest(BaseModel):
    client_id: str
    client_name: str
    client_gstin: str
    client_pan: str
    services: List[ServiceLine]
    period_of_service: str
    issue_date: str
    due_date: str
    notes: str = ""
    created_by: str = "Amit Sharma"
    template: str = "standard"


class RecordPaymentRequest(BaseModel):
    amount: float
    payment_date: str
    reference: str = ""
    tds_deducted: bool = True


class GenerateFromWorkRequest(BaseModel):
    client_id: str
    obligation_ids: List[str]
    period_of_service: str
    issue_date: str
    due_date: str


# ---------------------------------------------------------------------------
# Rate Card
# ---------------------------------------------------------------------------

RATE_CARD: Dict[str, Dict[str, Any]] = {
    "GST_MONTHLY_COMPLIANCE": {
        "description": "GST Monthly Compliance (GSTR-1, GSTR-3B, IMS)",
        "sac": "998215",
        "rate": 8000,
    },
    "GST_ANNUAL_RETURN": {
        "description": "GST Annual Return (GSTR-9)",
        "sac": "998215",
        "rate": 25000,
    },
    "INCOME_TAX_RETURN_INDIVIDUAL": {
        "description": "Income Tax Return - Individual",
        "sac": "998215",
        "rate": 5000,
    },
    "INCOME_TAX_RETURN_COMPANY": {
        "description": "Income Tax Return - Company (ITR-6)",
        "sac": "998215",
        "rate": 35000,
    },
    "TAX_AUDIT_3CD": {
        "description": "Tax Audit Report (Form 3CD)",
        "sac": "998215",
        "rate": 75000,
    },
    "TDS_QUARTERLY_RETURN": {
        "description": "TDS Quarterly Return (26Q/27Q)",
        "sac": "998215",
        "rate": 6000,
    },
    "ROC_ANNUAL_FILING": {
        "description": "ROC Annual Filing (MGT-7, AOC-4)",
        "sac": "998215",
        "rate": 15000,
    },
    "NOTICE_HANDLING": {
        "description": "Notice Handling & Reply",
        "sac": "998215",
        "rate": 20000,
    },
    "GSTR_9C_AUDIT": {
        "description": "GSTR-9C Reconciliation Statement",
        "sac": "998215",
        "rate": 50000,
    },
}


# ---------------------------------------------------------------------------
# Helper: compute invoice financials
# ---------------------------------------------------------------------------

GST_RATE = 18.0
TDS_194J_RATE = 10.0


def _compute(services: List[ServiceLine]) -> Dict[str, float]:
    subtotal = sum(s.amount for s in services)
    gst_amount = round(subtotal * GST_RATE / 100, 2)
    total_amount = round(subtotal + gst_amount, 2)
    tds_194j_amount = round(subtotal * TDS_194J_RATE / 100, 2)   # TDS on professional fees (pre-GST)
    net_receivable = round(total_amount - tds_194j_amount, 2)
    return {
        "subtotal": subtotal,
        "gst_rate": GST_RATE,
        "gst_amount": gst_amount,
        "total_amount": total_amount,
        "tds_194j_rate": TDS_194J_RATE,
        "tds_194j_amount": tds_194j_amount,
        "net_receivable": net_receivable,
    }


def _next_invoice_number(existing: List[Dict]) -> str:
    """Generate next invoice number NC/26-27/XXXXX"""
    max_seq = 141
    for inv in existing:
        num_part = inv.get("invoice_number", "").split("/")
        if len(num_part) == 3:
            try:
                seq = int(num_part[2])
                if seq > max_seq:
                    max_seq = seq
            except ValueError:
                pass
    return f"NC/26-27/{max_seq + 1:05d}"


# ---------------------------------------------------------------------------
# Seed Data — 6 realistic invoices
# ---------------------------------------------------------------------------

def _make(invoice_number, client_id, client_name, client_gstin, client_pan,
          services_raw, status, issue_date, due_date, period_of_service,
          payment_received=0.0, payment_date=None, payment_reference=None,
          notes="", template="standard", sent_at=None):
    services = [ServiceLine(**s) for s in services_raw]
    fin = _compute(services)
    return {
        "id": str(uuid.uuid4()),
        "invoice_number": invoice_number,
        "client_id": client_id,
        "client_name": client_name,
        "client_gstin": client_gstin,
        "client_pan": client_pan,
        "services": [s.model_dump() for s in services],
        "subtotal": fin["subtotal"],
        "gst_rate": fin["gst_rate"],
        "gst_amount": fin["gst_amount"],
        "total_amount": fin["total_amount"],
        "tds_194j_rate": fin["tds_194j_rate"],
        "tds_194j_amount": fin["tds_194j_amount"],
        "net_receivable": fin["net_receivable"],
        "status": status,
        "issue_date": issue_date,
        "due_date": due_date,
        "period_of_service": period_of_service,
        "payment_received": payment_received,
        "payment_date": payment_date,
        "payment_reference": payment_reference,
        "notes": notes,
        "created_by": "Amit Sharma",
        "template": template,
        "sent_at": sent_at,
    }


IN_MEMORY_INVOICES: List[Dict[str, Any]] = [
    # 1 — Rajesh Textiles: PAID (GST Compliance + TDS Return)
    _make(
        invoice_number="NC/26-27/00138",
        client_id="c1",
        client_name="Rajesh Textiles Pvt Ltd",
        client_gstin="27AAACR1234F1Z5",
        client_pan="AAACR1234F",
        services_raw=[
            {"description": "GST Monthly Compliance (GSTR-1, GSTR-3B, IMS)", "sac_code": "998215", "quantity": 1, "rate": 8000, "amount": 8000},
            {"description": "TDS Quarterly Return (26Q/27Q)", "sac_code": "998215", "quantity": 1, "rate": 6000, "amount": 6000},
        ],
        status="PAID",
        issue_date="2026-10-01",
        due_date="2026-10-15",
        period_of_service="September 2026",
        payment_received=15340.0,      # net_receivable after TDS
        payment_date="2026-10-10",
        payment_reference="NEFT/HDFC/20261010/882341",
        notes="Payment received via NEFT. TDS Certificate (Form 16A) to be collected.",
        template="standard",
        sent_at="2026-10-02T09:00:00",
    ),

    # 2 — Mumbai Steel: OVERDUE (Tax Audit + ITR)
    _make(
        invoice_number="NC/26-27/00139",
        client_id="c2",
        client_name="Mumbai Steel Corporation",
        client_gstin="27BBBCM5678G1Z2",
        client_pan="BBBCM5678G",
        services_raw=[
            {"description": "Tax Audit Report (Form 3CD)", "sac_code": "998215", "quantity": 1, "rate": 75000, "amount": 75000},
            {"description": "Income Tax Return - Company (ITR-6)", "sac_code": "998215", "quantity": 1, "rate": 35000, "amount": 35000},
        ],
        status="OVERDUE",
        issue_date="2026-09-15",
        due_date="2026-09-30",
        period_of_service="FY 2025-26",
        payment_received=0.0,
        notes="Follow up with Finance team (Mr. Kapoor). Last reminder sent on 10-Oct-2026.",
        template="detailed",
        sent_at="2026-09-16T10:00:00",
    ),

    # 3 — Global Tech: SENT (GST Compliance + ROC Filing)
    _make(
        invoice_number="NC/26-27/00140",
        client_id="c3",
        client_name="Global Tech Solutions LLP",
        client_gstin="29CCCGT9012H1Z8",
        client_pan="CCCGT9012H",
        services_raw=[
            {"description": "GST Monthly Compliance (GSTR-1, GSTR-3B, IMS)", "sac_code": "998215", "quantity": 1, "rate": 12000, "amount": 12000},
            {"description": "ROC Annual Filing (MGT-7, AOC-4)", "sac_code": "998215", "quantity": 1, "rate": 15000, "amount": 15000},
        ],
        status="SENT",
        issue_date="2026-10-05",
        due_date="2026-10-20",
        period_of_service="October 2026",
        payment_received=0.0,
        notes="Includes LLP Annual Return for FY 2025-26.",
        template="standard",
        sent_at="2026-10-05T11:30:00",
    ),

    # 4 — Sharma & Sons: DRAFT (Notice Handling)
    _make(
        invoice_number="NC/26-27/00141",
        client_id="c4",
        client_name="Sharma & Sons Logistics",
        client_gstin="07DDDSA3456J1Z1",
        client_pan="DDDSA3456J",
        services_raw=[
            {"description": "Notice Handling & Reply", "sac_code": "998215", "quantity": 1, "rate": 20000, "amount": 20000},
            {"description": "Income Tax Return - Individual", "sac_code": "998215", "quantity": 2, "rate": 5000, "amount": 10000},
        ],
        status="DRAFT",
        issue_date="2026-10-28",
        due_date="2026-11-12",
        period_of_service="October 2026",
        payment_received=0.0,
        notes="Notice received under Sec 143(2). ITR for Mr. Sharma and Mrs. Sharma.",
        template="standard",
    ),

    # 5 — Kerala Spices: PARTIALLY_PAID (GSTR-9C + GST Compliance)
    _make(
        invoice_number="NC/26-27/00142",
        client_id="c5",
        client_name="Kerala Spices Export Pvt Ltd",
        client_gstin="32EEEKS7890K1Z4",
        client_pan="EEEKS7890K",
        services_raw=[
            {"description": "GSTR-9C Reconciliation Statement", "sac_code": "998215", "quantity": 1, "rate": 50000, "amount": 50000},
            {"description": "GST Monthly Compliance (GSTR-1, GSTR-3B, IMS)", "sac_code": "998215", "quantity": 3, "rate": 8000, "amount": 24000},
        ],
        status="PARTIALLY_PAID",
        issue_date="2026-09-20",
        due_date="2026-10-05",
        period_of_service="FY 2025-26 (Retainer Q3)",
        payment_received=40000.0,
        payment_date="2026-10-01",
        payment_reference="IMPS/ICICI/20261001/441882",
        notes="Advance of ₹40,000 received. Balance ₹43,584 outstanding.",
        template="retainer",
        sent_at="2026-09-21T09:00:00",
    ),

    # 6 — Deccan Precision: SENT (DRC Notice + Tax Audit)
    _make(
        invoice_number="NC/26-27/00143",
        client_id="c6",
        client_name="Deccan Precision Auto Ltd",
        client_gstin="36FFFDP4321L1Z9",
        client_pan="FFFDP4321L",
        services_raw=[
            {"description": "Notice Handling & Reply", "sac_code": "998215", "quantity": 1, "rate": 20000, "amount": 20000},
            {"description": "Tax Audit Report (Form 3CD)", "sac_code": "998215", "quantity": 1, "rate": 120000, "amount": 120000},
            {"description": "GSTR-9C Reconciliation Statement", "sac_code": "998215", "quantity": 1, "rate": 50000, "amount": 50000},
        ],
        status="SENT",
        issue_date="2026-10-25",
        due_date="2026-11-10",
        period_of_service="FY 2025-26",
        payment_received=0.0,
        notes="DRC-01C Rule 88D Notice Handling. High-priority — partner involvement required.",
        template="detailed",
        sent_at="2026-10-25T14:00:00",
    ),
]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/invoices")
async def list_invoices(
    status: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
):
    result = IN_MEMORY_INVOICES
    if status:
        result = [inv for inv in result if inv["status"] == status.upper()]
    if client_id:
        result = [inv for inv in result if inv["client_id"] == client_id]
    return result


@router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str):
    for inv in IN_MEMORY_INVOICES:
        if inv["id"] == invoice_id:
            return inv
    raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")


@router.post("/invoices")
async def create_invoice(req: CreateInvoiceRequest):
    fin = _compute(req.services)
    new_inv = {
        "id": str(uuid.uuid4()),
        "invoice_number": _next_invoice_number(IN_MEMORY_INVOICES),
        "client_id": req.client_id,
        "client_name": req.client_name,
        "client_gstin": req.client_gstin,
        "client_pan": req.client_pan,
        "services": [s.model_dump() for s in req.services],
        **fin,
        "status": FirmInvoiceStatus.DRAFT,
        "issue_date": req.issue_date,
        "due_date": req.due_date,
        "period_of_service": req.period_of_service,
        "payment_received": 0.0,
        "payment_date": None,
        "payment_reference": None,
        "notes": req.notes,
        "created_by": req.created_by,
        "template": req.template,
        "sent_at": None,
    }
    IN_MEMORY_INVOICES.insert(0, new_inv)
    return new_inv


@router.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, data: Dict[str, Any]):
    for inv in IN_MEMORY_INVOICES:
        if inv["id"] == invoice_id:
            inv.update(data)
            return inv
    raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")


@router.post("/invoices/{invoice_id}/send")
async def send_invoice(invoice_id: str):
    for inv in IN_MEMORY_INVOICES:
        if inv["id"] == invoice_id:
            inv["status"] = FirmInvoiceStatus.SENT
            inv["sent_at"] = datetime.utcnow().isoformat()
            return inv
    raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")


@router.post("/invoices/{invoice_id}/record-payment")
async def record_payment(invoice_id: str, req: RecordPaymentRequest):
    for inv in IN_MEMORY_INVOICES:
        if inv["id"] == invoice_id:
            inv["payment_received"] = inv.get("payment_received", 0.0) + req.amount
            inv["payment_date"] = req.payment_date
            inv["payment_reference"] = req.reference
            # Determine new status
            if req.tds_deducted:
                threshold = inv["net_receivable"]
            else:
                threshold = inv["total_amount"]
            if inv["payment_received"] >= threshold - 0.01:
                inv["status"] = FirmInvoiceStatus.PAID
            else:
                inv["status"] = FirmInvoiceStatus.PARTIALLY_PAID
            return inv
    raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")


@router.get("/invoices/{invoice_id}/pdf-data")
async def get_invoice_pdf_data(invoice_id: str):
    for inv in IN_MEMORY_INVOICES:
        if inv["id"] == invoice_id:
            return {
                "firm": {
                    "name": "Nallamala & Co.",
                    "full_name": "Nallamala & Co., Chartered Accountants",
                    "address": "4th Floor, Kaveri Towers, Nampally, Hyderabad - 500 001",
                    "gstin": "36AABFN1234C1Z8",
                    "pan": "AABFN1234C",
                    "frn": "FRN: 015312S",
                    "phone": "+91-40-2323-4567",
                    "email": "billing@nallamala.ca",
                },
                "invoice": inv,
            }
    raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")


@router.get("/summary")
async def get_billing_summary():
    current_month = "2026-10"
    total_billed_mtd = sum(
        inv["total_amount"]
        for inv in IN_MEMORY_INVOICES
        if inv["issue_date"].startswith(current_month)
    )
    total_collected_mtd = sum(
        inv["payment_received"]
        for inv in IN_MEMORY_INVOICES
        if inv.get("payment_date", "")
        and inv["payment_date"].startswith(current_month)
    )
    total_overdue = sum(
        inv["net_receivable"] - inv.get("payment_received", 0.0)
        for inv in IN_MEMORY_INVOICES
        if inv["status"] == FirmInvoiceStatus.OVERDUE
    )
    tds_receivable = sum(
        inv["tds_194j_amount"]
        for inv in IN_MEMORY_INVOICES
        if inv["status"] in (FirmInvoiceStatus.PAID, FirmInvoiceStatus.PARTIALLY_PAID)
    )
    pending_count = sum(
        1 for inv in IN_MEMORY_INVOICES
        if inv["status"] in (FirmInvoiceStatus.DRAFT, FirmInvoiceStatus.SENT, FirmInvoiceStatus.VIEWED)
    )
    overdue_count = sum(
        1 for inv in IN_MEMORY_INVOICES
        if inv["status"] == FirmInvoiceStatus.OVERDUE
    )

    # Top clients by total billed amount
    client_totals: Dict[str, Dict] = {}
    for inv in IN_MEMORY_INVOICES:
        cid = inv["client_id"]
        if cid not in client_totals:
            client_totals[cid] = {"client_id": cid, "client_name": inv["client_name"], "total": 0.0}
        client_totals[cid]["total"] += inv["total_amount"]
    top_clients = sorted(client_totals.values(), key=lambda x: x["total"], reverse=True)[:5]

    return {
        "total_billed_mtd": round(total_billed_mtd, 2),
        "total_collected_mtd": round(total_collected_mtd, 2),
        "total_overdue": round(total_overdue, 2),
        "tds_receivable": round(tds_receivable, 2),
        "pending_invoices_count": pending_count,
        "overdue_invoices_count": overdue_count,
        "top_clients_by_billing": top_clients,
    }


@router.get("/rate-card")
async def get_rate_card():
    return RATE_CARD


@router.post("/invoices/generate-from-work")
async def generate_from_work(req: GenerateFromWorkRequest):
    """Auto-generate invoice from completed obligation IDs using default rate card."""
    # Map obligation type keywords to rate card keys
    obligation_map = {
        "GSTR-1": "GST_MONTHLY_COMPLIANCE",
        "GSTR-3B": "GST_MONTHLY_COMPLIANCE",
        "GSTR-9": "GST_ANNUAL_RETURN",
        "GSTR-9C": "GSTR_9C_AUDIT",
        "ITR": "INCOME_TAX_RETURN_COMPANY",
        "TAX_AUDIT": "TAX_AUDIT_3CD",
        "TDS": "TDS_QUARTERLY_RETURN",
        "ROC": "ROC_ANNUAL_FILING",
        "NOTICE": "NOTICE_HANDLING",
    }
    services = []
    for ob_id in req.obligation_ids:
        matched_key = None
        for keyword, rc_key in obligation_map.items():
            if keyword.lower() in ob_id.lower():
                matched_key = rc_key
                break
        if not matched_key:
            matched_key = "GST_MONTHLY_COMPLIANCE"  # default
        rc = RATE_CARD[matched_key]
        services.append(ServiceLine(
            description=rc["description"],
            sac_code=rc["sac"],
            quantity=1,
            rate=rc["rate"],
            amount=rc["rate"],
        ))

    # Deduplicate by description
    seen = set()
    unique_services = []
    for s in services:
        if s.description not in seen:
            seen.add(s.description)
            unique_services.append(s)

    fin = _compute(unique_services)

    # Look up client details from known clients
    client_lookup = {
        "c1": {"name": "Rajesh Textiles Pvt Ltd", "gstin": "27AAACR1234F1Z5", "pan": "AAACR1234F"},
        "c2": {"name": "Mumbai Steel Corporation", "gstin": "27BBBCM5678G1Z2", "pan": "BBBCM5678G"},
        "c3": {"name": "Global Tech Solutions LLP", "gstin": "29CCCGT9012H1Z8", "pan": "CCCGT9012H"},
        "c4": {"name": "Sharma & Sons Logistics", "gstin": "07DDDSA3456J1Z1", "pan": "DDDSA3456J"},
        "c5": {"name": "Kerala Spices Export Pvt Ltd", "gstin": "32EEEKS7890K1Z4", "pan": "EEEKS7890K"},
        "c6": {"name": "Deccan Precision Auto Ltd", "gstin": "36FFFDP4321L1Z9", "pan": "FFFDP4321L"},
    }
    client_info = client_lookup.get(req.client_id, {"name": "Unknown Client", "gstin": "", "pan": ""})

    new_inv = {
        "id": str(uuid.uuid4()),
        "invoice_number": _next_invoice_number(IN_MEMORY_INVOICES),
        "client_id": req.client_id,
        "client_name": client_info["name"],
        "client_gstin": client_info["gstin"],
        "client_pan": client_info["pan"],
        "services": [s.model_dump() for s in unique_services],
        **fin,
        "status": FirmInvoiceStatus.DRAFT,
        "issue_date": req.issue_date,
        "due_date": req.due_date,
        "period_of_service": req.period_of_service,
        "payment_received": 0.0,
        "payment_date": None,
        "payment_reference": None,
        "notes": f"Auto-generated from obligations: {', '.join(req.obligation_ids)}",
        "created_by": "System (AI Auto-Generate)",
        "template": "standard",
        "sent_at": None,
    }
    IN_MEMORY_INVOICES.insert(0, new_inv)
    return new_inv
