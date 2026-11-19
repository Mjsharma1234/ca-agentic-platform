"""Pairing a Tally agent with a firm without anyone copying keys (device-code flow, like `gh auth login`).

  1. The agent calls /start with no credentials and gets a secret device_code and a short user_code.
  2. The agent opens the Firm OS link carrying the user_code. A signed-in manager sees which PC is asking
     (name, version, the Tally companies it can see) and approves or denies.
  3. The agent polls /poll with its device_code. On approval it receives a freshly generated agent key, once.

The raw key is created at poll time and never stored, only its hash. A manager approving gives the PC access to
THEIR firm, so the approval screen must show what is being approved; see the design doc for the phishing note.
Unauthenticated routes are limited by a global cap on pending requests, a 15-minute lifetime and rate limits;
the approver's code lookups are rate limited per user so codes cannot be guessed.
"""
import re
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.shared_store import get_store
from ...core.tenant_context import set_tenant, system_scope
from ...models.tally_agent import TallyAgent, TallyEnrollment
from .tally_agent import KEY_PREFIX, Manager, _audit, _hash_key

router = APIRouter(prefix="/tally-agent/enroll", tags=["tally-agent-pairing"])

PENDING_TTL = timedelta(minutes=15)
DELIVERY_WINDOW = timedelta(minutes=5)   # after approval, the agent has this long to collect its key
POLL_INTERVAL_SECONDS = 3
MAX_PENDING = 500
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no 0/O/1/I, so a code read off a screen is unambiguous
_CODE = re.compile(r"^[A-Z2-9]{4}-?[A-Z2-9]{4}$")


def _new_user_code() -> str:
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _clean_code(user_code: str) -> str:
    code = (user_code or "").strip().upper()
    if not _CODE.match(code):
        raise HTTPException(status_code=404, detail="Pairing code not found or expired.")
    return code if "-" in code else f"{code[:4]}-{code[4:]}"


# --------------------------------------------------------------------------------------------------
# The agent (no credentials)
# --------------------------------------------------------------------------------------------------
class StartBody(BaseModel):
    pc_name: str = Field("", max_length=80)
    agent_version: str = Field("", max_length=32)
    companies: List[str] = Field(default_factory=list, max_length=50)


@router.post("/start")
def start(body: StartBody, request: Request, db: Session = Depends(get_db)):
    # Behind a proxy request.client may be the proxy for everyone, so this limit is generous; the pending cap is the real guard.
    if not get_store().allow(f"tally-enroll-start:{_client_ip(request)}", 60, 3600):
        raise HTTPException(status_code=429, detail="Too many pairing requests. Try again later.", headers={"Retry-After": "3600"})
    now = datetime.utcnow()
    device_code = "fosd_" + secrets.token_urlsafe(32)
    companies = [c.strip()[:250] for c in body.companies if c and c.strip()][:50]
    with system_scope(db):
        db.execute(delete(TallyEnrollment).where(TallyEnrollment.expires_at < now - timedelta(days=1)))
        pending = db.execute(
            select(func.count()).select_from(TallyEnrollment).where(TallyEnrollment.status == "pending", TallyEnrollment.expires_at > now)
        ).scalar_one()
        if pending >= MAX_PENDING:
            raise HTTPException(status_code=429, detail="Too many pairing requests right now. Try again in a few minutes.",
                                headers={"Retry-After": "300"})
        for _ in range(5):
            enrollment = TallyEnrollment(
                device_code_hash=_hash_key(device_code), user_code=_new_user_code(), pc_name=body.pc_name.strip(),
                agent_version=body.agent_version.strip(), companies=companies, expires_at=now + PENDING_TTL,
            )
            db.add(enrollment)
            try:
                db.commit()
                break
            except IntegrityError:   # user_code collision (rare): try another
                db.rollback()
        else:
            raise HTTPException(status_code=503, detail="Could not create a pairing code. Try again.")
        user_code = enrollment.user_code
    return {
        "device_code": device_code, "user_code": user_code, "verification_path": f"/#/tally/{user_code}",
        "expires_in": int(PENDING_TTL.total_seconds()), "interval": POLL_INTERVAL_SECONDS,
    }


class PollBody(BaseModel):
    device_code: str = Field(..., min_length=10, max_length=100)


