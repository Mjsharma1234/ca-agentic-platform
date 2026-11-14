"""Firm OS ops-tracker API (Phase 1).

Replaces the single unauthenticated JSON blob (/firm-os/state) with per-record storage:

  GET    /ops/me                      who am I in this firm (staff record), creating the link on first sign-in
  GET    /ops/workspace               every ops record for the caller's firm, in the tracker's shapes
  PUT    /ops/{entity}/{ref}          create or replace one record
  DELETE /ops/{entity}/{ref}          delete one record (soft delete for clients)
  POST   /ops/{entity}/batch          several upserts/deletes for one entity in one transaction
  POST   /ops/daybook                 append activity entries (append-only, idempotent by ref)
  GET    /ops/settings, PUT /ops/settings   per-firm settings not yet modelled as tables
  POST   /ops/workspace/import        load a starting workspace into an empty firm (partner only)
  POST   /ops/dev-login               local development only: sign in as a tracker persona

Every route requires a signed session token. The firm is always the token's tenant — never a
request field — and every query filters on it (PostgreSQL RLS enforces the same underneath).
"""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.database import get_db
from ...core.security import create_access_token, get_password_hash
from ...core.tenant_context import enter_tenant, system_scope
from ...models.clients import Client, ClientStatus, ClientType, ERPType, RiskTier
from ...models.ops import (
    OpsDaybookEntry, OpsFeeInvoice, OpsNotice, OpsObligation, OpsSettings, OpsStaff, OpsTask, OpsTimesheet,
)
from ...models.tenant import Firm, User as UserModel
from ..deps import ROLE_HIERARCHY, User, get_current_user

router = APIRouter(prefix="/ops", tags=["Firm OS ops tracker"])

STAFF_LEVEL, MANAGER_LEVEL, PARTNER_LEVEL = 1, 3, 5
LINE_STATES = {"scheduled", "awaiting", "received", "preparing", "reconciled", "review", "sign", "filed", "closed"}
TRACKER_ROLES = {"MP", "PT", "MG", "CC", "FO", "SA", "AR", "PX"}  # FO = front office
INTERNAL_CLIENT_REFS = {"self"}  # the firm's own compliance; lives in the tracker, not the client master
# Settings keys that change who can see or do what: partners only.
PRIVILEGED_SETTINGS = {"caps", "walls", "agentModes", "connectors"}
DEMO_EMAIL_DOMAIN = "@demo.firmos.local"
REF_RE = re.compile(r"^[A-Za-z0-9_.:/\-]{1,64}$")


# ----------------------------------------------------------------------------------------------
# access control
# ----------------------------------------------------------------------------------------------

def _level(user: User) -> int:
    return ROLE_HIERARCHY.get(user.role, 0)


def staff_user(user: User = Depends(get_current_user)) -> User:
    if user.scope == "signer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not available to signer tokens.")
    if _level(user) < STAFF_LEVEL:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "The ops tracker is for firm staff only.")
    return user


def _require(user: User, level: int, what: str) -> None:
    if _level(user) < level:
        who = {MANAGER_LEVEL: "a manager or partner", PARTNER_LEVEL: "a partner"}.get(level, "firm staff")
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Only {who} can {what}.")


def _actor(user: User) -> str:
    return str(user.id)


# ----------------------------------------------------------------------------------------------
# value parsing
# ----------------------------------------------------------------------------------------------

def _bad(msg: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, msg)


def _ref(value: Any, field: str = "id") -> str:
    ref = str(value or "").strip()
    if not REF_RE.match(ref):
        raise _bad(f"'{field}' must be 1-64 characters of letters, digits or - _ . : /")
    return ref


def _dt(value: Any, field: str, required: bool = False) -> Optional[datetime]:
    if value in (None, ""):
        if required:
            raise _bad(f"'{field}' is required")
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        raise _bad(f"'{field}' must be an ISO date-time")
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _money(value: Any, field: str) -> Decimal:
    try:
        amount = Decimal(str(value or 0))
    except (InvalidOperation, ValueError):
        raise _bad(f"'{field}' must be a number")
    if amount < 0 or amount > Decimal("1e13"):
        raise _bad(f"'{field}' is out of range")
    return amount.quantize(Decimal("0.01"))


