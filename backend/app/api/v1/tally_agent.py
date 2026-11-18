"""Tally desktop agent API.

Two audiences share this router:
  * Firm staff (Bearer session, MANAGER or higher) issue and revoke agent keys and link each Tally company to a client.
  * The agent (X-Agent-Key header) sends heartbeats and snapshots of a company's purchase register.

An ingest is a snapshot of one Tally company for one period. Vouchers are upserted by Tally GUID into the
client's inward invoices (source ERP_SYNC), and ERP_SYNC vouchers in that period that Tally no longer has are
soft-deleted, so edits and deletions made in Tally carry through. The agent never writes to Tally.
"""
import gzip  # noqa: F401  (documented wire format)
import hashlib
import json
import secrets
import uuid
import zlib
from datetime import date, datetime
from typing import Annotated, Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.tenant_context import set_tenant, system_scope
from ...deterministic_core.audit_chain import append_audit_block
from ...deterministic_core.tally_vouchers import parse_purchase_vouchers
from ...models.clients import Client
from ...models.invoices import Invoice, InvoiceDirection, InvoiceSource, InvoiceStatus
from ...models.tally_agent import TallyAgent, TallyCompany
from ..deps import User, require_role

router = APIRouter(prefix="/tally-agent", tags=["tally-agent"])

MAX_COMPRESSED_BYTES = 20 * 1024 * 1024
MAX_XML_BYTES = 50 * 1024 * 1024
MAX_WARNINGS_RETURNED = 50
KEY_PREFIX = "fosk_"

Manager = Annotated[User, Depends(require_role("MANAGER"))]


# --------------------------------------------------------------------------------------------------
# Agent authentication
# --------------------------------------------------------------------------------------------------
def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def get_agent(db: Session = Depends(get_db), x_agent_key: Optional[str] = Header(None)) -> TallyAgent:
    """Resolves the agent from its key, then pins the database session to the agent's firm."""
    if not x_agent_key or len(x_agent_key) > 200 or not x_agent_key.startswith(KEY_PREFIX):
        raise HTTPException(status_code=401, detail="Agent key required.")
    with system_scope(db):  # the key is looked up before any tenant is known
        agent = db.execute(select(TallyAgent).where(TallyAgent.key_hash == _hash_key(x_agent_key))).scalar_one_or_none()
    if agent is None or agent.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Agent key is not valid. Ask your firm administrator for a new one.")
    set_tenant(db, agent.tenant_id)
    return agent


Agent = Annotated[TallyAgent, Depends(get_agent)]


def _audit(db: Session, tenant_id, actor_id: str, actor_role: str, action: str, entity_id: str, payload: Dict[str, Any]) -> None:
    append_audit_block(
        db=db, firm_id=tenant_id, actor_id=actor_id, actor_role=actor_role, action=action,
        entity_type="TALLY_AGENT", entity_id=entity_id, payload=payload, commit=False,
    )


# --------------------------------------------------------------------------------------------------
# Firm staff: keys and company links
# --------------------------------------------------------------------------------------------------
class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


def _agent_public(a: TallyAgent) -> Dict[str, Any]:
    return {
        "id": str(a.id), "name": a.name, "key_prefix": a.key_prefix,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "last_seen_at": a.last_seen_at.isoformat() if a.last_seen_at else None,
        "agent_version": a.agent_version, "revoked": a.revoked_at is not None,
    }


@router.post("/agents")
def create_agent(body: AgentCreate, user: Manager, db: Session = Depends(get_db)):
    """Issues an agent key. The key is shown once; only its hash is stored."""
    key = KEY_PREFIX + secrets.token_urlsafe(32)
    agent = TallyAgent(
        tenant_id=user.tenant_id, name=body.name.strip(), key_prefix=key[:12], key_hash=_hash_key(key),
        created_by=str(user.id),
    )
    db.add(agent)
    db.flush()
    _audit(db, user.tenant_id, str(user.id), user.role, "TALLY_AGENT_KEY_ISSUED", str(agent.id), {"name": agent.name})
    db.commit()
    return {**_agent_public(agent), "key": key,
            "note": "Copy this key now. It is not shown again; revoke it and issue a new one if it is lost."}


