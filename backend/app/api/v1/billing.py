"""
Billing & Invoicing API — the firm's own professional-fee invoices to its clients.
Prefix: /billing

Storage: the tenant-scoped `firm_billing_invoices` table (app/models/billing.py). Every query
filters on the caller's tenant_id (PostgreSQL RLS enforces the same underneath), single-object
fetches 404 outside the caller's firm, and monetary totals are always server-computed from the
service lines — never accepted from the request.

Roles: reads need firm staff (ARTICLE_TRAINEE or higher — client-portal users never see the
firm's billing); create / update / send / record-payment need MANAGER or higher.
"""
import uuid
from datetime import date, datetime
from enum import Enum
from typing import Annotated, Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...models.billing import FirmBillingInvoice
from ...models.tenant import Firm
from ..deps import User, require_role

router = APIRouter(prefix="/billing", tags=["billing"])

# Reads: any firm staff member. Writes: manager or above. CLIENT/CLIENT_USER (level 0) get 403.
Viewer = Annotated[User, Depends(require_role("ARTICLE_TRAINEE"))]
Manager = Annotated[User, Depends(require_role("MANAGER"))]


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
    description: str = Field(min_length=1, max_length=300)
    sac_code: str = Field(default="998215", max_length=10)
    quantity: float = Field(default=1.0, gt=0, le=1e6)
    rate: float = Field(ge=0, le=1e10)
    amount: float = Field(ge=0, le=1e12)


class CreateInvoiceRequest(BaseModel):
    client_id: str = Field(min_length=1, max_length=64)
    client_name: str = Field(min_length=1, max_length=200)
    client_gstin: str = Field(default="", max_length=15)
    client_pan: str = Field(default="", max_length=10)
    services: List[ServiceLine] = Field(min_length=1, max_length=100)
    period_of_service: str = Field(default="", max_length=100)
    issue_date: date
    due_date: date
    notes: str = Field(default="", max_length=2000)
    template: str = Field(default="standard", max_length=24)


class UpdateInvoiceRequest(BaseModel):
    """Explicit whitelist of editable fields. Status, payments and every monetary total are
    server-controlled: status changes only through /send and /record-payment, and the totals
    are recomputed from the service lines whenever they change."""
    client_id: Optional[str] = Field(default=None, min_length=1, max_length=64)
    client_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    client_gstin: Optional[str] = Field(default=None, max_length=15)
    client_pan: Optional[str] = Field(default=None, max_length=10)
    services: Optional[List[ServiceLine]] = Field(default=None, min_length=1, max_length=100)
    period_of_service: Optional[str] = Field(default=None, max_length=100)
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=2000)
    template: Optional[str] = Field(default=None, max_length=24)


class RecordPaymentRequest(BaseModel):
    amount: float = Field(gt=0, le=1e12)
    payment_date: date
    reference: str = Field(default="", max_length=100)
    tds_deducted: bool = True


class GenerateFromWorkRequest(BaseModel):
    client_id: str = Field(min_length=1, max_length=64)
    obligation_ids: List[str] = Field(min_length=1, max_length=100)
    period_of_service: str = Field(default="", max_length=100)
    issue_date: date
    due_date: date


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
# Helpers
# ---------------------------------------------------------------------------

GST_RATE = 18.0
TDS_194J_RATE = 10.0


def compute_totals(services: List[ServiceLine]) -> Dict[str, float]:
    """GST + TDS 194J financials, derived from the service lines (the only source of truth)."""
    subtotal = round(sum(s.amount for s in services), 2)
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


def _next_invoice_number(db: Session, tenant_id: uuid.UUID) -> str:
    """Next invoice number NC/26-27/XXXXX within the caller's firm only."""
    numbers = db.execute(
        select(FirmBillingInvoice.invoice_number).where(FirmBillingInvoice.tenant_id == tenant_id)
    ).scalars().all()
    max_seq = 0
    for number in numbers:
        parts = (number or "").split("/")
        if len(parts) == 3:
            try:
                seq = int(parts[2])
                if seq > max_seq:
                    max_seq = seq
            except ValueError:
                pass
    return f"NC/26-27/{max_seq + 1:05d}"


def _apply_totals(inv: FirmBillingInvoice, services: List[ServiceLine]) -> None:
    fin = compute_totals(services)
    inv.services = [s.model_dump() for s in services]
    inv.subtotal = fin["subtotal"]
    inv.gst_rate = fin["gst_rate"]
    inv.gst_amount = fin["gst_amount"]
    inv.total_amount = fin["total_amount"]
    inv.tds_194j_rate = fin["tds_194j_rate"]
    inv.tds_194j_amount = fin["tds_194j_amount"]
    inv.net_receivable = fin["net_receivable"]