@router.post("/poll")
def poll(body: PollBody, db: Session = Depends(get_db)):
    h = _hash_key(body.device_code)
    if not get_store().allow(f"tally-enroll-poll:{h[:24]}", 60, 60):
        raise HTTPException(status_code=429, detail="Polling too fast.", headers={"Retry-After": "5"})
    now = datetime.utcnow()
    with system_scope(db):
        e = db.execute(select(TallyEnrollment).where(TallyEnrollment.device_code_hash == h)).scalar_one_or_none()
        if e is None or e.expires_at < now:
            return {"status": "expired"}          # unknown and expired look the same: no way to probe for codes
        if e.status == "pending":
            return {"status": "pending"}
        if e.status in ("denied", "delivered"):
            return {"status": e.status}
        # Approved: claim delivery atomically so two overlapping polls cannot mint two keys.
        claimed = db.execute(
            update(TallyEnrollment).where(TallyEnrollment.id == e.id, TallyEnrollment.status == "approved").values(status="delivered")
        ).rowcount
        if claimed != 1:
            db.rollback()
            return {"status": "delivered"}
        key = KEY_PREFIX + secrets.token_urlsafe(32)
        agent = TallyAgent(
            tenant_id=e.tenant_id, name=(e.pc_name or "Tally PC")[:120], key_prefix=key[:12], key_hash=_hash_key(key),
            created_by=e.approved_by or "pairing",
        )
        db.add(agent)
        db.flush()
        e.agent_id = agent.id
        tenant_id, agent_id, enrollment_id, pc_name = e.tenant_id, agent.id, e.id, e.pc_name
    set_tenant(db, tenant_id)   # the audit chain is tenant-scoped, so leave system scope before writing to it
    _audit(db, tenant_id, str(agent_id), "SYSTEM", "TALLY_AGENT_KEY_DELIVERED", str(agent_id),
           {"enrollment": str(enrollment_id), "pc_name": pc_name})
    db.commit()
    return {"status": "approved", "key": key, "agent_id": str(agent_id)}


# --------------------------------------------------------------------------------------------------
# The approver (a signed-in manager or partner)
# --------------------------------------------------------------------------------------------------
def _limit_lookups(user) -> None:
    if not get_store().allow(f"tally-enroll-lookup:{user.id}", 30, 3600):
        raise HTTPException(status_code=429, detail="Too many pairing code attempts. Try again later.", headers={"Retry-After": "3600"})


def _public(e: TallyEnrollment) -> Dict[str, Any]:
    return {
        "user_code": e.user_code, "pc_name": e.pc_name, "agent_version": e.agent_version, "companies": e.companies or [],
        "requested_at": e.created_at.isoformat(), "expires_at": e.expires_at.isoformat(),
    }


def _pending(db: Session, code: str) -> TallyEnrollment:
    e = db.execute(select(TallyEnrollment).where(
        TallyEnrollment.user_code == code, TallyEnrollment.status == "pending", TallyEnrollment.expires_at > datetime.utcnow()
    )).scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=404, detail="Pairing code not found or expired.")
    return e


@router.get("/{user_code}")
def lookup(user_code: str, user: Manager, db: Session = Depends(get_db)):
    """What is asking to pair, so the manager can recognise it before approving."""
    _limit_lookups(user)
    code = _clean_code(user_code)
    with system_scope(db):
        return _public(_pending(db, code))


@router.post("/{user_code}/approve")
def approve(user_code: str, user: Manager, db: Session = Depends(get_db)):
    _limit_lookups(user)
    code = _clean_code(user_code)
    with system_scope(db):
        e = _pending(db, code)
        enrollment_id, pc_name, companies = e.id, e.pc_name, e.companies or []
        won = db.execute(
            update(TallyEnrollment)
            .where(TallyEnrollment.id == enrollment_id, TallyEnrollment.status == "pending")
            .values(status="approved", tenant_id=user.tenant_id, approved_by=str(user.id),
                    expires_at=datetime.utcnow() + DELIVERY_WINDOW)
        ).rowcount
        if won != 1:
            db.rollback()
            raise HTTPException(status_code=409, detail="This pairing request was already handled.")
        db.commit()
    set_tenant(db, user.tenant_id)
    _audit(db, user.tenant_id, str(user.id), user.role, "TALLY_AGENT_PAIRING_APPROVED", str(enrollment_id),
           {"pc_name": pc_name, "companies": companies})
    db.commit()
    return {"status": "approved", "pc_name": pc_name}


@router.post("/{user_code}/deny")
def deny(user_code: str, user: Manager, db: Session = Depends(get_db)):
    _limit_lookups(user)
    code = _clean_code(user_code)
    with system_scope(db):
        e = _pending(db, code)
        e.status = "denied"
        db.commit()
    return {"status": "denied"}
