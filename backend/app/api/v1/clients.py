import os
import re
import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated, Dict, Any, List, Optional
from dataclasses import asdict
from fastapi import APIRouter, UploadFile, File, Response, HTTPException, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...deterministic_core.audit_chain import append_audit_block
from ...deterministic_core.bulk_import import BulkClientImporter
from ...deterministic_core.task_generator import ProfileTaskGenerator
from ...models.clients import Client, ClientType, ClientStatus, ERPType, RiskTier
from ...models.tenant import User as UserModel
from ..deps import User, require_role

router = APIRouter(prefix="/clients", tags=["clients"])

Viewer = Annotated[User, Depends(require_role("ARTICLE_TRAINEE"))]
Manager = Annotated[User, Depends(require_role("MANAGER"))]

PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")

_TYPE_TO_ENUM = {
    "private limited": ClientType.COMPANY, "public limited": ClientType.COMPANY, "company": ClientType.COMPANY,
    "llp": ClientType.LLP, "partnership": ClientType.PARTNERSHIP, "individual": ClientType.INDIVIDUAL,
    "proprietorship": ClientType.INDIVIDUAL, "huf": ClientType.HUF, "trust": ClientType.TRUST,
}
_ENUM_LABEL = {
    ClientType.COMPANY: "Private Limited", ClientType.LLP: "LLP", ClientType.PARTNERSHIP: "Partnership",
    ClientType.INDIVIDUAL: "Individual", ClientType.HUF: "HUF", ClientType.TRUST: "Trust",
}


def _fy_bounds(today: Optional[date] = None) -> tuple:
    today = today or date.today()
    start_year = today.year if today.month >= 4 else today.year - 1
    return f"{start_year}-04-01", f"{start_year + 1}-03-31"


def _partner_names(db: Session, tenant_id: uuid.UUID) -> Dict[uuid.UUID, str]:
    rows = db.execute(select(UserModel.id, UserModel.full_name).where(UserModel.firm_id == tenant_id)).all()
    return {r[0]: r[1] for r in rows}


def _to_dict(c: Client, partners: Dict[uuid.UUID, str]) -> Dict[str, Any]:
    meta = c.metadata_ or {}
    return {
        "id": str(c.id),
        "name": c.client_name,
        "pan": c.pan,
        "gstin": c.gstin or "",
        "type": meta.get("entity_label") or _ENUM_LABEL.get(c.client_type, c.client_type.value.title()),
        "risk_tier": c.risk_tier.value.title(),
        "turnover": float(c.annual_turnover or 0),
        "is_composition": bool(c.is_composition),
        "assigned_partner": partners.get(c.assigned_partner_id) if c.assigned_partner_id else meta.get("assigned_partner_name"),
        "assigned_partner_id": str(c.assigned_partner_id) if c.assigned_partner_id else None,
        "email": meta.get("email"),
        "emergency_bypass_active": bool(c.emergency_bypass_active),
        "status": c.status.value,
    }


def _get_client(db: Session, client_id: str, tenant_id: uuid.UUID) -> Client:
    try:
        cid = uuid.UUID(client_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Client not found.")
    c = db.execute(
        select(Client).where(Client.id == cid, Client.tenant_id == tenant_id, Client.is_deleted.is_(False))
    ).scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=404, detail="Client not found.")
    return c


class ClientIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    pan: str
    gstin: Optional[str] = None
    type: str = "Private Limited"
    turnover: float = Field(default=0, ge=0, le=1e13)
    is_composition: bool = False
    email: Optional[str] = Field(default=None, max_length=150)
    assigned_partner_id: Optional[uuid.UUID] = None

    @field_validator("pan")
    @classmethod
    def _pan(cls, v: str) -> str:
        v = v.strip().upper()
        if not PAN_RE.match(v):
            raise ValueError("PAN must match AAAAA9999A.")
        return v

    @field_validator("gstin")
    @classmethod
    def _gstin(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        v = v.strip().upper()
        if not GSTIN_RE.match(v):
            raise ValueError("GSTIN format is invalid.")
        return v

    @field_validator("type")
    @classmethod
    def _type(cls, v: str) -> str:
        if v.strip().lower() not in _TYPE_TO_ENUM:
            raise ValueError(f"type must be one of {sorted(_TYPE_TO_ENUM)}.")
        return v.strip()


def _apply(c: Client, body: ClientIn, db: Session, tenant_id: uuid.UUID) -> None:
    if body.gstin and body.gstin[2:12] != body.pan:
        raise HTTPException(status_code=422, detail="GSTIN characters 3-12 must equal the PAN.")
    if body.assigned_partner_id is not None:
        ok = db.execute(
            select(UserModel.id).where(UserModel.id == body.assigned_partner_id, UserModel.firm_id == tenant_id)
        ).first()
        if ok is None:
            raise HTTPException(status_code=422, detail="assigned_partner_id is not a user of this firm.")
    meta = dict(c.metadata_ or {})
    meta["entity_label"] = body.type
    if body.email:
        meta["email"] = body.email
    c.metadata_ = meta
    c.client_name = body.name.strip()
    c.pan = body.pan
    c.gstin = body.gstin
    c.client_type = _TYPE_TO_ENUM[body.type.lower()]
    c.annual_turnover = Decimal(str(body.turnover))
    c.is_composition = body.is_composition
    c.assigned_partner_id = body.assigned_partner_id


# Derived-task cache (statutory tasks are a pure function of the client profile, so this is
# a cache — never a source of truth — and is rebuilt on demand from the database).
IN_MEMORY_TASKS: Dict[str, List[Dict[str, Any]]] = {}


def _tasks_for(c: Client, partners: Dict[uuid.UUID, str]) -> List[Dict[str, Any]]:
    d = _to_dict(c, partners)
    tasks = [asdict(t) for t in ProfileTaskGenerator.generate_tasks_for_client(_task_profile(d))]
    IN_MEMORY_TASKS[d["id"]] = tasks
    return tasks


def _task_profile(d: Dict[str, Any]) -> Dict[str, Any]:
    return {**d, "assignedPartner": d.get("assigned_partner") or "CA Amit Sharma"}


@router.get("/")
def list_clients(user: Viewer, db: Session = Depends(get_db)):
    partners = _partner_names(db, user.tenant_id)
    rows = db.execute(
        select(Client).where(Client.tenant_id == user.tenant_id, Client.is_deleted.is_(False)).order_by(Client.client_name)
    ).scalars().all()
    out = []
    for c in rows:
        d = _to_dict(c, partners)
        d["tasks_count"] = len(_tasks_for(c, partners))
        out.append(d)
    return out


@router.get("/import/template")
async def download_import_template(user: Viewer):
    """Generates and downloads the official CA Firm OS client import Excel spreadsheet template."""
    content = BulkClientImporter.generate_excel_template()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=CA_Firm_OS_Client_Import_Template.xlsx"}
    )

MAX_CLIENTS_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_CLIENTS_EXTENSIONS = {".xlsx", ".xls", ".csv"}

