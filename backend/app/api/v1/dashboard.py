"""Dashboard aggregates — computed from the tenant's own rows, never constants."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...deterministic_core.audit_chain import append_audit_block
from ...deterministic_core.calendar_engine import get_upcoming_deadlines
from ...models.clients import Client
from ...models.gates import GateDecision, GateStatus
from ...models.invoices import Invoice
from ...models.returns import GSTReturn, ReturnStatus
from ..deps import User, require_role

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

Viewer = Annotated[User, Depends(require_role("ARTICLE_TRAINEE"))]
LOW_CONFIDENCE = 0.95
DONE_STATES = (ReturnStatus.FILED, ReturnStatus.ACKNOWLEDGED)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/overview")
def get_overview(user: Viewer, db: Session = Depends(get_db)):
    t = user.tenant_id
    clients = db.execute(
        select(func.count()).select_from(Client).where(Client.tenant_id == t, Client.is_deleted.is_(False))
    ).scalar_one()
    pending = db.execute(
        select(func.count()).select_from(GateDecision).where(
            GateDecision.tenant_id == t, GateDecision.status.in_((GateStatus.PENDING, GateStatus.ESCALATED))
        )
    ).scalar_one()
    itc = db.execute(
        select(func.coalesce(func.sum(Invoice.cgst + Invoice.sgst + Invoice.igst), 0)).where(
            Invoice.tenant_id == t, Invoice.is_deleted.is_(False), Invoice.itc_eligible.is_(True)
        )
    ).scalar_one()
    filed = db.execute(
        select(func.count()).select_from(GSTReturn).where(
            GSTReturn.tenant_id == t, GSTReturn.is_deleted.is_(False), GSTReturn.status.in_(DONE_STATES)
        )
    ).scalar_one()
    open_returns = db.execute(
        select(func.count()).select_from(GSTReturn).where(
            GSTReturn.tenant_id == t, GSTReturn.is_deleted.is_(False), GSTReturn.status.not_in(DONE_STATES)
        )
    ).scalar_one()
    return {
        "clients_count": clients,
        "pending_gates": pending,
        "upcoming_deadlines": len(get_upcoming_deadlines(days_ahead=30)),
        "itc_safeguarded_inr": float(Decimal(itc or 0)),
        "returns_status": {"filed": filed, "pending": open_returns},
    }


@router.get("/deadlines")
def get_deadlines(user: Viewer):
    return [
        {
            "deadline_date": str(d.deadline_date),
            "return_type": d.return_type,
            "description": d.description,
            "penalty_per_day": float(d.penalty_per_day),
            "is_critical": d.is_critical,
            "days_remaining": d.days_remaining,
        }
        for d in get_upcoming_deadlines(days_ahead=45)
    ]


@router.get("/exceptions")
def get_exceptions(user: Viewer, db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    t = user.tenant_id
    out: List[Dict[str, Any]] = []
    soon = _utcnow() + timedelta(hours=6)
    gates = db.execute(
        select(GateDecision, Client.client_name)
        .join(Client, Client.id == GateDecision.client_id, isouter=True)
        .where(
            GateDecision.tenant_id == t,
            GateDecision.status.in_((GateStatus.PENDING, GateStatus.ESCALATED)),
        )
        .order_by(GateDecision.sla_deadline.asc().nulls_last())
        .limit(50)
    ).all()
    for g, name in gates:
        deadline = g.sla_deadline.replace(tzinfo=timezone.utc) if g.sla_deadline and g.sla_deadline.tzinfo is None else g.sla_deadline
        breached = deadline is not None and deadline <= _utcnow()
        near = deadline is not None and deadline <= soon
        if g.status == GateStatus.ESCALATED or near:
            out.append({
                "id": f"gate-{g.id}",
                "client": name or "Unknown client",
                "severity": "CRITICAL" if breached or g.status == GateStatus.ESCALATED else "HIGH",
                "details": f"{g.gate_id} {g.gate_name} — " + ("SLA breached" if breached else "SLA due within 6 hours" if near else "escalated"),
                "gate_id": str(g.id),
            })
    low = db.execute(
        select(Invoice, Client.client_name)
        .join(Client, Client.id == Invoice.client_id, isouter=True)
        .where(
            Invoice.tenant_id == t, Invoice.is_deleted.is_(False),
            Invoice.extraction_confidence.is_not(None), Invoice.extraction_confidence < LOW_CONFIDENCE,
        )
        .limit(20)
    ).all()
    for inv, name in low:
        out.append({
            "id": f"inv-{inv.id}",
            "client": name or "Unknown client",
            "severity": "HIGH",
            "details": f"Low OCR confidence ({inv.extraction_confidence:.2f}) on invoice {inv.invoice_number}",
            "gate_id": None,
        })
    return out


@router.get("/filing-tracker")
def get_filing_tracker(user: Viewer, db: Session = Depends(get_db)):
    rows = dict(
        db.execute(
            select(GSTReturn.status, func.count()).where(
                GSTReturn.tenant_id == user.tenant_id, GSTReturn.is_deleted.is_(False)
            ).group_by(GSTReturn.status)
        ).all()
    )
    completed = sum(rows.get(s, 0) for s in DONE_STATES)
    not_started = rows.get(ReturnStatus.DRAFT, 0)
    total = sum(rows.values())
    return {"completed": completed, "in_progress": total - completed - not_started, "not_started": not_started}


@router.post("/kill-switch/{client_id}")
def toggle_kill_switch(
    client_id: str,
    user: Annotated[User, Depends(require_role("PARTNER"))],
    db: Session = Depends(get_db),
):
    """Partner-only emergency stop persisted on the client record."""
    import uuid as _uuid
    try:
        cid = _uuid.UUID(client_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Client not found.")
    c = db.execute(
        select(Client).where(Client.id == cid, Client.tenant_id == user.tenant_id, Client.is_deleted.is_(False))
    ).scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=404, detail="Client not found.")
    c.emergency_bypass_active = not bool(c.emergency_bypass_active)
    db.commit()
    append_audit_block(
        db, user.tenant_id, str(user.id), user.role, "KILL_SWITCH_TOGGLED", "CLIENT", str(c.id),
        {"active": c.emergency_bypass_active},
    )
    return {"status": "success", "client_id": client_id, "kill_switch_active": c.emergency_bypass_active}