def _serialize(inv: FirmBillingInvoice) -> Dict[str, Any]:
    """Same JSON shape the in-memory store used to return (the web tracker consumes it)."""
    return {
        "id": str(inv.id),
        "invoice_number": inv.invoice_number,
        "client_id": inv.client_id,
        "client_name": inv.client_name,
        "client_gstin": inv.client_gstin or "",
        "client_pan": inv.client_pan or "",
        "services": inv.services or [],
        "subtotal": float(inv.subtotal or 0),
        "gst_rate": float(inv.gst_rate or 0),
        "gst_amount": float(inv.gst_amount or 0),
        "total_amount": float(inv.total_amount or 0),
        "tds_194j_rate": float(inv.tds_194j_rate or 0),
        "tds_194j_amount": float(inv.tds_194j_amount or 0),
        "net_receivable": float(inv.net_receivable or 0),
        "status": inv.status,
        "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "period_of_service": inv.period_of_service or "",
        "payment_received": float(inv.payment_received or 0),
        "payment_date": inv.payment_date.isoformat() if inv.payment_date else None,
        "payment_reference": inv.payment_reference,
        "notes": inv.notes or "",
        "created_by": inv.created_by or "",
        "template": inv.template or "standard",
        "sent_at": inv.sent_at.isoformat() if inv.sent_at else None,
    }


def _get_invoice(db: Session, invoice_id: str, tenant_id: uuid.UUID) -> FirmBillingInvoice:
    """Fetches one invoice of the caller's firm; anything else (other firm, bad id) is a 404."""
    try:
        iid = uuid.UUID(str(invoice_id))
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")
    inv = db.execute(
        select(FirmBillingInvoice).where(
            FirmBillingInvoice.id == iid, FirmBillingInvoice.tenant_id == tenant_id
        )
    ).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")
    return inv


def _create(db: Session, user: User, *, client_id: str, client_name: str, client_gstin: str,
            client_pan: str, services: List[ServiceLine], issue_date: date, due_date: date,
            period_of_service: str, notes: str, template: str, created_by: str) -> FirmBillingInvoice:
    inv = FirmBillingInvoice(
        tenant_id=user.tenant_id,
        invoice_number=_next_invoice_number(db, user.tenant_id),
        client_id=client_id,
        client_name=client_name,
        client_gstin=client_gstin,
        client_pan=client_pan,
        status=FirmInvoiceStatus.DRAFT.value,
        issue_date=issue_date,
        due_date=due_date,
        period_of_service=period_of_service,
        payment_received=0,
        notes=notes,
        created_by=created_by,
        template=template,
    )
    _apply_totals(inv, services)
    db.add(inv)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Invoice number conflict; please retry.")
    db.refresh(inv)
    return inv


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/invoices")
def list_invoices(
    user: Viewer,
    status: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    stmt = select(FirmBillingInvoice).where(FirmBillingInvoice.tenant_id == user.tenant_id)
    if status:
        stmt = stmt.where(FirmBillingInvoice.status == status.upper())
    if client_id:
        stmt = stmt.where(FirmBillingInvoice.client_id == client_id)
    rows = db.execute(
        stmt.order_by(FirmBillingInvoice.created_at.desc(), FirmBillingInvoice.invoice_number.desc()).limit(1000)
    ).scalars().all()
    return [_serialize(inv) for inv in rows]


@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: str, user: Viewer, db: Session = Depends(get_db)):
    return _serialize(_get_invoice(db, invoice_id, user.tenant_id))


@router.post("/invoices")
def create_invoice(req: CreateInvoiceRequest, user: Manager, db: Session = Depends(get_db)):
    inv = _create(
        db, user,
        client_id=req.client_id, client_name=req.client_name,
        client_gstin=req.client_gstin, client_pan=req.client_pan,
        services=req.services, issue_date=req.issue_date, due_date=req.due_date,
        period_of_service=req.period_of_service, notes=req.notes, template=req.template,
        created_by=user.full_name or str(user.id),
    )
    return _serialize(inv)


@router.put("/invoices/{invoice_id}")
def update_invoice(invoice_id: str, req: UpdateInvoiceRequest, user: Manager, db: Session = Depends(get_db)):
    inv = _get_invoice(db, invoice_id, user.tenant_id)
    data = req.model_dump(exclude_unset=True)
    for field in ("client_id", "client_name", "client_gstin", "client_pan",
                  "period_of_service", "issue_date", "due_date", "notes", "template"):
        if field in data and data[field] is not None:
            setattr(inv, field, data[field])
    if req.services is not None:
        _apply_totals(inv, req.services)
    db.commit()
    db.refresh(inv)
    return _serialize(inv)


@router.post("/invoices/{invoice_id}/send")
def send_invoice(invoice_id: str, user: Manager, db: Session = Depends(get_db)):
    inv = _get_invoice(db, invoice_id, user.tenant_id)
    inv.status = FirmInvoiceStatus.SENT.value
    inv.sent_at = datetime.utcnow()
    db.commit()
    db.refresh(inv)
    return _serialize(inv)


