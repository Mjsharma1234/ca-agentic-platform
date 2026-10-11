from fastapi import APIRouter, Body
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/gates", tags=["gates"])

IN_MEMORY_GATES = [
    {"id": "G2-9842", "gate_id": "G2", "name": "Low-Confidence OCR Review", "client": "Rajesh Textiles Pvt Ltd", "tier": "L2", "status": "pending", "sla_remaining": 4, "urgent": True},
    {"id": "G3-9843", "gate_id": "G3", "name": "IMS Inward Invoice Commit", "client": "Mumbai Steel Corporation", "tier": "L2", "status": "pending", "sla_remaining": 12, "urgent": True},
    {"id": "G4-9844", "gate_id": "G4", "name": "ITC Mismatch & Sec 17(5) Claim", "client": "Global Tech Solutions LLP", "tier": "L2", "status": "pending", "sla_remaining": 18, "urgent": False},
    {"id": "G6-9845", "gate_id": "G6", "name": "Four-Eyes Return Approval", "client": "Kerala Spices Export Pvt Ltd", "tier": "L2", "status": "pending", "sla_remaining": 2, "urgent": True},
    {"id": "G7-9846", "gate_id": "G7", "name": "Partner Class-3 DSC Signing", "client": "Sharma & Sons Logistics", "tier": "L3", "status": "pending", "sla_remaining": 24, "urgent": False},
]

@router.get("/")
async def list_gates():
    return IN_MEMORY_GATES

@router.get("/stats")
async def gate_stats():
    pending = len([g for g in IN_MEMORY_GATES if g["status"] == "pending"])
    return {"pending_count": pending, "avg_approval_time_mins": 28}

@router.get("/{decision_id}")
async def get_gate(decision_id: str):
    for g in IN_MEMORY_GATES:
        if g["id"] == decision_id:
            return g
    return IN_MEMORY_GATES[0]

@router.post("/{decision_id}/approve")
async def approve_gate(decision_id: str, notes: Optional[str] = Body(default="")):
    for g in IN_MEMORY_GATES:
        if g["id"] == decision_id:
            g["status"] = "approved"
            g["decided_at"] = datetime.utcnow().isoformat()
            g["notes"] = notes
            return {"status": "approved", "gate": g}
    return {"status": "approved", "decision_id": decision_id, "notes": notes}

@router.post("/{decision_id}/reject")
async def reject_gate(decision_id: str, reason: Optional[str] = Body(default="Rejected by reviewer")):
    for g in IN_MEMORY_GATES:
        if g["id"] == decision_id:
            g["status"] = "rejected"
            g["decided_at"] = datetime.utcnow().isoformat()
            g["notes"] = reason
            return {"status": "rejected", "gate": g}
    return {"status": "rejected", "decision_id": decision_id, "reason": reason}

@router.post("/{decision_id}/escalate")
async def escalate_gate(decision_id: str, reason: Optional[str] = Body(default="Escalated to Partner")):
    for g in IN_MEMORY_GATES:
        if g["id"] == decision_id:
            g["status"] = "escalated"
            return {"status": "escalated", "gate": g}
    return {"status": "escalated", "decision_id": decision_id}