@router.get("/agents")
def list_agents(user: Manager, db: Session = Depends(get_db)):
    rows = db.execute(
        select(TallyAgent).where(TallyAgent.tenant_id == user.tenant_id).order_by(TallyAgent.created_at.desc())
    ).scalars().all()
    return [_agent_public(a) for a in rows]


@router.delete("/agents/{agent_id}")
def revoke_agent(agent_id: str, user: Manager, db: Session = Depends(get_db)):
    agent = _owned_agent(db, user, agent_id)
    if agent.revoked_at is None:
        agent.revoked_at = datetime.utcnow()
        _audit(db, user.tenant_id, str(user.id), user.role, "TALLY_AGENT_KEY_REVOKED", str(agent.id), {"name": agent.name})
        db.commit()
    return _agent_public(agent)


def _uuid(value: str, what: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=422, detail=f"{what} must be a UUID.")


def _owned_agent(db: Session, user: User, agent_id: str) -> TallyAgent:
    agent = db.execute(
        select(TallyAgent).where(TallyAgent.id == _uuid(agent_id, "agent id"), TallyAgent.tenant_id == user.tenant_id)
    ).scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found.")
    return agent


def _company_public(c: TallyCompany, agent_name: str = "") -> Dict[str, Any]:
    return {
        "id": str(c.id), "company_name": c.company_name, "agent_id": str(c.agent_id), "agent_name": agent_name,
        "client_id": str(c.client_id) if c.client_id else None, "linked": c.client_id is not None,
        "last_synced_at": c.last_synced_at.isoformat() if c.last_synced_at else None,
        "last_period_from": c.last_period_from, "last_period_to": c.last_period_to,
        "last_voucher_count": c.last_voucher_count, "last_error": c.last_error,
    }


@router.get("/companies")
def list_companies(user: Manager, db: Session = Depends(get_db)):
    rows = db.execute(
        select(TallyCompany, TallyAgent.name).join(TallyAgent, TallyAgent.id == TallyCompany.agent_id)
        .where(TallyCompany.tenant_id == user.tenant_id).order_by(TallyCompany.company_name)
    ).all()
    return [_company_public(c, name) for c, name in rows]


class LinkBody(BaseModel):
    client_id: Optional[str] = None  # null unlinks


@router.put("/companies/{company_id}/link")
def link_company(company_id: str, body: LinkBody, user: Manager, db: Session = Depends(get_db)):
    company = db.execute(
        select(TallyCompany).where(TallyCompany.id == _uuid(company_id, "company id"), TallyCompany.tenant_id == user.tenant_id)
    ).scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Tally company not found.")
    if body.client_id is None:
        company.client_id = None
    else:
        cid = _uuid(body.client_id, "client_id")
        client = db.execute(
            select(Client).where(Client.id == cid, Client.tenant_id == user.tenant_id, Client.is_deleted.is_(False))
        ).scalar_one_or_none()
        if client is None:
            raise HTTPException(status_code=404, detail="Client not found.")
        other = db.execute(
            select(TallyCompany).where(TallyCompany.tenant_id == user.tenant_id, TallyCompany.client_id == cid,
                                       TallyCompany.id != company.id)
        ).scalars().first()
        if other is not None:
            # Two companies writing one client's register would soft-delete each other's vouchers.
            raise HTTPException(status_code=409, detail=f"That client is already linked to Tally company '{other.company_name}'.")
        company.client_id = cid
    company.last_error = None
    _audit(db, user.tenant_id, str(user.id), user.role, "TALLY_COMPANY_LINKED", str(company.id),
           {"company": company.company_name, "client_id": body.client_id})
    db.commit()
    return _company_public(company)


