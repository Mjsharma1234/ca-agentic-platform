"""Human Gates hub — tenant-scoped, database-backed.

Law 1: the machine prepares, a person decides. Every decision is authorised against the
gate's required role, enforces maker-checker (four-eyes) where a preparer is known, and is
sealed into the firm's SQC-1 audit chain. G7 can only be approved once the desktop signer
has produced a verified signature for the exact return under review.
"""
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...deterministic_core.audit_chain import append_audit_block
from ...models.clients import Client
from ...models.gates import GateDecision, GateStatus, GateTier, RequiredRole
from ...models.returns import GSTReturn, ReturnStatus
from ...models.signing import SigningRequest, SigningStatus
from ..deps import ROLE_HIERARCHY, User, get_current_user, require_role

router = APIRouter(prefix="/gates", tags=["gates"])

REQUIRED_LEVEL = {
    RequiredRole.STAFF: ROLE_HIERARCHY["ARTICLE_TRAINEE"],
    RequiredRole.REVIEWER: ROLE_HIERARCHY["REVIEWER"],
    RequiredRole.MANAGER: ROLE_HIERARCHY["MANAGER"],
    RequiredRole.PARTNER: ROLE_HIERARCHY["PARTNER"],
}
URGENT_HOURS = 6

Viewer = Annotated[User, Depends(require_role("ARTICLE_TRAINEE"))]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _level(user: User) -> int:
    return ROLE_HIERARCHY.get((user.role or "").upper(), 0)


def _needed_level(g: GateDecision) -> int:
    base = REQUIRED_LEVEL[g.required_role]
    return max(base, ROLE_HIERARCHY["PARTNER"]) if g.tier == GateTier.L3_PARTNER else base


def _describe(g: GateDecision) -> str:
    ev = g.evidence_pack or {}
    if ev.get("description"):
        return str(ev["description"])
    if ev.get("warning"):
        return str(ev["warning"])
    bits = [f"{k.replace('_', ' ')}: {v}" for k, v in list(ev.items())[:3] if not isinstance(v, (dict, list))]
    return "; ".join(bits) if bits else g.gate_name


def _public(g: GateDecision, client_names: Dict[uuid.UUID, str]) -> Dict[str, Any]:
    deadline = _aware(g.sla_deadline)
    remaining_h: Optional[float] = None
    if deadline is not None:
        remaining_h = round((deadline - _utcnow()).total_seconds() / 3600, 1)
    is_open = g.status in (GateStatus.PENDING, GateStatus.ESCALATED)
    return {
        "id": str(g.id),
        "gate_id": g.gate_id,
        "name": g.gate_name,
        "client_id": str(g.client_id),
        "client": client_names.get(g.client_id, "Unknown client"),
        "tier": "L3" if g.tier == GateTier.L3_PARTNER else "L2",
        "required_role": g.required_role.value,
        "status": g.status.value.lower(),
        "entity_type": g.entity_type,
        "entity_id": str(g.entity_id),
        "description": _describe(g),
        "evidence_pack": g.evidence_pack or {},
        "sla_deadline": deadline.isoformat() if deadline else None,
        "sla_remaining_hours": remaining_h,
        "urgent": bool(is_open and remaining_h is not None and remaining_h <= URGENT_HOURS),
        "decided_by": str(g.decided_by) if g.decided_by else None,
        "decided_at": _aware(g.decided_at).isoformat() if g.decided_at else None,
        "notes": g.decision_notes or g.escalation_reason,
    }


def _client_names(db: Session, tenant_id: uuid.UUID, ids: List[uuid.UUID]) -> Dict[uuid.UUID, str]:
    if not ids:
        return {}
    rows = db.execute(
        select(Client.id, Client.client_name).where(Client.tenant_id == tenant_id, Client.id.in_(set(ids)))
    ).all()
    return {r[0]: r[1] for r in rows}


def _load(db: Session, decision_id: str, user: User) -> GateDecision:
    try:
        gid = uuid.UUID(decision_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Gate decision not found.")
    g = db.execute(
        select(GateDecision).where(GateDecision.id == gid, GateDecision.tenant_id == user.tenant_id)
    ).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="Gate decision not found.")
    return g


@router.get("")
@router.get("/", include_in_schema=False)
def list_gates(
    user: Viewer,
    db: Session = Depends(get_db),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=200, ge=1, le=500),
):
    q = select(GateDecision).where(GateDecision.tenant_id == user.tenant_id)
    if status_filter:
        try:
            q = q.where(GateDecision.status == GateStatus(status_filter.upper()))
        except ValueError:
            raise HTTPException(status_code=422, detail="Unknown status filter.")
    rows = db.execute(q.order_by(GateDecision.sla_deadline.asc().nulls_last(), GateDecision.created_at.desc()).limit(limit)).scalars().all()
    names = _client_names(db, user.tenant_id, [g.client_id for g in rows])
    return [_public(g, names) for g in rows]