def _text(value: Any, field: str, required: bool = False, limit: int = 500) -> Optional[str]:
    s = None if value is None else str(value).strip()
    if required and not s:
        raise _bad(f"'{field}' is required")
    if s and len(s) > limit:
        raise _bad(f"'{field}' is longer than {limit} characters")
    return s or None


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


# ----------------------------------------------------------------------------------------------
# entity definitions: record (tracker shape) <-> columns
# ----------------------------------------------------------------------------------------------

class Ctx:
    """Per-request lookups shared by the mappers (e.g. which client refs exist in this firm)."""

    def __init__(self, db: Session, tenant: uuid.UUID):
        self.db, self.tenant = db, tenant
        self._clients: Optional[set] = None

    def client_refs(self) -> set:
        if self._clients is None:
            rows = self.db.execute(
                select(Client).where(Client.tenant_id == self.tenant, Client.is_deleted.is_(False))
            ).scalars()
            self._clients = {_client_ref(c) for c in rows} | INTERNAL_CLIENT_REFS
        return self._clients

    def check_client(self, ref: Any, field: str = "client", required: bool = True) -> Optional[str]:
        if ref in (None, ""):
            if required:
                raise _bad(f"'{field}' is required")
            return None
        ref = _ref(ref, field)
        if ref not in self.client_refs():
            raise _bad(f"'{field}' refers to client '{ref}', which does not exist in this firm")
        return ref


def _staff_cols(rec: dict, ctx: Ctx) -> dict:
    role = str(rec.get("role") or "")
    if role not in TRACKER_ROLES:
        raise _bad(f"'role' must be one of {sorted(TRACKER_ROLES)}")
    return {
        "name": _text(rec.get("name"), "name", required=True, limit=150),
        "role": role,
        "email": (_text(rec.get("email"), "email", limit=150) or "").lower() or None,
        "phone": _phone(rec.get("phone")),
        "active": rec.get("active", True) is not False,
    }


def _phone(value: Any) -> Optional[str]:
    """Store mobile numbers in E.164 (+91…) so they match Firebase / OTP sign-ins."""
    raw = _text(value, "phone", limit=20)
    if not raw:
        return None
    from ...deterministic_core.otp_service import OTPService
    try:
        normalised, channel = OTPService.normalize_identifier(raw)
    except ValueError:
        raise _bad("'phone' is not a valid mobile number")
    if channel != "SMS":
        raise _bad("'phone' is not a valid mobile number")
    return normalised


def _obligation_cols(rec: dict, ctx: Ctx) -> dict:
    state = str(rec.get("state") or "")
    if state not in LINE_STATES:
        raise _bad(f"'state' must be one of {sorted(LINE_STATES)}")
    return {
        "client_ref": ctx.check_client(rec.get("client")),
        "form": _text(rec.get("form"), "form", required=True, limit=64),
        "domain": _text(rec.get("d"), "d", limit=16),
        "period": _text(rec.get("period"), "period", limit=64),
        "due_at": _dt(rec.get("due"), "due", required=True),
        "state": state,
        "preparer_ref": _text(rec.get("prep"), "prep", limit=64),
        "reviewer_ref": _text(rec.get("rev"), "rev", limit=64),
        "partner_ref": _text(rec.get("partner"), "partner", limit=64),
        "ack": _text(rec.get("ack"), "ack", limit=64),
        "amount": _money(rec.get("amount"), "amount"),
    }


def _task_cols(rec: dict, ctx: Ctx) -> dict:
    return {
        "title": _text(rec.get("title"), "title", required=True, limit=2000),
        "client_ref": ctx.check_client(rec.get("client"), required=False),
        "owner_ref": _text(rec.get("who"), "who", limit=64),
        "due_at": _dt(rec.get("due"), "due"),
        "done": bool(rec.get("done")),
    }


def _notice_cols(rec: dict, ctx: Ctx) -> dict:
    return {
        "client_ref": ctx.check_client(rec.get("client")),
        "notice_type": _text(rec.get("type"), "type", required=True, limit=128),
        "demand": _money(rec.get("demand"), "demand"),
        "received_at": _dt(rec.get("received"), "received"),
        "reply_by": _dt(rec.get("replyBy"), "replyBy"),
        "owner_ref": _text(rec.get("owner"), "owner", limit=64),
        "stage": _text(rec.get("stage"), "stage", limit=128),
    }


