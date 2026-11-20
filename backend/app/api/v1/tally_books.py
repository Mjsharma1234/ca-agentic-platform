"""What Firm OS does with a synced Tally company: show its purchase register, reconcile it against a GSTR-2B file,
and let a manager ask the PC for a fresh sync.

Reading and reconciling need a signed-in user of the firm (trainee or higher, like the returns routes); asking for a
sync needs a manager. A company must be linked to a client first, because the register belongs to the client.
The GSTR-2B file is read, matched and discarded: only counts go in the audit trail, not the file or the invoices.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...deterministic_core.gstr2b import parse_gstr2b
from ...deterministic_core.reconciler import reconcile_books_with_gstr2b
from ...models.clients import Client
from ...models.invoices import Invoice, InvoiceDirection
from ...models.tally_agent import TallyAgent, TallyCompany
from ..deps import User, require_role
from .returns import _to_ui_contract
from .tally_agent import Manager, _audit

router = APIRouter(prefix="/tally-agent/companies/{company_id}", tags=["tally-books"])

Viewer = Annotated[User, Depends(require_role("ARTICLE_TRAINEE"))]
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_REGISTER_ROWS = 5000


def _company_and_client(db: Session, user: User, company_id: str):
    try:
        cid = uuid.UUID(str(company_id))
    except ValueError:
        raise HTTPException(status_code=422, detail="company id must be a UUID.")
    company = db.execute(
        select(TallyCompany).where(TallyCompany.id == cid, TallyCompany.tenant_id == user.tenant_id)
    ).scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Tally company not found.")
    if company.client_id is None:
        raise HTTPException(status_code=409, detail="Link this Tally company to a client first.")
    client = db.execute(
        select(Client).where(Client.id == company.client_id, Client.tenant_id == user.tenant_id, Client.is_deleted.is_(False))
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=409, detail="The client linked to this Tally company no longer exists. Link it again.")
    return company, client


def _booked(i: Invoice) -> str:
    """The date the purchase was entered in the books (Tally voucher date), falling back to the supplier's invoice date.
    Accountants reconcile a month's books against that month's GSTR-2B, so that is the date the month filter uses."""
    return (i.metadata_ or {}).get("voucher_date") or i.invoice_date


def _inward(db: Session, user: User, client: Client, period: Optional[str] = None) -> List[Invoice]:
    rows = db.execute(
        select(Invoice).where(
            Invoice.tenant_id == user.tenant_id, Invoice.client_id == client.id,
            Invoice.direction == InvoiceDirection.INWARD, Invoice.is_deleted.is_(False),
        ).order_by(Invoice.invoice_date.desc(), Invoice.invoice_number)
    ).scalars().all()
    return [r for r in rows if _booked(r).startswith(period)] if period else list(rows)


def _f(value) -> float:
    return float(value or 0)


def _register_row(i: Invoice) -> Dict[str, Any]:
    meta = i.metadata_ or {}
    return {
        "id": str(i.id), "voucher_number": meta.get("voucher_number", ""), "voucher_type": meta.get("voucher_type", ""),
        "is_debit_note": bool(meta.get("is_debit_note")), "invoice_number": i.invoice_number, "invoice_date": i.invoice_date,
        "supplier_name": i.supplier_name or "", "supplier_gstin": i.supplier_gstin or "", "taxable_value": _f(i.taxable_value),
        "cgst": _f(i.cgst), "sgst": _f(i.sgst), "igst": _f(i.igst), "total_value": _f(i.total_value), "hsn_code": i.hsn_code or "",
    }


@router.get("/register")
def register(company_id: str, user: Viewer, period: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
             limit: int = Query(1000, ge=1, le=MAX_REGISTER_ROWS), db: Session = Depends(get_db)):
    """The client's purchase register as synced from Tally, newest first, with totals over every matching row.
    `period` (YYYY-MM) keeps the entries booked in that month."""
    company, client = _company_and_client(db, user, company_id)
    rows = _inward(db, user, client, period)
    totals = {k: round(sum(_f(getattr(r, k)) for r in rows), 2) for k in ("taxable_value", "cgst", "sgst", "igst")}
    totals["total_tax"] = round(totals["cgst"] + totals["sgst"] + totals["igst"], 2)
    return {
        "company": {"id": str(company.id), "name": company.company_name, "last_synced_at": company.last_synced_at.isoformat() if company.last_synced_at else None},
        "client": {"id": str(client.id), "name": client.client_name, "gstin": client.gstin or ""},
        "period": period, "count": len(rows), "truncated": len(rows) > limit, "totals": totals,
        "debit_notes": sum(1 for r in rows if (r.metadata_ or {}).get("is_debit_note")),
        "rows": [_register_row(r) for r in rows[:limit]],
    }


_BOOK_SIDE = ("EXACT_MATCH", "FUZZY_MATCH", "VALUE_MISMATCH", "IN_BOOKS_NOT_IN_2B")


def _restrict_to_period(result: Dict[str, Any], in_period: set) -> Dict[str, Any]:
    """Drops purchases booked outside the month that found no match (they are another month's business) and recomputes
    every total and count from what remains. Matched and mismatched purchases are kept whatever month they were booked."""
    items = [i for i in result["items"] if not (i["match_status"] == "IN_BOOKS_NOT_IN_2B" and i["invoice_id"] not in in_period)]
    book = [i for i in items if i["match_status"] in _BOOK_SIDE]
    count = lambda *statuses: sum(1 for i in items if i["match_status"] in statuses)
    tax = lambda rows: round(sum(i["total_tax"] for i in rows), 2)
    fin = dict(result["financials"])
    fin.update(
        total_books_itc=tax(book),
        eligible_3b_itc=tax([i for i in items if i["match_status"] in ("EXACT_MATCH", "FUZZY_MATCH") and not i["is_blocked_17_5"]]),
        blocked_itc_17_5=tax([i for i in book if i["is_blocked_17_5"]]),
        locked_itc_missing_2b=tax([i for i in items if i["match_status"] == "IN_BOOKS_NOT_IN_2B"]),
        unclaimed_itc_in_2b=tax([i for i in items if i["match_status"] == "IN_2B_NOT_IN_BOOKS"]),
    )
    return {
        **result, "items": items, "financials": fin, "total_books_invoices": len(book),
        "total_matched": count("EXACT_MATCH", "FUZZY_MATCH"), "total_mismatched": count("VALUE_MISMATCH"),
        "total_in_books_only": count("IN_BOOKS_NOT_IN_2B"), "total_in_2b_only": count("IN_2B_NOT_IN_BOOKS"),
        "total_blocked_17_5": sum(1 for i in items if i["is_blocked_17_5"]),
    }


class ReconcileBody(BaseModel):
    gstr2b: Dict[str, Any]
    all_periods: bool = False   # by default only purchases booked in the 2B's return month are matched


@router.post("/reconcile")
async def reconcile(company_id: str, body: ReconcileBody, request: Request, user: Viewer, db: Session = Depends(get_db)):
    """Matches the synced purchase register against an uploaded GSTR-2B file (not stored)."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That file is too large.")
    company, client = _company_and_client(db, user, company_id)
    try:
        parsed = parse_gstr2b(body.gstr2b)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    period = None if body.all_periods else parsed["period"]
    # Match the file against ALL the client's purchases: an invoice dated 30 June but booked on 2 July is in June's
    # GSTR-2B and in July's books, and must still match. The month only limits which unmatched purchases are called
    # "missing from 2B": a purchase booked in another month belongs to that month's 2B.
    books_rows = _inward(db, user, client, None)
    in_period = {str(i.id) for i in books_rows if not period or _booked(i).startswith(period)}
    books = [{
        "id": str(i.id), "invoice_number": i.invoice_number, "invoice_date": i.invoice_date, "supplier_gstin": i.supplier_gstin or "",
        "supplier_name": i.supplier_name or "", "goods_description": (i.metadata_ or {}).get("goods_description", ""),
        "hsn_code": i.hsn_code or "", "taxable_value": _f(i.taxable_value), "cgst": _f(i.cgst), "sgst": _f(i.sgst), "igst": _f(i.igst),
    } for i in books_rows]

    result = reconcile_books_with_gstr2b(books, parsed["invoices"])
    if period:
        result = _restrict_to_period(result, in_period)
    ui = _to_ui_contract(result)
    warnings = list(parsed["warnings"])
    if client.gstin and parsed["gstin"] and client.gstin.upper() != parsed["gstin"]:
        warnings.append(f"This file is for GSTIN {parsed['gstin']}, but the client's GSTIN in Firm OS is {client.gstin}. Check you uploaded the right file.")
    if parsed["period"] is None and not body.all_periods:
        warnings.append("The file has no return period, so all of the client's invoices were matched.")
    meta = {
        "company": company.company_name, "client": client.client_name, "gstr2b_period": parsed["period"], "gstr2b_gstin": parsed["gstin"],
        "books_period_filter": period, "books_considered": len(in_period), "books_total": len(books),
        "gstr2b_documents": len(parsed["invoices"]),
    }
    _audit(db, user.tenant_id, str(user.id), user.role, "TALLY_GSTR2B_RECONCILED", str(company.id), {
        **meta, "matched": result["total_matched"], "mismatched": result["total_mismatched"],
        "in_books_only": result["total_in_books_only"], "in_2b_only": result["total_in_2b_only"],
    })
    db.commit()
    return {**ui, "meta": meta, "warnings": warnings}


@router.post("/sync-now")
def sync_now(company_id: str, user: Manager, db: Session = Depends(get_db)):
    """Asks the PC that reports this company to sync straight away. It picks the request up within about a minute."""
    company, _client = _company_and_client(db, user, company_id)
    agent = db.execute(
        select(TallyAgent).where(TallyAgent.id == company.agent_id, TallyAgent.tenant_id == user.tenant_id)
    ).scalar_one_or_none()
    if agent is None or agent.revoked_at is not None:
        raise HTTPException(status_code=409, detail="The PC for this company is disconnected. Start the agent on it and approve it again.")
    agent.sync_requested_at = datetime.utcnow()
    _audit(db, user.tenant_id, str(user.id), user.role, "TALLY_SYNC_REQUESTED", str(company.id), {"company": company.company_name})
    db.commit()
    return {"requested": True, "message": "The PC will sync within about a minute if it is on and Tally is open."}
