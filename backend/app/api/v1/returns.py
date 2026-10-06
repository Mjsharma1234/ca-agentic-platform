from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import uuid
from typing import List, Dict, Any

from ...models.returns import GSTReturn, ReturnStatus, ReturnType
from ...models.gates import GateDecision, GateStatus, GateTier, RequiredRole
from ...models.audit_ledger import AuditLedger, ActionType
from ..deps import get_db, get_current_user, User, require_role

router = APIRouter(prefix="/returns", tags=["returns"])

@router.post("/assemble")
async def assemble_return(
    client_id: uuid.UUID = Body(...),
    period: str = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Simulates GS-5 agent logic
    gst_return = GSTReturn(
        tenant_id=current_user.tenant_id,
        client_id=client_id,
        gstin="GSTIN_SIM",
        return_type=ReturnType.GSTR3B,
        period=period,
        financial_year="2026-27",
        status=ReturnStatus.REVIEW_PENDING,
        total_taxable_outward=50000.00,
        total_tax_liability=9000.00,
        total_itc_claimed=8000.00,
        net_tax_payable=1000.00,
        payload_json={"simulated": True},
        preparer_id=current_user.id
    )
    db.add(gst_return)
    await db.flush()
    
    # Create G6 Gate for four-eyes review
    gate = GateDecision(
        tenant_id=current_user.tenant_id,
        client_id=client_id,
        gate_id="G6",
        gate_name="Return Review",
        entity_type="return",
        entity_id=gst_return.id,
        tier=GateTier.L2_STAFF,
        required_role=RequiredRole.REVIEWER
    )
    db.add(gate)
    await db.commit()
    return {"return_id": gst_return.id, "gate_id": gate.id}

@router.get("/")
async def list_returns(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GSTReturn))
    return result.scalars().all()

@router.get("/{return_id}")
async def get_return(return_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    ret = await db.get(GSTReturn, return_id)
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    return ret

@router.get("/{return_id}/evidence-pack")
async def get_evidence_pack(return_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    ret = await db.get(GSTReturn, return_id)
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    return {"liability": ret.total_tax_liability, "itc": ret.total_itc_claimed, "rules_checked": 38}

@router.post("/{return_id}/sign", dependencies=[Depends(require_role("PARTNER"))])
async def sign_return(
    return_id: uuid.UUID,
    pin: str = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ret = await db.get(GSTReturn, return_id)
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    
    ret.status = ReturnStatus.SIGNED
    ret.signing_partner_id = current_user.id
    
    audit = AuditLedger(
        tenant_id=current_user.tenant_id,
        client_id=ret.client_id,
        agent_id="HUMAN",
        agent_version="1.0",
        action_type=ActionType.SIGNED,
        entity_type="return",
        entity_id=ret.id,
        input_hash="",
        output_hash="",
        output_snapshot={},
        actor_id=current_user.id,
        actor_role=current_user.role
    )
    db.add(audit)
    await db.commit()
    return {"status": "signed"}