def _timesheet_cols(rec: dict, ctx: Ctx) -> dict:
    try:
        work_date = date.fromisoformat(str(rec.get("date") or ""))
    except ValueError:
        raise _bad("'date' must be YYYY-MM-DD")
    try:
        minutes = int(rec.get("minutes"))
    except (TypeError, ValueError):
        raise _bad("'minutes' must be a whole number")
    if not 0 < minutes <= 24 * 60:
        raise _bad("'minutes' must be between 1 and 1440")
    source = rec.get("source") or "manual"
    if source not in ("manual", "daybook"):
        raise _bad("'source' must be manual or daybook")
    return {
        "staff_ref": _ref(rec.get("staff"), "staff"),
        "client_ref": ctx.check_client(rec.get("client"), required=False),
        "work_date": work_date,
        "minutes": minutes,
        "source": source,
    }


def _invoice_cols(rec: dict, ctx: Ctx) -> dict:
    return {
        "client_ref": ctx.check_client(rec.get("client")),
        "status": _text(rec.get("status"), "status", required=True, limit=64),
        "amount": _money(rec.get("amt"), "amt"),
        "issued_at": _dt(rec.get("date"), "date"),
    }


# entity name -> (model, key field in the tracker record, column mapper, level needed to write, level to delete)
ENTITIES: Dict[str, Tuple[Any, str, Callable[[dict, Ctx], dict], int, int]] = {
    "staff": (OpsStaff, "id", _staff_cols, MANAGER_LEVEL, PARTNER_LEVEL),
    "obligations": (OpsObligation, "id", _obligation_cols, STAFF_LEVEL, MANAGER_LEVEL),
    "tasks": (OpsTask, "id", _task_cols, STAFF_LEVEL, STAFF_LEVEL),
    "notices": (OpsNotice, "id", _notice_cols, STAFF_LEVEL, MANAGER_LEVEL),
    "timesheets": (OpsTimesheet, "id", _timesheet_cols, STAFF_LEVEL, MANAGER_LEVEL),
    "invoices": (OpsFeeInvoice, "no", _invoice_cols, STAFF_LEVEL, PARTNER_LEVEL),
}


def _entity(name: str):
    if name not in ENTITIES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown ops entity '{name}'.")
    return ENTITIES[name]


def _record(row: Any, key: str) -> dict:
    rec = dict(row.data or {})
    rec[key] = row.ref
    return rec


# ----------------------------------------------------------------------------------------------
# clients: stored in the shared `clients` table
# ----------------------------------------------------------------------------------------------

def _client_ref(c: Client) -> str:
    return str((c.metadata_ or {}).get("ref") or c.id)


def _client_type(label: str) -> ClientType:
    t = (label or "").lower()
    for needle, value in (("llp", ClientType.LLP), ("huf", ClientType.HUF), ("trust", ClientType.TRUST),
                          ("partnership", ClientType.PARTNERSHIP), ("individual", ClientType.INDIVIDUAL),
                          ("proprietor", ClientType.INDIVIDUAL)):
        if needle in t:
            return value
    return ClientType.COMPANY


def _erp(books: str) -> ERPType:
    b = (books or "").lower()
    if "tally" in b:
        return ERPType.TALLY_PRIME
    if "zoho" in b:
        return ERPType.ZOHO_BOOKS
    if "busy" in b:
        return ERPType.BUSY
    if "sap" in b:
        return ERPType.SAP
    return ERPType.MANUAL


def _risk(label: str) -> RiskTier:
    return {"low": RiskTier.LOW, "high": RiskTier.HIGH, "critical": RiskTier.CRITICAL}.get(
        (label or "").lower(), RiskTier.MEDIUM)


def _client_cols(rec: dict) -> dict:
    pan = (_text(rec.get("pan"), "pan", limit=10) or "").upper()
    if pan and not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", pan):
        raise _bad("'pan' is not a valid PAN")
    gstin = (_text(rec.get("gstin"), "gstin", limit=15) or "").upper() or None
    if gstin and not re.fullmatch(r"[0-9]{2}[A-Z0-9]{13}", gstin):
        raise _bad("'gstin' is not a valid GSTIN")
    return {
        "client_name": _text(rec.get("name"), "name", required=True, limit=200),
        "trade_name": _text(rec.get("short"), "short", limit=120),
        "pan": pan,
        "gstin": gstin,
        "client_type": _client_type(rec.get("type")),
        "erp_type": _erp(rec.get("books")),
        "risk_tier": _risk(rec.get("risk")),
        "annual_turnover": _money(rec.get("turnover"), "turnover"),
        "is_composition": "comp" in (rec.get("tags") or []),
        "status": ClientStatus.ACTIVE,
    }