@router.post("/import-excel")
async def import_clients_excel(user: Manager, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Parses and bulk onboards clients from an Excel (.xlsx, .xls) or CSV file.
    Enforces strict file extension and 10MB file size limits to prevent DoS.
    Validates PAN and GSTIN syntax; existing live clients (same PAN + GSTIN) are updated,
    new ones are created, all inside the caller's tenant.
    """
    filename = file.filename or "clients.xlsx"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_CLIENTS_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{ext}'. Only Excel (.xlsx, .xls) and CSV (.csv) files are permitted for client onboarding."
        )

    contents = await file.read()
    if len(contents) > MAX_CLIENTS_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum upload size limit of {MAX_CLIENTS_FILE_SIZE // (1024 * 1024)} MB."
        )

    result = BulkClientImporter.parse_file(contents, filename)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to parse file."))

    fy_start, fy_end = _fy_bounds()
    partners = _partner_names(db, user.tenant_id)
    saved: List[Dict[str, Any]] = []
    errors = list(result.get("errors", []))
    for row in result.get("clients", []):
        try:
            body = ClientIn(
                name=row["name"], pan=row["pan"], gstin=row.get("gstin") or None, type=row.get("type") or "Private Limited",
                turnover=float(row.get("turnover") or 0), is_composition=bool(row.get("is_composition", False)),
            )
        except ValueError as exc:
            errors.append({"client_name": row.get("name", "Unknown"), "issues": [str(exc)]})
            continue
        existing = db.execute(
            select(Client).where(
                Client.tenant_id == user.tenant_id, Client.is_deleted.is_(False), Client.pan == body.pan,
                Client.gstin.is_(None) if body.gstin is None else Client.gstin == body.gstin,
            )
        ).scalars().first()
        client = existing or Client(
            tenant_id=user.tenant_id, status=ClientStatus.ACTIVE, erp_type=ERPType.MANUAL, risk_tier=RiskTier.LOW,
            financial_year_start=fy_start, financial_year_end=fy_end,
        )
        try:
            _apply(client, body, db, user.tenant_id)
        except HTTPException as exc:
            errors.append({"client_name": body.name, "issues": [exc.detail]})
            continue
        if existing is None:
            db.add(client)
        db.flush()
        saved.append(_to_dict(client, partners))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Import conflicts with an existing client GSTIN.")
    append_audit_block(
        db, user.tenant_id, str(user.id), user.role, "CLIENTS_IMPORTED", "CLIENT_BATCH", filename,
        {"imported": len(saved), "failed": len(errors)},
    )
    tasks_total = 0
    for d in saved:
        c = _get_client(db, d["id"], user.tenant_id)
        tasks_total += len(_tasks_for(c, partners))
    return {
        "status": "SUCCESS",
        "filename": filename,
        "total_rows_scanned": result.get("total_rows_scanned", 0),
        "imported_count": len(saved),
        "failed_count": len(errors),
        "tasks_instantiated": tasks_total,
        "errors": errors,
        "clients": saved,
    }

@router.post("/generate-tasks-all")
def generate_tasks_all_clients(user: Manager, db: Session = Depends(get_db)):
    """Regenerates statutory compliance tasks for every live client of this firm."""
    partners = _partner_names(db, user.tenant_id)
    rows = db.execute(
        select(Client).where(Client.tenant_id == user.tenant_id, Client.is_deleted.is_(False))
    ).scalars().all()
    total = sum(len(_tasks_for(c, partners)) for c in rows)
    return {"status": "TASKS_GENERATED_SUCCESSFULLY", "clients_processed": len(rows), "total_tasks_instantiated": total}


@router.get("/tasks/all")
def get_all_practice_tasks(user: Viewer, db: Session = Depends(get_db)):
    """All statutory compliance tasks across this firm's clients."""
    partners = _partner_names(db, user.tenant_id)
    rows = db.execute(
        select(Client).where(Client.tenant_id == user.tenant_id, Client.is_deleted.is_(False))
    ).scalars().all()
    all_tasks: List[Dict[str, Any]] = []
    for c in rows:
        all_tasks.extend(_tasks_for(c, partners))
    return {"total_tasks": len(all_tasks), "tasks": all_tasks}


@router.post("/", status_code=201)
def create_client(body: ClientIn, user: Manager, db: Session = Depends(get_db)):
    fy_start, fy_end = _fy_bounds()
    c = Client(
        tenant_id=user.tenant_id, status=ClientStatus.ACTIVE, erp_type=ERPType.MANUAL, risk_tier=RiskTier.LOW,
        financial_year_start=fy_start, financial_year_end=fy_end,
    )
    _apply(c, body, db, user.tenant_id)
    db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A client with this GSTIN already exists in your firm.")
    db.refresh(c)
    append_audit_block(
        db, user.tenant_id, str(user.id), user.role, "CLIENT_CREATED", "CLIENT", str(c.id), {"pan": c.pan},
    )
    partners = _partner_names(db, user.tenant_id)
    d = _to_dict(c, partners)
    d["tasks_count"] = len(_tasks_for(c, partners))
    return d


@router.get("/{client_id}")
def get_client(client_id: str, user: Viewer, db: Session = Depends(get_db)):
    return _to_dict(_get_client(db, client_id, user.tenant_id), _partner_names(db, user.tenant_id))


@router.put("/{client_id}")
def update_client(client_id: str, body: ClientIn, user: Manager, db: Session = Depends(get_db)):
    c = _get_client(db, client_id, user.tenant_id)
    _apply(c, body, db, user.tenant_id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A client with this GSTIN already exists in your firm.")
    append_audit_block(
        db, user.tenant_id, str(user.id), user.role, "CLIENT_UPDATED", "CLIENT", str(c.id), {"pan": c.pan},
    )
    partners = _partner_names(db, user.tenant_id)
    d = _to_dict(c, partners)
    d["tasks_count"] = len(_tasks_for(c, partners))
    return d


@router.delete("/{client_id}", status_code=204)
def delete_client(client_id: str, user: Annotated[User, Depends(require_role("PARTNER"))], db: Session = Depends(get_db)):
    """Soft delete: statutory records must remain recoverable for the retention period."""
    from datetime import datetime, timezone
    c = _get_client(db, client_id, user.tenant_id)
    c.is_deleted = True
    c.deleted_at = datetime.now(timezone.utc)
    db.commit()
    append_audit_block(
        db, user.tenant_id, str(user.id), user.role, "CLIENT_DELETED", "CLIENT", str(c.id), {"pan": c.pan},
    )


@router.post("/{client_id}/generate-tasks")
def generate_client_tasks(client_id: str, user: Manager, db: Session = Depends(get_db)):
    c = _get_client(db, client_id, user.tenant_id)
    tasks = _tasks_for(c, _partner_names(db, user.tenant_id))
    return {"status": "TASKS_GENERATED", "client_id": client_id, "client_name": c.client_name, "tasks_count": len(tasks), "tasks": tasks}


@router.get("/{client_id}/tasks")
def get_client_tasks(client_id: str, user: Viewer, db: Session = Depends(get_db)):
    c = _get_client(db, client_id, user.tenant_id)
    tasks = _tasks_for(c, _partner_names(db, user.tenant_id))
    return {"client_id": client_id, "tasks_count": len(tasks), "tasks": tasks}


@router.get("/{client_id}/invoices")
def get_client_invoices(client_id: str, user: Viewer, db: Session = Depends(get_db)):
    from ...models.invoices import Invoice
    c = _get_client(db, client_id, user.tenant_id)
    rows = db.execute(
        select(Invoice).where(Invoice.tenant_id == user.tenant_id, Invoice.client_id == c.id, Invoice.is_deleted.is_(False))
        .order_by(Invoice.invoice_date.desc()).limit(500)
    ).scalars().all()
    return [
        {"id": str(i.id), "client_id": client_id, "invoice_number": i.invoice_number, "invoice_date": i.invoice_date,
         "supplier_name": i.supplier_name, "total_value": float(i.total_value or 0), "status": i.status.value}
        for i in rows
    ]


@router.get("/{client_id}/returns")
def get_client_returns(client_id: str, user: Viewer, db: Session = Depends(get_db)):
    from ...models.returns import GSTReturn
    c = _get_client(db, client_id, user.tenant_id)
    rows = db.execute(
        select(GSTReturn).where(GSTReturn.tenant_id == user.tenant_id, GSTReturn.client_id == c.id, GSTReturn.is_deleted.is_(False))
        .order_by(GSTReturn.period.desc())
    ).scalars().all()
    return [
        {"id": str(r.id), "client_id": client_id, "return_type": r.return_type.value, "period": r.period, "status": r.status.value}
        for r in rows
    ]


@router.get("/{client_id}/obligations")
def get_client_obligations(client_id: str, user: Viewer, db: Session = Depends(get_db)):
    return _tasks_for(_get_client(db, client_id, user.tenant_id), _partner_names(db, user.tenant_id))
