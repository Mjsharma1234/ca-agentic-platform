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
    for r in IN_MEMORY_RETURNS:
        if r["id"] == return_id:
            r["status"] = "SIGNED_AND_QUEUED"
            return {"status": "signed", "ram_wiped": True, "return": r}
    return {"status": "signed", "ram_wiped": True, "return_id": return_id}