def _client_record(c: Client) -> dict:
    meta = c.metadata_ or {}
    rec = dict(meta.get("tracker") or {})
    if not rec:  # a client created elsewhere (e.g. the client master API): give the tracker a usable profile
        rec = {
            "name": c.client_name, "short": c.trade_name or c.client_name, "pan": c.pan, "gstin": c.gstin,
            "type": c.client_type.value.title() if c.client_type else "Company", "tags": [], "team": [],
            "partner": None, "manager": None, "turnover": float(c.annual_turnover or 0), "fee": 0,
            "lang": "English", "channel": "Email", "risk": (c.risk_tier.value.title() if c.risk_tier else "Medium"),
            "health": 80, "since": (c.created_at.year if c.created_at else None), "contact": "—",
            "books": (c.erp_type.value.replace("_", " ").title() if c.erp_type else "—"), "city": "—", "state": "",
        }
    rec["id"] = _client_ref(c)
    return rec


def _find_client(db: Session, tenant: uuid.UUID, ref: str) -> Optional[Client]:
    rows = db.execute(select(Client).where(Client.tenant_id == tenant)).scalars()
    return next((c for c in rows if _client_ref(c) == ref), None)


def _upsert_client(db: Session, user: User, rec: dict) -> dict:
    ref = _ref(rec.get("id"))
    if ref in INTERNAL_CLIENT_REFS:
        raise _bad(f"'{ref}' is reserved for the firm's own compliance")
    cols = _client_cols(rec)
    row = _find_client(db, user.tenant_id, ref)
    if cols["gstin"]:
        clash = db.execute(select(Client).where(
            Client.tenant_id == user.tenant_id, Client.gstin == cols["gstin"], Client.is_deleted.is_(False)
        )).scalars().all()
        if any(c is not row for c in clash):
            raise HTTPException(status.HTTP_409_CONFLICT, f"Another client in this firm already has GSTIN {cols['gstin']}")
    if row is None:
        row = Client(tenant_id=user.tenant_id, financial_year_start="04-01", financial_year_end="03-31")
        db.add(row)
    for k, v in cols.items():
        setattr(row, k, v)
    row.is_deleted, row.deleted_at = False, None
    row.metadata_ = {**(row.metadata_ or {}), "ref": ref, "tracker": {**rec, "id": ref}}
    try:
        db.flush()  # surface GSTIN clashes here, and make the row visible to the next lookup
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"Another client in this firm already has GSTIN {cols['gstin']}")
    return rec


def _delete_client(db: Session, user: User, ref: str) -> bool:
    row = _find_client(db, user.tenant_id, ref)
    if row is None or row.is_deleted:
        return False
    row.is_deleted, row.deleted_at = True, datetime.now(timezone.utc)
    return True


# ----------------------------------------------------------------------------------------------
# generic upsert / delete
# ----------------------------------------------------------------------------------------------

def _upsert(db: Session, user: User, entity: str, rec: dict, ctx: Ctx) -> None:
    if not isinstance(rec, dict):
        raise _bad("each record must be an object")
    if entity == "clients":
        _require(user, MANAGER_LEVEL, "add or change clients")
        _upsert_client(db, user, rec)
        ctx._clients = None
        return
    model, key, mapper, write_level, _ = _entity(entity)
    _require(user, write_level, f"change {entity}")
    ref = _ref(rec.get(key), key)
    cols = mapper(rec, ctx)
    row = db.execute(select(model).where(model.tenant_id == user.tenant_id, model.ref == ref)).scalar_one_or_none()
    if row is None:
        row = model(tenant_id=user.tenant_id, ref=ref)
        db.add(row)
    for k, v in cols.items():
        setattr(row, k, v)
    row.data = {**rec, key: ref}
    row.updated_by = _actor(user)


def _delete(db: Session, user: User, entity: str, ref: str) -> bool:
    ref = _ref(ref)
    if entity == "clients":
        _require(user, PARTNER_LEVEL, "remove clients")
        return _delete_client(db, user, ref)
    model, _, _, _, delete_level = _entity(entity)
    _require(user, delete_level, f"delete {entity}")
    row = db.execute(select(model).where(model.tenant_id == user.tenant_id, model.ref == ref)).scalar_one_or_none()
    if row is None:
        return False
    db.delete(row)
    return True


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        detail = "This conflicts with an existing record"
        if "gstin" in str(e.orig).lower():
            detail = "Another client in this firm already has this GSTIN"
        raise HTTPException(status.HTTP_409_CONFLICT, detail)


