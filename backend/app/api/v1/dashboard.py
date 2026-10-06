from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
from typing import Dict, Any

from ..deps import get_db, get_current_user, User
from ...models.clients import Client

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/overview")
async def get_overview(db: AsyncSession = Depends(get_db)):
    return {
        "clients_count": 150,
        "pending_gates": 12,
        "upcoming_deadlines": 5,
        "returns_status": {"filed": 100, "pending": 50}
    }

@router.get("/deadlines")
async def get_deadlines(db: AsyncSession = Depends(get_db)):
    return [
        {"type": "GSTR-1", "due_date": "2026-10-11", "status": "upcoming"},
        {"type": "GSTR-3B", "due_date": "2026-10-20", "status": "upcoming"}
    ]

@router.get("/exceptions")
async def get_exceptions(db: AsyncSession = Depends(get_db)):
    return [
        {"id": "exc-1", "type": "anomaly", "details": "Unusual high ITC claim"},
        {"id": "exc-2", "type": "mismatch", "details": "GSTR-2B vs Purchase Register mismatch"}
    ]

@router.get("/filing-tracker")
async def get_filing_tracker(db: AsyncSession = Depends(get_db)):
    return {
        "completed": 80,
        "in_progress": 15,
        "not_started": 5
    }

@router.post("/kill-switch/{client_id}")
async def toggle_kill_switch(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    client = await db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client.emergency_bypass_active = not client.emergency_bypass_active
    await db.commit()
    return {"status": "success", "kill_switch_active": client.emergency_bypass_active}