# --------------------------------------------------------------------------------------------------
# Agent: heartbeat and ingest
# --------------------------------------------------------------------------------------------------
class Heartbeat(BaseModel):
    agent_version: str = Field("", max_length=32)
    companies: List[str] = Field(default_factory=list, max_length=500)


def _get_or_create_company(db: Session, agent: TallyAgent, name: str) -> TallyCompany:
    company = db.execute(
        select(TallyCompany).where(TallyCompany.tenant_id == agent.tenant_id, TallyCompany.agent_id == agent.id,
                                   TallyCompany.company_name == name)
    ).scalar_one_or_none()
    if company is None:
        company = TallyCompany(tenant_id=agent.tenant_id, agent_id=agent.id, company_name=name)
        db.add(company)
        db.flush()
    return company


@router.post("/heartbeat")
def heartbeat(body: Heartbeat, agent: Agent, db: Session = Depends(get_db)):
    """Tells the firm the agent is alive and which Tally companies are open, and tells the agent which are linked."""
    agent.last_seen_at = datetime.utcnow()
    if body.agent_version:
        agent.agent_version = body.agent_version[:32]
    out = []
    for name in dict.fromkeys(n.strip() for n in body.companies if n and n.strip()):
        if len(name) > 250:
            continue
        company = _get_or_create_company(db, agent, name)
        out.append({"company_name": name, "linked": company.client_id is not None})
    db.commit()
    return {"ok": True, "companies": out}


class IngestBody(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=250)
    period_from: date
    period_to: date
    xml: str = Field(..., min_length=1)
    allow_empty: bool = False  # an empty snapshot may only remove vouchers when the sender says so explicitly


def _inflate(raw: bytes, encoding: str) -> bytes:
    if "gzip" not in encoding.lower():
        if len(raw) > MAX_XML_BYTES:
            raise HTTPException(status_code=413, detail="Upload is too large.")
        return raw
    d = zlib.decompressobj(16 + zlib.MAX_WBITS)
    try:
        out = d.decompress(raw, MAX_XML_BYTES + 1)
    except zlib.error:
        raise HTTPException(status_code=400, detail="Upload is not valid gzip.")
    if len(out) > MAX_XML_BYTES or d.unconsumed_tail:
        raise HTTPException(status_code=413, detail="Upload is too large after decompression. Send a shorter period.")
    return out


@router.post("/ingest")
async def ingest(request: Request, agent: Agent, db: Session = Depends(get_db)):
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_COMPRESSED_BYTES:
        raise HTTPException(status_code=413, detail="Upload is too large.")
    raw = await request.body()
    if len(raw) > MAX_COMPRESSED_BYTES:
        raise HTTPException(status_code=413, detail="Upload is too large.")
    data = _inflate(raw, request.headers.get("content-encoding", ""))
    try:
        body = IngestBody(**json.loads(data))
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid upload: {str(e)[:300]}")
    if body.period_from > body.period_to:
        raise HTTPException(status_code=422, detail="period_from is after period_to.")
    return await run_in_threadpool(_ingest, db, agent, body, hashlib.sha256(data).hexdigest())


def _in_period(iso: Optional[str], start: str, end: str) -> bool:
    return bool(iso) and start <= iso <= end


def _fail(db: Session, company: TallyCompany, status: int, message: str, code: str):
    company.last_error = message[:500]
    db.commit()
    raise HTTPException(status_code=status, detail={"code": code, "message": message})