# ----------------------------------------------------------------------------------------------
# staff <-> login
# ----------------------------------------------------------------------------------------------

def _tracker_role(backend_role: str) -> str:
    return {"PARTNER": "PT", "SENIOR_MANAGER": "MG", "MANAGER": "MG"}.get(backend_role, "AR")


def _backend_role(tracker_role: str) -> str:
    return {"MP": "PARTNER", "PT": "PARTNER", "MG": "MANAGER", "CC": "MANAGER"}.get(tracker_role, "ARTICLE_TRAINEE")


def _link_staff(db: Session, user: User) -> OpsStaff:
    """The staff record for this login: by link, then email, then phone; created on first sign-in."""
    q = select(OpsStaff).where(OpsStaff.tenant_id == user.tenant_id)
    staff = db.execute(q.where(OpsStaff.user_id == user.id)).scalar_one_or_none()
    if staff is None and user.email:
        staff = db.execute(q.where(OpsStaff.email == user.email.lower(), OpsStaff.user_id.is_(None))).scalars().first()
    if staff is None and user.phone:
        staff = db.execute(q.where(OpsStaff.phone == user.phone, OpsStaff.user_id.is_(None))).scalars().first()
    if staff is None and settings.DEBUG and (user.email or "").endswith(DEMO_EMAIL_DOMAIN):
        staff = db.execute(q.where(OpsStaff.ref == user.email.split("@")[0])).scalar_one_or_none()
    if staff is None:
        base = re.sub(r"[^a-z0-9]+", "", (user.email or "").split("@")[0].lower()) or "staff"
        ref, n = base[:40], 1
        while db.execute(q.where(OpsStaff.ref == ref)).scalar_one_or_none() is not None:
            n += 1
            ref = f"{base[:36]}{n}"
        name = user.full_name or base.title()
        role = _tracker_role(user.role)
        staff = OpsStaff(
            tenant_id=user.tenant_id, ref=ref, name=name, role=role, email=(user.email or "").lower() or None,
            phone=user.phone, data={"id": ref, "name": name, "short": name.split(" ")[0], "role": role,
                                    "focus": "", "status": "In office", "cost": 0},
        )
        db.add(staff)
    staff.user_id = user.id
    return staff


# ----------------------------------------------------------------------------------------------
# routes
# ----------------------------------------------------------------------------------------------

class BatchRequest(BaseModel):
    upserts: List[Dict[str, Any]] = Field(default_factory=list, max_length=2000)
    deletes: List[str] = Field(default_factory=list, max_length=2000)


class DaybookRequest(BaseModel):
    entries: List[Dict[str, Any]] = Field(..., max_length=2000)


class SettingsRequest(BaseModel):
    data: Dict[str, Any]


class ImportRequest(BaseModel):
    clients: List[Dict[str, Any]] = Field(default_factory=list)
    staff: List[Dict[str, Any]] = Field(default_factory=list)
    obligations: List[Dict[str, Any]] = Field(default_factory=list)
    tasks: List[Dict[str, Any]] = Field(default_factory=list)
    notices: List[Dict[str, Any]] = Field(default_factory=list)
    timesheets: List[Dict[str, Any]] = Field(default_factory=list)
    invoices: List[Dict[str, Any]] = Field(default_factory=list)
    daybook: List[Dict[str, Any]] = Field(default_factory=list)
    settings: Dict[str, Any] = Field(default_factory=dict)


class DevLoginRequest(BaseModel):
    staff: Dict[str, Any]


@router.get("/me")
def ops_me(user: User = Depends(staff_user), db: Session = Depends(get_db)):
    staff = _link_staff(db, user)
    _commit(db)
    return {"staff": _record(staff, "id") | {"role": staff.role}, "user": {"id": str(user.id), "role": user.role,
                                                                             "email": user.email, "firm_id": str(user.tenant_id)}}


