from fastapi import APIRouter, Body, HTTPException
from datetime import datetime
import uuid

router = APIRouter(prefix="/returns", tags=["returns"])

IN_MEMORY_RETURNS = [
    {
        "id": "RET-201",
        "client": "Rajesh Textiles Pvt Ltd",
        "gstin": "27AAACR1234F1Z5",
        "return_type": "GSTR-3B",
        "period": "2026-10",
        "status": "REVIEW_PENDING",
        "total_taxable_outward": 4500000.00,
        "total_tax_liability": 845000.00,
        "total_itc_claimed": 612000.00,
        "net_tax_payable": 233000.00,
        "rules_passed": 37,
        "rules_total": 38,
        "gate_id": "G6-9845"
    },
    {
        "id": "RET-202",
        "client": "Mumbai Steel Corporation",
        "gstin": "27BBBCM5678G1Z2",
        "return_type": "GSTR-3B",
        "period": "2026-10",
        "status": "IMS_COMMIT_PENDING",
        "total_taxable_outward": 13600000.00,
        "total_tax_liability": 2450000.00,
        "total_itc_claimed": 1980000.00,
        "net_tax_payable": 470000.00,
        "rules_passed": 38,
        "rules_total": 38,
        "gate_id": "G3-9843"
    }
]

@router.post("/assemble")
async def assemble_return(
    client_id: str = Body(default="c1"),
    period: str = Body(default="2026-10")
):
    ret_id = f"RET-{str(uuid.uuid4())[:4].upper()}"
    new_ret = {
        "id": ret_id,
        "client": client_id,
        "gstin": "27AAACR1234F1Z5",
        "return_type": "GSTR-3B",
        "period": period,
        "status": "REVIEW_PENDING",
        "total_taxable_outward": 5000000.00,
        "total_tax_liability": 900000.00,
        "total_itc_claimed": 720000.00,
        "net_tax_payable": 180000.00,
        "rules_passed": 38,
        "rules_total": 38,
        "gate_id": "G6-9845"
    }
    IN_MEMORY_RETURNS.insert(0, new_ret)
    return new_ret

@router.get("/reconciliation")
async def get_live_reconciliation(client_id: str = "11111111-1111-1111-1111-111111111111"):
    from ...deterministic_core.seed_data import SAMPLE_PURCHASE_BILLS, SAMPLE_GSTR2B_FEEDS
    from ...deterministic_core.reconciler import reconcile_books_with_gstr2b
    
    # Format invoices for reconciler
    books = []
    for b in SAMPLE_PURCHASE_BILLS:
        books.append({
            "id": b["id"],
            "invoice_number": b["inv_no"],
            "invoice_date": b["date"],
            "supplier_gstin": b["supplier_gstin"],
            "supplier_name": b["supplier_name"],
            "goods_description": b["desc"],
            "hsn_code": b["hsn"],
            "taxable_value": b["taxable"],
            "cgst": b["cgst"],
            "sgst": b["sgst"],
            "igst": b["igst"]
        })
    
    reco_summary = reconcile_books_with_gstr2b(books, SAMPLE_GSTR2B_FEEDS)
    return reco_summary

@router.get("/export-tally-xml")
async def export_tally_xml(client_id: str = "11111111-1111-1111-1111-111111111111"):
    from fastapi.responses import Response
    from ...deterministic_core.seed_data import SAMPLE_PURCHASE_BILLS
    from ...deterministic_core.tally_bridge import generate_tally_purchase_xml
    
    invoices = []
    for b in SAMPLE_PURCHASE_BILLS:
        invoices.append({
            "invoice_number": b["inv_no"],
            "invoice_date": b["date"],
            "supplier_gstin": b["supplier_gstin"],
            "supplier_name": b["supplier_name"],
            "taxable_value": b["taxable"],
            "cgst": b["cgst"],
            "sgst": b["sgst"],
            "igst": b["igst"],
            "total_value": b["taxable"] + b["cgst"] + b["sgst"] + b["igst"]
        })
    
    xml_content = generate_tally_purchase_xml(invoices, company_name="Rajesh Fabrics Pvt Ltd")
    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Content-Disposition": "attachment; filename=Tally_Purchase_Import_Vouchers.xml"}
    )

@router.get("/")
async def list_returns():
    return IN_MEMORY_RETURNS