@router.get("/stats")
def gate_stats(user: Viewer, db: Session = Depends(get_db)):
    counts = dict(
        db.execute(
            select(GateDecision.status, func.count()).where(GateDecision.tenant_id == user.tenant_id).group_by(GateDecision.status)
        ).all()
    )
    decided = db.execute(
        select(GateDecision.created_at, GateDecision.decided_at).where(
            GateDecision.tenant_id == user.tenant_id, GateDecision.decided_at.is_not(None)
        ).order_by(GateDecision.decided_at.desc()).limit(200)
    ).all()
    mins = [
        (_aware(d) - _aware(c)).total_seconds() / 60 for c, d in decided if c is not None and d is not None
    ]
    return {
        "pending_count": counts.get(GateStatus.PENDING, 0),
        "escalated_count": counts.get(GateStatus.ESCALATED, 0),
        "approved_count": counts.get(GateStatus.APPROVED, 0),
        "rejected_count": counts.get(GateStatus.REJECTED, 0),
        "avg_approval_time_mins": round(sum(mins) / len(mins), 1) if mins else None,
    }


@router.get("/{decision_id}")
def get_gate(decision_id: str, user: Viewer, db: Session = Depends(get_db)):
    g = _load(db, decision_id, user)
    return _public(g, _client_names(db, user.tenant_id, [g.client_id]))


class DecisionBody(BaseModel):
    notes: str = Field(default="", max_length=2000)


def _guard_decision(db: Session, g: GateDecision, user: User, *, require_reason: bool, notes: str) -> Optional[GSTReturn]:
    if g.status not in (GateStatus.PENDING, GateStatus.ESCALATED):
        raise HTTPException(status_code=409, detail=f"Gate already {g.status.value.lower()}.")
    if _level(user) < _needed_level(g):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Gate {g.gate_id} requires {g.required_role.value.title()} authority or higher (your role: {user.role}).",
        )
    if require_reason and len(notes.strip()) < 3:
        raise HTTPException(status_code=422, detail="A reason is required to reject a gate.")

    ret: Optional[GSTReturn] = None
    if g.entity_type == "GST_RETURN":
        ret = db.execute(
            select(GSTReturn).where(GSTReturn.id == g.entity_id, GSTReturn.tenant_id == user.tenant_id)
        ).scalar_one_or_none()
        if ret is not None and ret.preparer_id is not None and ret.preparer_id == user.id:
            raise HTTPException(
                status_code=400,
                detail=f"Four-Eyes Invariant Violation: the preparer cannot decide gate {g.gate_id} on their own return.",
            )
    return ret


def _seal(db: Session, user: User, g: GateDecision, action: str, notes: str) -> None:
    append_audit_block(
        db, user.tenant_id, str(user.id), user.role, f"GATE_{action}", "GATE_DECISION", str(g.id),
        {"gate": g.gate_id, "entity": f"{g.entity_type}:{g.entity_id}", "notes": notes[:500]},
    )


@router.post("/{decision_id}/approve")
def approve_gate(decision_id: str, user: Viewer, body: DecisionBody = DecisionBody(), db: Session = Depends(get_db)):
    g = _load(db, decision_id, user)
    ret = _guard_decision(db, g, user, require_reason=False, notes=body.notes)

    if g.gate_id == "G7":
        signed = db.execute(
            select(SigningRequest).where(
                SigningRequest.tenant_id == user.tenant_id,
                SigningRequest.entity_type == g.entity_type,
                SigningRequest.entity_id == str(g.entity_id),
                SigningRequest.status == SigningStatus.SIGNED,
            )
        ).scalars().first()
        if signed is None:
            raise HTTPException(
                status_code=409,
                detail="Gate G7 cannot be approved without a verified desktop-signer signature. Start a signing request first.",
            )
    if g.gate_id == "G6" and ret is not None:
        ret.reviewer_id = user.id
        ret.status = ReturnStatus.REVIEWED

    g.status = GateStatus.APPROVED
    g.decided_by = user.id
    g.decided_at = _utcnow()
    g.decision_notes = body.notes
    db.commit()
    _seal(db, user, g, "APPROVED", body.notes)
    return _public(g, _client_names(db, user.tenant_id, [g.client_id]))


@router.post("/{decision_id}/reject")
def reject_gate(decision_id: str, body: DecisionBody, user: Viewer, db: Session = Depends(get_db)):
    g = _load(db, decision_id, user)
    _guard_decision(db, g, user, require_reason=True, notes=body.notes)
    g.status = GateStatus.REJECTED
    g.decided_by = user.id
    g.decided_at = _utcnow()
    g.decision_notes = body.notes
    db.commit()
    _seal(db, user, g, "REJECTED", body.notes)
    return _public(g, _client_names(db, user.tenant_id, [g.client_id]))


@router.post("/{decision_id}/escalate")
def escalate_gate(decision_id: str, body: DecisionBody, user: Viewer, db: Session = Depends(get_db)):
    g = _load(db, decision_id, user)
    if g.status != GateStatus.PENDING:
        raise HTTPException(status_code=409, detail=f"Gate already {g.status.value.lower()}.")
    if len(body.notes.strip()) < 3:
        raise HTTPException(status_code=422, detail="A reason is required to escalate a gate.")
    g.status = GateStatus.ESCALATED
    g.escalation_reason = body.notes
    db.commit()
    _seal(db, user, g, "ESCALATED", body.notes)
    return _public(g, _client_names(db, user.tenant_id, [g.client_id]))