@router.get("/workspace")
def get_workspace(user: User = Depends(staff_user), db: Session = Depends(get_db)):
    t = user.tenant_id
    out: Dict[str, Any] = {}
    clients = db.execute(select(Client).where(Client.tenant_id == t, Client.is_deleted.is_(False))).scalars()
    out["clients"] = [_client_record(c) for c in clients]
    for name, (model, key, _, _, _) in ENTITIES.items():
        out[name] = [_record(r, key) for r in db.execute(select(model).where(model.tenant_id == t)).scalars()]
    rows = db.execute(
        select(OpsDaybookEntry).where(OpsDaybookEntry.tenant_id == t).order_by(OpsDaybookEntry.seq)
    ).scalars().all()
    out["daybook"] = [dict(r.data or {}) for r in rows[-900:]]
    s = db.get(OpsSettings, t)
    out["settings"] = (s.data if s else {}) or {}
    # Staff records alone don't count: signing in creates one for the person.
    out["empty"] = not out["obligations"] and not out["clients"] and not out["daybook"]
    return out


@router.put("/{entity}/{ref}")
def put_record(entity: str, ref: str, rec: Dict[str, Any], user: User = Depends(staff_user), db: Session = Depends(get_db)):
    key = "id" if entity == "clients" else _entity(entity)[1]
    if str(rec.get(key, ref)) != ref:
        raise _bad(f"'{key}' in the body does not match the URL")
    _upsert(db, user, entity, {**rec, key: ref}, Ctx(db, user.tenant_id))
    _commit(db)
    return {"status": "ok", "entity": entity, "ref": ref}


