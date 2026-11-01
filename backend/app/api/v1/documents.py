"""Document intake: OCR extraction persisted as tenant-scoped Invoice rows."""
import hashlib
import os
import re
import uuid
from decimal import Decimal
from typing import Annotated, Any, Dict, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...deterministic_core.audit_chain import append_audit_block
from ...deterministic_core.ocr_engine import extract_text_and_fields
from ...models.clients import Client
from ...models.invoices import Invoice, InvoiceDirection, InvoiceSource, InvoiceStatus
from ..deps import User, require_role

router = APIRouter(prefix="/documents", tags=["documents"])

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 Megabytes
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp"}
VERIFY_THRESHOLD = 0.95

Viewer = Annotated[User, Depends(require_role("ARTICLE_TRAINEE"))]


def _public(inv: Invoice, client_name: Optional[str]) -> Dict[str, Any]:
    meta = inv.metadata_ or {}
    confidence = float(inv.extraction_confidence) if inv.extraction_confidence is not None else None
    needs_review = inv.status == InvoiceStatus.EXTRACTED and (confidence is None or confidence < VERIFY_THRESHOLD)
    return {
        "id": str(inv.id),
        "file_name": meta.get("file_name", inv.invoice_number),
        "client_id": str(inv.client_id),
        "client": client_name or "Unknown client",
        "uploaded_at": inv.created_at.isoformat() if inv.created_at else None,
        "invoice_number": inv.invoice_number,
        "invoice_date": inv.invoice_date,
        "supplier_gstin": inv.supplier_gstin,
        "supplier_name": inv.supplier_name,
        "taxable_value": float(inv.taxable_value or 0),
        "igst": float(inv.igst or 0),
        "cgst": float(inv.cgst or 0),
        "sgst": float(inv.sgst or 0),
        "total_value": float(inv.total_value or 0),
        "extraction_confidence": confidence,
        "status": "NEEDS_REVIEW" if needs_review else ("MATCHED_2B" if inv.matched_2b else inv.status.value),
        "source": inv.source.value,
        "engine": meta.get("engine"),
        "doc_type": meta.get("doc_type"),
    }


def _num(value: Any) -> Decimal:
    try:
        return Decimal(str(value or 0))
    except Exception:  # noqa: BLE001
        return Decimal(0)


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    user: Annotated[User, Depends(require_role("ARTICLE_TRAINEE"))],
    client_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # 1. Filename sanitization & path traversal mitigation
    raw_filename = file.filename or "uploaded_doc.pdf"
    safe_basename = os.path.basename(raw_filename)
    safe_filename = re.sub(r"[^a-zA-Z0-9_.\-]", "_", safe_basename)
    _, ext = os.path.splitext(safe_filename.lower())

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    try:
        cid = uuid.UUID(client_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="client_id must be a client UUID.")
    client = db.execute(
        select(Client).where(Client.id == cid, Client.tenant_id == user.tenant_id, Client.is_deleted.is_(False))
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found.")

    # 2. File size enforcement (DoS mitigation)
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size limit of 25 MB (Received {len(contents) / (1024*1024):.1f} MB)."
        )
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # 3. Run live OCR & extraction engine
    parsed = extract_text_and_fields(contents, safe_filename)
    confidence = float(parsed.get("confidence") or 0)

    doc_hash = hashlib.sha256(contents).hexdigest()
    duplicate = db.execute(
        select(Invoice.id).where(
            Invoice.tenant_id == user.tenant_id, Invoice.client_id == client.id,
            Invoice.document_hash == doc_hash, Invoice.is_deleted.is_(False),
        )
    ).first()
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="This exact document has already been uploaded for this client.")

    taxable, igst, total = _num(parsed.get("taxable_value")), _num(parsed.get("igst")), _num(parsed.get("total_value"))
    inv = Invoice(
        tenant_id=user.tenant_id,
        client_id=client.id,
        gstin=client.gstin or "",
        direction=InvoiceDirection.INWARD,
        invoice_number=str(parsed.get("invoice_number") or safe_filename)[:100],
        invoice_date=str(parsed.get("invoice_date") or ""),
        supplier_gstin=parsed.get("primary_gstin"),
        supplier_name=safe_filename.rsplit(".", 1)[0].replace("_", " ").title(),
        buyer_gstin=client.gstin,
        buyer_name=client.client_name,
        taxable_value=taxable, igst=igst, cgst=Decimal(0), sgst=Decimal(0), total_value=total,
        source=InvoiceSource.PORTAL_UPLOAD,
        extraction_confidence=confidence,
        document_hash=doc_hash,
        status=InvoiceStatus.VERIFIED if confidence >= VERIFY_THRESHOLD else InvoiceStatus.EXTRACTED,
        metadata_={
            "file_name": safe_filename, "engine": parsed.get("engine"), "doc_type": parsed.get("doc_type"),
            "pan": parsed.get("primary_pan"), "raw_text_snippet": (parsed.get("raw_text_snippet") or "")[:500],
            "uploaded_by": str(user.id),
        },
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    append_audit_block(
        db, user.tenant_id, str(user.id), user.role, "DOCUMENT_EXTRACTED", "INVOICE", str(inv.id),
        {"sha256": doc_hash, "confidence": confidence, "engine": parsed.get("engine")},
    )
    return _public(inv, client.client_name)


@router.get("/")
def list_documents(
    user: Viewer,
    client_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = (
        select(Invoice, Client.client_name)
        .join(Client, Client.id == Invoice.client_id, isouter=True)
        .where(Invoice.tenant_id == user.tenant_id, Invoice.is_deleted.is_(False))
    )
    if client_id:
        try:
            q = q.where(Invoice.client_id == uuid.UUID(client_id))
        except ValueError:
            raise HTTPException(status_code=422, detail="client_id must be a UUID.")
    rows = db.execute(q.order_by(Invoice.created_at.desc()).limit(200)).all()
    return [_public(inv, name) for inv, name in rows]


def _load(db: Session, doc_id: str, user: User) -> Invoice:
    try:
        did = uuid.UUID(doc_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Document not found.")
    inv = db.execute(
        select(Invoice).where(Invoice.id == did, Invoice.tenant_id == user.tenant_id, Invoice.is_deleted.is_(False))
    ).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return inv


@router.get("/{doc_id}")
def get_document(doc_id: str, user: Viewer, db: Session = Depends(get_db)):
    inv = _load(db, doc_id, user)
    client = db.get(Client, inv.client_id)
    return _public(inv, client.client_name if client else None)


@router.post("/{doc_id}/verify")
def verify_document(doc_id: str, user: Viewer, db: Session = Depends(get_db)):
    """Gate G2: a person confirms the extraction. Confidence is left as the engine reported it."""
    inv = _load(db, doc_id, user)
    if inv.status not in (InvoiceStatus.EXTRACTED, InvoiceStatus.DRAFT):
        raise HTTPException(status_code=409, detail=f"Document is already {inv.status.value}.")
    inv.status = InvoiceStatus.VERIFIED
    meta = dict(inv.metadata_ or {})
    meta["verified_by"] = str(user.id)
    inv.metadata_ = meta
    db.commit()
    append_audit_block(
        db, user.tenant_id, str(user.id), user.role, "DOCUMENT_VERIFIED", "INVOICE", str(inv.id), {"gate": "G2"},
    )
    client = db.get(Client, inv.client_id)
    return {"status": "verified", "document": _public(inv, client.client_name if client else None)}
