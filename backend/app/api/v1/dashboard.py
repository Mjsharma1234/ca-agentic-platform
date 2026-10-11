from fastapi import APIRouter
from typing import Dict
from ...deterministic_core.calendar_engine import get_upcoming_deadlines

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

KILL_SWITCH_STATE: Dict[str, bool] = {}

@router.get("/overview")
async def get_overview():
    return {
        "clients_count": 142,
        "pending_gates": 6,
        "upcoming_deadlines": 8,
        "itc_safeguarded_inr": 12850000,
        "returns_status": {"filed": 97, "pending": 45}
    }

@router.get("/deadlines")
async def get_deadlines():
    deadlines = get_upcoming_deadlines(days_ahead=30)
    return [
        {
            "deadline_date": str(d.deadline_date),
            "return_type": d.return_type,
            "description": d.description,
            "penalty_per_day": float(d.penalty_per_day),
            "is_critical": d.is_critical,
            "days_remaining": d.days_remaining
        }
        for d in deadlines
    ]

@router.get("/exceptions")
async def get_exceptions():
    return [
        {"id": "e1", "client": "Mumbai Steel Corporation", "severity": "CRITICAL", "details": "Mismatch in GSTR-2B vs Purchase Register > ₹5,00,000", "gate_id": "G3-9843"},
        {"id": "e2", "client": "Rajesh Textiles Pvt Ltd", "severity": "HIGH", "details": "Low OCR confidence (0.86) on WhatsApp bill GSTIN", "gate_id": "G2-9842"},
        {"id": "e3", "client": "Deccan Precision Auto Ltd", "severity": "CRITICAL", "details": "DRC-01C Rule 88D Intimation received — 5-day buffer SLA", "gate_id": "G11-9847"}
    ]

@router.get("/filing-tracker")
async def get_filing_tracker():
    return {
        "completed": 97,
        "in_progress": 33,
        "not_started": 12
    }

@router.post("/kill-switch/{client_id}")
async def toggle_kill_switch(client_id: str):
    current = KILL_SWITCH_STATE.get(client_id, False)
    KILL_SWITCH_STATE[client_id] = not current
    return {"status": "success", "client_id": client_id, "kill_switch_active": KILL_SWITCH_STATE[client_id]}
