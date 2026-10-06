from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import uuid
from typing import List, Dict, Any
from datetime import datetime

from ...models.gates import GateDecision, GateStatus
from ...models.audit_ledger import AuditLedger, ActionType
from ..deps import get_db, get_current_user, User

router = APIRouter(prefix="/gates", tags=["gates"])

@router.get("/")
async def list_gates(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(GateDecision).where(GateDecision.status == GateStatus.PENDING))
    return result.scalars().all()

@router.get("/stats")
async def gate_stats(db: AsyncSession = Depends(get_db)):
    return {"pending_count": 10, "avg_approval_time_mins": 45}

@router.get("/{decision_id}")
async def get_gate(decision_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    gate = await db.get(GateDecision, decision_id)
    if not gate:
        raise HTTPException(status_code=404, detail="Gate decision not found")
    return gate

@router.post("/{decision_id}/approve")
async def approve_gate(
    decision_id: uuid.UUID,
    notes: str = Body(default=""),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    gate = await db.get(GateDecision, decision_id)
    if not gate:
        raise HTTPException(status_code=404, detail="Gate decision not found")
    
    # Validation simplified for demo
    gate.status = GateStatus.APPROVED
    gate.decided_by = current_user.id
    gate.decided_at = datetime.utcnow()
    gate.decision_notes = notes
    
    audit = AuditLedger(
        tenant_id=current_user.tenant_id,
        client_id=gate.client_id,
        agent_id="HUMAN",
        agent_version="1.0",
        action_type=ActionType.APPROVED,
        entity_type="gate_decision",
        entity_id=gate.id,
        input_hash="",
        output_hash="",
        output_snapshot={"notes": notes},
        gate_id=gate.gate_id,
        actor_id=current_user.id,
        actor_role=current_user.role
    )
    db.add(audit)
    await db.commit()
    return {"status": "approved"}

@router.post("/{decision_id}/reject")
async def reject_gate(
    decision_id: uuid.UUID,
    reason: str = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    gate = await db.get(GateDecision, decision_id)
    if not gate:
        raise HTTPException(status_code=404, detail="Gate not found")
    
    gate.status = GateStatus.REJECTED
    gate.decided_by = current_user.id
    gate.decided_at = datetime.utcnow()
    gate.decision_notes = reason
    await db.commit()
    return {"status": "rejected"}

@router.post("/{decision_id}/escalate")
async def escalate_gate(
    decision_id: uuid.UUID,
    reason: str = Body(...),
    db: AsyncSession = Depends(get_db)
):
    gate = await db.get(GateDecision, decision_id)
    if not gate:
        raise HTTPException(status_code=404, detail="Gate not found")
    gate.status = GateStatus.ESCALATED
    gate.escalation_reason = reason
    await db.commit()
    return {"status": "escalated"}
