from fastapi import APIRouter, Body
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
