import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...deterministic_core.audit_chain import append_audit_block
from ...models.clients import Client
from ...models.returns import GSTReturn, ReturnStatus
from ...models.signing import SigningRequest, SigningStatus
from ..deps import User, require_role

router = APIRouter(prefix="/returns", tags=["returns"])

Viewer = Annotated[User, Depends(require_role("ARTICLE_TRAINEE"))]


def _public(r: GSTReturn, client_name: Optional[str]) -> Dict[str, Any]:
    rules = r.rule_check_results or []
    return {
        "id": str(r.id),
        "client_id": str(r.client_id),
        "client": client_name or "Unknown client",
        "gstin": r.gstin,
        "return_type": r.return_type.value,
        "period": r.period,
        "financial_year": r.financial_year,
        "status": r.status.value,
        "total_taxable_outward": float(r.total_taxable_outward or 0),
        "total_tax_liability": float(r.total_tax_liability or 0),
        "total_itc_claimed": float(r.total_itc_claimed or 0),
        "net_tax_payable": float(r.net_tax_payable or 0),
        "rules_total": len(rules) or None,
        "rules_passed": sum(1 for x in rules if isinstance(x, dict) and x.get("status") == "passed") if rules else None,
        "arn": r.arn,
        "due_date": r.due_date.isoformat() if r.due_date else None,
        "filed_at": r.filed_at.isoformat() if r.filed_at else None,
        "payload_hash": r.payload_hash,
    }


def _load(db: Session, return_id: str, user: User) -> GSTReturn:
    try:
        rid = uuid.UUID(return_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Return not found.")
    r = db.execute(
        select(GSTReturn).where(GSTReturn.id == rid, GSTReturn.tenant_id == user.tenant_id, GSTReturn.is_deleted.is_(False))
    ).scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=404, detail="Return not found.")
    return r


@router.post("/assemble")
def assemble_return():
    """Return assembly is performed by the GS-5 agent pipeline against a client's verified ledger.
    The previous endpoint fabricated figures; it is disabled until it is wired to real data."""
    raise HTTPException(status_code=501, detail="Return assembly is not available through this endpoint yet.")

def _tenant_invoices(db: Session, user: User, client_id: Optional[str]):
    """Resolve the client (explicit, or the first client that has invoices) and its inward invoices."""
    from ...models.invoices import Invoice, InvoiceDirection

    q = select(Client).where(Client.tenant_id == user.tenant_id, Client.is_deleted.is_(False))
    if client_id:
        try:
            q = q.where(Client.id == uuid.UUID(client_id))
        except ValueError:
            raise HTTPException(status_code=422, detail="client_id must be a UUID.")
    else:
        q = q.where(Client.id.in_(select(Invoice.client_id).where(Invoice.tenant_id == user.tenant_id)))
    client = db.execute(q.order_by(Client.client_name)).scalars().first()
    if client is None:
        if client_id:
            raise HTTPException(status_code=404, detail="Client not found.")
        return None, []
    rows = db.execute(
        select(Invoice).where(
            Invoice.tenant_id == user.tenant_id, Invoice.client_id == client.id,
            Invoice.direction == InvoiceDirection.INWARD, Invoice.is_deleted.is_(False),
        ).order_by(Invoice.invoice_date)
    ).scalars().all()
    return client, rows


def _heads(items) -> Dict[str, float]:
    igst = round(sum(float(i.get("igst") or 0) for i in items), 2)
    cgst = round(sum(float(i.get("cgst") or 0) for i in items), 2)
    sgst = round(sum(float(i.get("sgst") or 0) for i in items), 2)
    return {"igst": igst, "cgst": cgst, "sgst": sgst, "total": round(igst + cgst + sgst, 2)}


def _to_ui_contract(reco: Dict[str, Any]) -> Dict[str, Any]:
    """Shape the reconciler output into the contract the web client renders. Every figure is
    derived from the reconciler's own items/financials; nothing is invented."""
    items = reco.get("items", [])
    fin = reco.get("financials", {})
    by = lambda *statuses: [i for i in items if i.get("match_status") in statuses]
    eligible = [i for i in by("EXACT_MATCH", "FUZZY_MATCH") if not i.get("is_blocked_17_5")]
    blocked = [i for i in items if i.get("is_blocked_17_5")]
    return {
        "summary": {
            "total_books_records": reco.get("total_books_invoices", 0),
            "total_gstr2b_records": reco.get("total_2b_invoices", 0),
            "books_total_tax": fin.get("total_books_itc", 0.0),
            "gstr2b_total_tax": fin.get("total_2b_itc", 0.0),
            "eligible_itc": fin.get("eligible_3b_itc", 0.0),
            "blocked_itc_17_5": fin.get("blocked_itc_17_5", 0.0),
            "unclaimed_in_books": fin.get("unclaimed_itc_in_2b", 0.0),
            "missing_in_2b": fin.get("locked_itc_missing_2b", 0.0),
        },
        "exact_matches": by("EXACT_MATCH"),
        "fuzzy_matches": by("FUZZY_MATCH"),
        "value_mismatches": by("VALUE_MISMATCH"),
        "missing_in_2b": by("IN_BOOKS_NOT_IN_2B"),
        "unclaimed_in_books": by("IN_2B_NOT_IN_BOOKS"),
        "blocked_credits_17_5": blocked,
        "gstr_3b_table4": {
            "table_4_A_5_all_other_itc": _heads(eligible),
            "table_4_B_1_as_per_rule_38_42_43_and_17_5": _heads(blocked),
            "table_4_C_net_itc_available": _heads(eligible),
            "table_4_D_2_ineligible_under_16_4_or_pos": _heads([]),
        },
    }