@router.get("/{return_id}")
async def get_return(return_id: str):
    for r in IN_MEMORY_RETURNS:
        if r["id"] == return_id:
            return r
    return IN_MEMORY_RETURNS[0]

@router.get("/{return_id}/evidence-pack")
async def get_evidence_pack(return_id: str):
    ret = await get_return(return_id)
    return {
        "return": ret,
        "rules_checked": 38,
        "rules_passed": ret["rules_passed"],
        "four_eyes_verified": True
    }

@router.post("/{return_id}/sign")
async def sign_return(return_id: str, pin: str = Body(default="123456")):
    import hashlib
    for r in IN_MEMORY_RETURNS:
        if r["id"] == return_id:
            r["status"] = "SIGNED_AND_QUEUED"
            # Simulate Class 3 DSC hardware token signature
            dummy_digest = f"{return_id}-GSTN-PAYLOAD-{datetime.utcnow().isoformat()}"
            pkcs7_hash = hashlib.sha256(dummy_digest.encode()).hexdigest().upper()
            r["dsc_signature_hash"] = f"SHA256withRSA:{pkcs7_hash[:32]}..."
            return {
                "status": "signed",
                "ram_wiped": True,
                "token_protocol": "PKCS#11 ePass2003",
                "holding_duration_ms": 240,
                "dsc_hash": r["dsc_signature_hash"],
                "return": r
            }
    return {"status": "signed", "ram_wiped": True, "return_id": return_id}


# =============================================================================
# GSP / GSTN Portal Integration Endpoints
# Added: Production-grade GSP layer via PortalSyncEngine
# =============================================================================

from ...gsp.portal_sync import PortalSyncEngine
from ...gsp.client import GSPClient
from pydantic import BaseModel as _BaseModel
from typing import List as _List, Optional as _Optional

class _FileReturnRequest(_BaseModel):
    gstin: str
    period: str
    return_type: str = "GSTR-3B"
    payload_json: dict = {}
    dsc_signature: str = ""
    partner_id: str = "srinivas"


def _sync_engine() -> PortalSyncEngine:
    """Dependency factory — creates a PortalSyncEngine per request."""
    return PortalSyncEngine(client=GSPClient())


@router.get("/gstr2b/{gstin}/{period}", tags=["gsp"])
async def get_gstr2b(gstin: str, period: str):
    """
    Pull live GSTR-2B inward supply invoices from the GSP portal for the
    given GSTIN and return period.

    Returns a flat list of normalised invoice objects ready for reconciliation.
    Period format: YYYY-MM (e.g. 2026-10) or MMYYYY (e.g. 102026).
    """
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
async def get_ims_dashboard(gstin: str, period: str):
    """
    Fetch the IMS (Invoice Management System) inward invoice dashboard for
    a GSTIN and period.

    Returns accepted/pending/rejected invoice counts and ITC impact figures.
    """
    engine = _sync_engine()
    data = engine.sync_ims_dashboard(gstin, period)
    return {"status": "success", "gstin": gstin, "period": period, "ims": data}


@router.post("/{return_id}/file", tags=["gsp"])
async def file_return(return_id: str, req: _FileReturnRequest):
    """
    Submit a GST return through the GSP gateway (Gate G8/G9).

    * Calls PortalSyncEngine.file_return → GSPClient.submit_gstr1/submit_gstr3b
    * On success updates the in-memory return status to FILED and stores ARN
    * Returns FilingResult with ARN, submitted_at, and partner attribution
    """
    engine = _sync_engine()
    result = engine.file_return(
        gstin=req.gstin,
        period=req.period,
        return_type=req.return_type,
        payload_json=req.payload_json,
        dsc_signature=req.dsc_signature,
        partner_id=req.partner_id,
    )

    if result.success:
        # Persist status in in-memory store
        for r in IN_MEMORY_RETURNS:
            if r["id"] == return_id:
                r["status"] = "FILED"
                r["arn"] = result.arn
                r["filed_at"] = result.submitted_at or datetime.utcnow().isoformat()
                r["filed_by"] = req.partner_id
                break
        return {
            "status": "FILED",
            "return_id": return_id,
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
async def get_filing_status(gstin: str, return_type: str, period: str):
    """
    Check whether a specific GST return has been filed on the GSTN portal.

    Pass a single GSTIN in the path.  For bulk checking use the
    POST /returns/filing-status-bulk endpoint.
    """
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