def _ingest(db: Session, agent: TallyAgent, body: IngestBody, payload_hash: str) -> Dict[str, Any]:
    agent.last_seen_at = datetime.utcnow()
    company = _get_or_create_company(db, agent, body.company_name.strip())
    if company.client_id is None:
        _fail(db, company, 409, f"Tally company '{company.company_name}' is not linked to a client yet. "
                                "A manager must link it in Firm OS.", "COMPANY_NOT_LINKED")
    client = db.execute(
        select(Client).where(Client.id == company.client_id, Client.tenant_id == agent.tenant_id, Client.is_deleted.is_(False))
    ).scalar_one_or_none()
    if client is None:
        _fail(db, company, 409, "The client linked to this Tally company no longer exists. Link it again.", "COMPANY_NOT_LINKED")

    try:
        parsed = parse_purchase_vouchers(body.xml)
    except ValueError as e:
        _fail(db, company, 422, f"Tally data could not be read: {str(e)[:300]}", "UNREADABLE_TALLY_XML")

    start, end = body.period_from.isoformat(), body.period_to.isoformat()
    vouchers = [v for v in parsed["vouchers"] if _in_period(v["voucher_date"], start, end)]
    outside = len(parsed["vouchers"]) - len(vouchers)

    existing_rows = db.execute(
        select(Invoice).where(Invoice.tenant_id == agent.tenant_id, Invoice.client_id == client.id,
                              Invoice.external_ref.is_not(None))
    ).scalars().all()
    existing = {r.external_ref: r for r in existing_rows}
    incoming = {v["external_ref"] for v in vouchers}
    to_remove = [
        r for r in existing_rows
        if not r.is_deleted and r.source == InvoiceSource.ERP_SYNC and r.external_ref not in incoming
        and _in_period((r.metadata_ or {}).get("voucher_date"), start, end)
    ]
    if not vouchers and to_remove and not body.allow_empty:
        # Tally returned nothing (wrong company open, filter fault, error page): do not wipe the register.
        _fail(db, company, 409,
              f"Tally sent no vouchers for {start} to {end}, but {len(to_remove)} are already stored. "
              "Nothing was removed. Check the right company is open in Tally.", "EMPTY_SNAPSHOT_WOULD_DELETE")

    created = updated = restored = 0
    now = datetime.utcnow()
    for v in vouchers:
        fields = dict(
            invoice_number=v["invoice_number"], invoice_date=v["invoice_date"],
            supplier_gstin=v["supplier_gstin"] or None, supplier_name=v["supplier_name"] or None,
            taxable_value=v["taxable_value"], cgst=v["cgst"], sgst=v["sgst"], igst=v["igst"], cess=v["cess"],
            total_value=v["total_value"], hsn_code=v["hsn_code"] or None,
            metadata_={
                "goods_description": v["description"], "voucher_date": v["voucher_date"],
                "voucher_number": v["voucher_number"], "voucher_type": v["voucher_type"],
                "is_debit_note": v["is_debit_note"], "tally_company": company.company_name,
            },
        )
        row = existing.get(v["external_ref"])
        if row is None:
            db.add(Invoice(
                tenant_id=agent.tenant_id, client_id=client.id, gstin=client.gstin or "",
                direction=InvoiceDirection.INWARD, source=InvoiceSource.ERP_SYNC, status=InvoiceStatus.EXTRACTED,
                external_ref=v["external_ref"], **fields,
            ))
            created += 1
        else:
            if row.is_deleted:
                row.is_deleted, row.deleted_at = False, None
                restored += 1
            else:
                updated += 1
            for k, val in fields.items():
                setattr(row, k, val)
    for r in to_remove:
        r.is_deleted, r.deleted_at = True, now

    company.last_synced_at = now
    company.last_period_from, company.last_period_to = start, end
    company.last_voucher_count = len(vouchers)
    company.last_error = None
    result = {
        "company": company.company_name, "client_id": str(client.id), "period_from": start, "period_to": end,
        "vouchers": len(vouchers), "created": created, "updated": updated, "restored": restored,
        "removed": len(to_remove), "outside_period": outside, "stats": parsed["stats"],
        "warnings": parsed["warnings"][:MAX_WARNINGS_RETURNED], "warnings_total": len(parsed["warnings"]),
    }
    _audit(db, agent.tenant_id, str(agent.id), "SYSTEM", "TALLY_PURCHASE_REGISTER_SYNCED", str(company.id), {
        "payload_sha256": payload_hash, "company": company.company_name, "client_id": str(client.id),
        "period": [start, end], "vouchers": len(vouchers), "created": created, "updated": updated,
        "restored": restored, "removed": len(to_remove),
    })
    db.commit()
    return result