@router.delete("/{entity}/{ref}")
def delete_record(entity: str, ref: str, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    if not _delete(db, user, entity, ref):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No {entity} record '{ref}' in this firm.")
    _commit(db)
    return {"status": "deleted", "entity": entity, "ref": ref}


@router.post("/{entity}/batch")
def batch_records(entity: str, req: BatchRequest, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    if entity != "clients":
        _entity(entity)
    ctx = Ctx(db, user.tenant_id)
    for rec in req.upserts:
        _upsert(db, user, entity, rec, ctx)
    deleted = sum(1 for ref in req.deletes if _delete(db, user, entity, ref))
    _commit(db)
    return {"status": "ok", "entity": entity, "upserted": len(req.upserts), "deleted": deleted}


def _append_daybook(db: Session, user: User, entries: List[dict]) -> int:
    t = user.tenant_id
    existing = set(db.execute(select(OpsDaybookEntry.ref).where(OpsDaybookEntry.tenant_id == t)).scalars())
    last = db.execute(
        select(OpsDaybookEntry.seq).where(OpsDaybookEntry.tenant_id == t).order_by(OpsDaybookEntry.seq.desc()).limit(1)
    ).scalar_one_or_none() or 0
    added = 0
    for e in entries:
        if not isinstance(e, dict):
            raise _bad("each daybook entry must be an object")
        ref = _ref(f"{e.get('hash')}-{e.get('n')}", "hash")
        if ref in existing:
            continue  # idempotent: the same entry may be re-sent after a dropped response
        last += 1
        db.add(OpsDaybookEntry(
            tenant_id=t, ref=ref, seq=last, at=_dt(e.get("at"), "at", required=True),
            actor_ref=_text(e.get("actor"), "actor", required=True, limit=64),
            kind=_text(e.get("kind"), "kind", limit=16) or "human",
            action=_text(e.get("action"), "action", required=True, limit=2000),
            client_ref=_text(e.get("client"), "client", limit=64), hash=_text(e.get("hash"), "hash", required=True, limit=64),
            prev_hash=_text(e.get("prev"), "prev", limit=64) or "", data=e, updated_by=_actor(user),
        ))
        existing.add(ref)
        added += 1
    return added


@router.post("/daybook")
def append_daybook(req: DaybookRequest, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    added = _append_daybook(db, user, req.entries)
    _commit(db)
    return {"status": "ok", "appended": added}


@router.get("/settings")
def get_settings(user: User = Depends(staff_user), db: Session = Depends(get_db)):
    s = db.get(OpsSettings, user.tenant_id)
    return {"data": (s.data if s else {}) or {}}


def _put_settings(db: Session, user: User, data: dict, *, check: bool = True) -> None:
    row = db.get(OpsSettings, user.tenant_id)
    current = (row.data if row else {}) or {}
    if check and _level(user) < PARTNER_LEVEL:
        changed = sorted(k for k in PRIVILEGED_SETTINGS if k in data and data.get(k) != current.get(k))
        if changed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Only a partner can change: {', '.join(changed)}.")
    if row is None:
        row = OpsSettings(tenant_id=user.tenant_id, data=data)
        db.add(row)
    else:
        row.data = data
    row.updated_by = _actor(user)


@router.put("/settings")
def put_settings(req: SettingsRequest, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    _put_settings(db, user, req.data)
    _commit(db)
    return {"status": "ok"}


@router.post("/workspace/import")
def import_workspace(req: ImportRequest, user: User = Depends(staff_user), db: Session = Depends(get_db)):
    """Loads a starting workspace (e.g. the demo firm) into a firm that has no ops data yet."""
    _require(user, PARTNER_LEVEL, "load a starting workspace")
    t = user.tenant_id
    has_data = (
        db.execute(select(OpsObligation.id).where(OpsObligation.tenant_id == t).limit(1)).first()
        or db.execute(select(OpsDaybookEntry.id).where(OpsDaybookEntry.tenant_id == t).limit(1)).first()
        or db.execute(select(Client.id).where(Client.tenant_id == t, Client.is_deleted.is_(False)).limit(1)).first()
    )
    if has_data:
        raise HTTPException(status.HTTP_409_CONFLICT, "This firm already has ops data; import is only for an empty firm.")
    ctx = Ctx(db, t)
    counts = {}
    for rec in req.clients:
        _upsert(db, user, "clients", rec, ctx)
    db.flush()
    ctx._clients = None
    counts["clients"] = len(req.clients)
    for name in ("staff", "obligations", "tasks", "notices", "timesheets", "invoices"):
        for rec in getattr(req, name):
            _upsert(db, user, name, rec, ctx)
        counts[name] = len(getattr(req, name))
    db.flush()
    counts["daybook"] = _append_daybook(db, user, req.daybook)
    _put_settings(db, user, req.settings, check=False)
    _link_staff(db, user)
    _commit(db)
    return {"status": "imported", "counts": counts}


@router.post("/dev-login")
def dev_login(req: DevLoginRequest, db: Session = Depends(get_db)):
    """Local development only: issue a session for a tracker persona without an OTP round-trip.
    Refused unless DEBUG and OTP sandbox mode are both on and Firebase is not the login provider, so it can never
    exist in production or sidestep Firebase phone sign-in."""
    if not (settings.DEBUG and settings.OTP_SANDBOX_MODE) or settings.effective_login_provider == "firebase":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")
    rec = req.staff or {}
    ref = _ref(rec.get("id"))
    with system_scope(db):
        firm = db.execute(select(Firm).where(Firm.firm_code == "nallamala-co")).scalar_one_or_none()
        if firm is None:
            firm = Firm(id=uuid.uuid4(), firm_code="nallamala-co", firm_name="Nallamala & Co. (demo)",
                        constitution="PARTNERSHIP", head_office_city="Hyderabad")
            db.add(firm)
            db.flush()
    enter_tenant(db, firm.id)
    staff = db.execute(select(OpsStaff).where(OpsStaff.tenant_id == firm.id, OpsStaff.ref == ref)).scalar_one_or_none()
    any_staff = db.execute(select(OpsStaff.id).where(OpsStaff.tenant_id == firm.id).limit(1)).first()
    if staff is None and any_staff:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No staff member '{ref}' in the demo firm.")
    role = staff.role if staff else str(rec.get("role") or "AR")
    if role not in TRACKER_ROLES:
        raise _bad("unknown role")
    name = staff.name if staff else _text(rec.get("name"), "name", required=True, limit=150)
    email = f"{ref}{DEMO_EMAIL_DOMAIN}"
    with system_scope(db):
        row = db.execute(select(UserModel).where(UserModel.email == email)).scalar_one_or_none()
        if row is None:
            row = UserModel(firm_id=firm.id, email=email, full_name=name, role=_backend_role(role),
                            hashed_password=get_password_hash(uuid.uuid4().hex), is_active=True)
            db.add(row)
        row.role, row.full_name = _backend_role(role), name
        db.flush()
    if staff is not None:
        staff.user_id = row.id
    db.commit()
    token = create_access_token(
        {"sub": str(row.id), "tenant_id": str(firm.id), "role": row.role, "email": email, "full_name": name},
        expires_delta=timedelta(hours=12),
    )
    return {"access_token": token, "token_type": "bearer", "staff_ref": ref, "role": row.role, "firm_id": str(firm.id)}