@router.get("/reconciliation")
def get_live_reconciliation(
    user: Viewer,
    client_id: Optional[str] = None,
    period: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Books (the client's inward invoices) vs the GSTR-2B feed pulled through the GSP layer."""
    from ...deterministic_core.reconciler import reconcile_books_with_gstr2b

    client, invoices = _tenant_invoices(db, user, client_id)
    books = [
        {
            "id": str(i.id), "invoice_number": i.invoice_number, "invoice_date": i.invoice_date,
            "supplier_gstin": i.supplier_gstin, "supplier_name": i.supplier_name,
            "goods_description": (i.metadata_ or {}).get("goods_description", ""), "hsn_code": i.hsn_code or "",
            "taxable_value": float(i.taxable_value or 0), "cgst": float(i.cgst or 0),
            "sgst": float(i.sgst or 0), "igst": float(i.igst or 0),
        }
        for i in invoices
    ]
    feeds = []
    if client is not None and client.gstin:
        feeds = _sync_engine().sync_client_gstr2b(client.gstin, period or datetime.now(timezone.utc).strftime("%Y-%m"))
    return _to_ui_contract(reconcile_books_with_gstr2b(books, feeds))


@router.get("/export-tally-xml")
def export_tally_xml(user: Viewer, client_id: Optional[str] = None, db: Session = Depends(get_db)):
    from fastapi.responses import Response
    from ...deterministic_core.tally_bridge import generate_tally_purchase_xml

    client, invoices = _tenant_invoices(db, user, client_id)
    if client is None or not invoices:
        raise HTTPException(status_code=404, detail="No inward invoices available to export.")
    payload = [
        {
            "invoice_number": i.invoice_number, "invoice_date": i.invoice_date, "supplier_gstin": i.supplier_gstin,
            "supplier_name": i.supplier_name, "taxable_value": float(i.taxable_value or 0), "cgst": float(i.cgst or 0),
            "sgst": float(i.sgst or 0), "igst": float(i.igst or 0), "total_value": float(i.total_value or 0),
        }
        for i in invoices
    ]
    xml_content = generate_tally_purchase_xml(payload, company_name=client.client_name)
    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Content-Disposition": "attachment; filename=Tally_Purchase_Import_Vouchers.xml"},
    )


@router.get("/")
def list_returns(user: Viewer, db: Session = Depends(get_db)):
    rows = db.execute(
        select(GSTReturn, Client.client_name)
        .join(Client, Client.id == GSTReturn.client_id, isouter=True)
        .where(GSTReturn.tenant_id == user.tenant_id, GSTReturn.is_deleted.is_(False))
        .order_by(GSTReturn.due_date.asc().nulls_last(), GSTReturn.created_at.desc())
        .limit(500)
    ).all()
    return [_public(r, name) for r, name in rows]


@router.get("/{return_id}")
def get_return(return_id: str, user: Viewer, db: Session = Depends(get_db)):
    r = _load(db, return_id, user)
    client = db.get(Client, r.client_id)
    return _public(r, client.client_name if client else None)


@router.get("/{return_id}/evidence-pack")
def get_evidence_pack(return_id: str, user: Viewer, db: Session = Depends(get_db)):
    r = _load(db, return_id, user)
    client = db.get(Client, r.client_id)
    rules = r.rule_check_results or []
    return {
        "return": _public(r, client.client_name if client else None),
        "rule_check_results": rules,
        "four_eyes_verified": r.reviewer_id is not None and r.reviewer_id != r.preparer_id,
        "variance_memo": r.variance_memo,
    }


@router.post("/{return_id}/sign")
def sign_return(return_id: str):
    """Signing never happens server-side: a DSC PIN must not reach the platform."""
    raise HTTPException(
        status_code=410,
        detail="Server-side signing is disabled. Open a request with POST /api/v1/signing/requests and sign on the desktop signer.",
    )


# =============================================================================
# GSP / GSTN Portal Integration Endpoints
# Added: Production-grade GSP layer via PortalSyncEngine
# =============================================================================

from ...gsp.portal_sync import PortalSyncEngine
from ...gsp.client import GSPClient
from pydantic import BaseModel as _BaseModel
from typing import List as _List, Optional as _Optional

class _FileReturnRequest(_BaseModel):
    """Only the target is client-supplied. The payload and signature come from the database."""
    pass


def _sync_engine() -> PortalSyncEngine:
    """Dependency factory — creates a PortalSyncEngine per request."""
    return PortalSyncEngine(client=GSPClient())


def _assert_own_gstin(db: Session, user: User, gstin: str) -> None:
    """The GSP credentials belong to the firm: only GSTINs of its own live clients may be queried."""
    own = db.execute(
        select(Client.id).where(Client.tenant_id == user.tenant_id, Client.is_deleted.is_(False), Client.gstin == gstin.upper())
    ).first()
    if own is None:
        raise HTTPException(status_code=404, detail="GSTIN is not registered to a client of this firm.")


@router.get("/gstr2b/{gstin}/{period}", tags=["gsp"])
def get_gstr2b(gstin: str, period: str, user: Viewer, db: Session = Depends(get_db)):
    """
    Pull live GSTR-2B inward supply invoices from the GSP portal for the
    given GSTIN and return period.

    Returns a flat list of normalised invoice objects ready for reconciliation.
    Period format: YYYY-MM (e.g. 2026-10) or MMYYYY (e.g. 102026).
    """
    _assert_own_gstin(db, user, gstin)
    engine = _sync_engine()
    invoices = engine.sync_client_gstr2b(gstin, period)
    return {
        "status": "success",
        "gstin": gstin,
        "period": period,
        "invoice_count": len(invoices),
        "invoices": invoices,
    }


@router.get("/ims/{gstin}/{period}", tags=["gsp"])
def get_ims_dashboard(gstin: str, period: str, user: Viewer, db: Session = Depends(get_db)):
    """
    Fetch the IMS (Invoice Management System) inward invoice dashboard for
    a GSTIN and period.

    Returns accepted/pending/rejected invoice counts and ITC impact figures.
    """
    _assert_own_gstin(db, user, gstin)
    engine = _sync_engine()
    data = engine.sync_ims_dashboard(gstin, period)
    return {"status": "success", "gstin": gstin, "period": period, "ims": data}


@router.post("/{return_id}/file", tags=["gsp"])
def file_return(
    return_id: str,
    user: Annotated[User, Depends(require_role("PARTNER"))],
    db: Session = Depends(get_db),
):
    """
    Submit a SIGNED return through the GSP gateway (Gates G8/G9).

    The stored payload and the verified desktop-signer signature are used; nothing signature- or
    payload-related is accepted from the caller. The return must carry a SIGNED signing request
    whose document hash equals the stored payload hash.
    """
    ret = _load(db, return_id, user)
    if ret.status != ReturnStatus.SIGNED:
        raise HTTPException(status_code=409, detail=f"Return is {ret.status.value}; only SIGNED returns can be filed.")
    signed = db.execute(
        select(SigningRequest).where(
            SigningRequest.tenant_id == user.tenant_id,
            SigningRequest.entity_type == "GST_RETURN",
            SigningRequest.entity_id == str(ret.id),
            SigningRequest.document_hash == ret.payload_hash,
            SigningRequest.status == SigningStatus.SIGNED,
        ).order_by(SigningRequest.signed_at.desc())
    ).scalars().first()
    if signed is None or not ret.payload_json:
        raise HTTPException(status_code=409, detail="No verified signature matches this return's payload.")

    engine = _sync_engine()
    result = engine.file_return(
        gstin=ret.gstin,
        period=ret.period,
        return_type=ret.return_type.value,
        payload_json=ret.payload_json,
        dsc_signature=signed.signature_b64 or "",
        partner_id=str(signed.signer_id),
    )

    if result.success:
        ret.status = ReturnStatus.FILED
        ret.arn = result.arn
        ret.filed_at = datetime.now(timezone.utc)
        db.commit()
        append_audit_block(
            db, user.tenant_id, str(user.id), user.role, "RETURN_FILED", "GST_RETURN", str(ret.id),
            {"arn": result.arn, "signing_request": str(signed.id)},
        )
        return {
            "status": "FILED",
            "return_id": str(ret.id),
            "arn": result.arn,
            "submitted_at": result.submitted_at,
            "partner_id": result.partner_id,
            "return_type": result.return_type,
            "gstin": result.gstin,
            "period": result.period,
        }

    raise HTTPException(
        status_code=502,
        detail={
            "error": "GSP_SUBMISSION_FAILED",
            "error_code": result.error_code,
            "message": result.error_message,
        },
    )


@router.get("/filing-status/{gstin}/{return_type}/{period}", tags=["gsp"])
def get_filing_status(gstin: str, return_type: str, period: str, user: Viewer, db: Session = Depends(get_db)):
    """
    Check whether a specific GST return has been filed on the GSTN portal.

    Pass a single GSTIN in the path.  For bulk checking use the
    POST /returns/filing-status-bulk endpoint.
    """
    _assert_own_gstin(db, user, gstin)
    engine = _sync_engine()
    statuses = engine.check_all_filing_statuses([gstin], return_type, period)
    info = statuses.get(gstin, {})
    return {
        "status": "success",
        "gstin": gstin,
        "return_type": return_type,
        "period": period,
        "filing_status": info,
    }