@router.post("/invoices/{invoice_id}/record-payment")
def record_payment(invoice_id: str, req: RecordPaymentRequest, user: Manager, db: Session = Depends(get_db)):
    inv = _get_invoice(db, invoice_id, user.tenant_id)
    inv.payment_received = round(float(inv.payment_received or 0) + req.amount, 2)
    inv.payment_date = req.payment_date
    inv.payment_reference = req.reference
    threshold = float(inv.net_receivable or 0) if req.tds_deducted else float(inv.total_amount or 0)
    if float(inv.payment_received) >= threshold - 0.01:
        inv.status = FirmInvoiceStatus.PAID.value
    else:
        inv.status = FirmInvoiceStatus.PARTIALLY_PAID.value
    db.commit()
    db.refresh(inv)
    return _serialize(inv)


@router.get("/invoices/{invoice_id}/pdf-data")
def get_invoice_pdf_data(invoice_id: str, user: Viewer, db: Session = Depends(get_db)):
    inv = _get_invoice(db, invoice_id, user.tenant_id)
    firm = db.get(Firm, user.tenant_id)
    firm_name = (firm.firm_name if firm else None) or "Chartered Accountants"
    return {
        "firm": {
            "name": firm_name,
            "full_name": f"{firm_name}, Chartered Accountants",
            "address": (firm.head_office_city if firm else None) or "",
            "gstin": (firm.gstin if firm else None) or "",
            "pan": (firm.pan if firm else None) or "",
            "frn": f"FRN: {firm.frn}" if firm and firm.frn else "",
            "phone": "",
            "email": "",
        },
        "invoice": _serialize(inv),
    }


@router.get("/summary")
def get_billing_summary(user: Viewer, db: Session = Depends(get_db)):
    rows = db.execute(
        select(FirmBillingInvoice).where(FirmBillingInvoice.tenant_id == user.tenant_id)
    ).scalars().all()
    invoices = [_serialize(inv) for inv in rows]

    current_month = date.today().strftime("%Y-%m")
    total_billed_mtd = sum(
        inv["total_amount"] for inv in invoices
        if (inv["issue_date"] or "").startswith(current_month)
    )
    total_collected_mtd = sum(
        inv["payment_received"] for inv in invoices
        if inv["payment_date"] and inv["payment_date"].startswith(current_month)
    )
    total_overdue = sum(
        inv["net_receivable"] - inv["payment_received"]
        for inv in invoices if inv["status"] == FirmInvoiceStatus.OVERDUE.value
    )
    tds_receivable = sum(
        inv["tds_194j_amount"] for inv in invoices
        if inv["status"] in (FirmInvoiceStatus.PAID.value, FirmInvoiceStatus.PARTIALLY_PAID.value)
    )
    pending_count = sum(
        1 for inv in invoices
        if inv["status"] in (FirmInvoiceStatus.DRAFT.value, FirmInvoiceStatus.SENT.value, FirmInvoiceStatus.VIEWED.value)
    )
    overdue_count = sum(1 for inv in invoices if inv["status"] == FirmInvoiceStatus.OVERDUE.value)

    client_totals: Dict[str, Dict] = {}
    for inv in invoices:
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
def get_rate_card(user: Viewer):
    return RATE_CARD


@router.post("/invoices/generate-from-work")
def generate_from_work(req: GenerateFromWorkRequest, user: Manager, db: Session = Depends(get_db)):
    """Auto-generate an invoice from completed obligation IDs using the default rate card."""
    obligation_map = {
        "GSTR-1": "GST_MONTHLY_COMPLIANCE",
        "GSTR-3B": "GST_MONTHLY_COMPLIANCE",
        "GSTR-9C": "GSTR_9C_AUDIT",
        "GSTR-9": "GST_ANNUAL_RETURN",
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

    # Client details come from this firm's own client master only.
    client_name, client_gstin, client_pan = "Unknown Client", "", ""
    try:
        cid = uuid.UUID(req.client_id)
    except ValueError:
        cid = None
    if cid is not None:
        from ...models.clients import Client
        c = db.execute(
            select(Client).where(Client.id == cid, Client.tenant_id == user.tenant_id)
        ).scalar_one_or_none()
        if c is not None:
            client_name, client_gstin, client_pan = c.client_name, c.gstin or "", c.pan or ""

    inv = _create(
        db, user,
        client_id=req.client_id, client_name=client_name,
        client_gstin=client_gstin, client_pan=client_pan,
        services=unique_services, issue_date=req.issue_date, due_date=req.due_date,
        period_of_service=req.period_of_service,
        notes=f"Auto-generated from obligations: {', '.join(req.obligation_ids)}",
        template="standard",
        created_by="System (AI Auto-Generate)",
    )
    return _serialize(inv)
