from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
import uuid
from typing import List

from ...models.invoices import Invoice, InvoiceStatus, InvoiceDirection, InvoiceSource
from ...models.audit_ledger import AuditLedger, ActionType
from ..deps import get_db, get_current_user, User

router = APIRouter(prefix="/documents", tags=["documents"])

@router.post("/upload")
async def upload_document(
    client_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Simulates quarantine pipeline and IN-1 agent extraction
    invoice = Invoice(
        tenant_id=current_user.tenant_id,
        client_id=client_id,
        gstin="GSTIN_DUMMY",
        direction=InvoiceDirection.INWARD,
        invoice_number="INV-SIM-" + str(uuid.uuid4())[:8],
        invoice_date="2026-10-06",
        source=InvoiceSource.PORTAL_UPLOAD,
        status=InvoiceStatus.EXTRACTED,
        extraction_confidence=0.92,
        total_value=1180.00,
        taxable_value=1000.00,
        igst=180.00
    )
    db.add(invoice)
    await db.flush()
    
    audit = AuditLedger(
        tenant_id=current_user.tenant_id,
        client_id=client_id,
        agent_id="IN-1",
        agent_version="1.0.0",
        action_type=ActionType.EXTRACTED,
        entity_type="invoice",
        entity_id=invoice.id,
        input_hash="dummy_hash",
        output_hash="dummy_hash",
        output_snapshot={"fields": "extracted"}
    )
    db.add(audit)
    await db.commit()
    await db.refresh(invoice)
    return {"id": invoice.id, "status": invoice.status, "extracted_data": invoice.total_value}

@router.get("/")
async def list_documents(client_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Invoice).where(Invoice.client_id == client_id))
    return result.scalars().all()

@router.get("/{doc_id}")
async def get_document(doc_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Invoice, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc

@router.post("/{doc_id}/verify")
async def verify_document(doc_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = await db.get(Invoice, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    doc.status = InvoiceStatus.VERIFIED
    
    audit = AuditLedger(
        tenant_id=current_user.tenant_id,
        client_id=doc.client_id,
        agent_id="HUMAN",
        agent_version="1.0",
        action_type=ActionType.APPROVED,
        entity_type="invoice",
        entity_id=doc.id,
        input_hash="",
        output_hash="",
        output_snapshot={},
        actor_id=current_user.id,
        actor_role=current_user.role
    )
    db.add(audit)
    await db.commit()
    return {"status": "verified"}
