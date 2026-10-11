from fastapi import APIRouter, UploadFile, File, Form
from typing import Optional
import uuid
from datetime import datetime

router = APIRouter(prefix="/documents", tags=["documents"])

IN_MEMORY_DOCS = [
    {
        "id": "DOC-1001",
        "file_name": "Reliance_Polymers_INV_8821.pdf",
        "client": "Rajesh Textiles Pvt Ltd",
        "invoice_number": "RPL/26-27/08821",
        "invoice_date": "2026-10-04",
        "supplier_gstin": "27AAACR5055K1Z8",
        "supplier_name": "Reliance Polymers Ltd",
        "taxable_value": 450000.00,
        "igst": 0.00,
        "cgst": 40500.00,
        "sgst": 40500.00,
        "total_value": 531000.00,
        "extraction_confidence": 0.99,
        "status": "MATCHED_2B",
        "source": "EMAIL_PDF"
    },
    {
        "id": "DOC-1002",
        "file_name": "WhatsApp_Image_2026-10-08_Bill.jpg",
        "client": "Rajesh Textiles Pvt Ltd",
        "invoice_number": "SHV-2026-412",
        "invoice_date": "2026-10-05",
        "supplier_gstin": "24AABCS9821E1Z1",
        "supplier_name": "Shree Ganesh Dyeing Works",
        "taxable_value": 150000.00,
        "igst": 27000.00,
        "cgst": 0.00,
        "sgst": 0.00,
        "total_value": 177000.00,
        "extraction_confidence": 0.86,
        "status": "NEEDS_REVIEW",
        "source": "WABA_PHOTO"
    }
]

@router.post("/upload")
async def upload_document(
    client_id: Optional[str] = Form(default="c1"),
    file: UploadFile = File(...)
):
    doc_id = f"DOC-{str(uuid.uuid4())[:6].upper()}"
    new_doc = {
        "id": doc_id,
        "file_name": file.filename,
        "client": client_id,
        "invoice_number": f"INV/26-27/{str(uuid.uuid4())[:4].upper()}",
        "invoice_date": datetime.utcnow().strftime("%Y-%m-%d"),
        "supplier_gstin": "27AAACR5055K1Z8",
        "supplier_name": file.filename.rsplit(".", 1)[0].replace("_", " "),
        "taxable_value": 125000.00,
        "igst": 22500.00,
        "cgst": 0.00,
        "sgst": 0.00,
        "total_value": 147500.00,
        "extraction_confidence": 0.97,
        "status": "EXTRACTED",
        "source": "PORTAL_UPLOAD"
    }
    IN_MEMORY_DOCS.insert(0, new_doc)
    return new_doc

@router.get("/")
async def list_documents(client_id: Optional[str] = None):
    return IN_MEMORY_DOCS

@router.get("/{doc_id}")
async def get_document(doc_id: str):
    for d in IN_MEMORY_DOCS:
        if d["id"] == doc_id:
            return d
    return IN_MEMORY_DOCS[0]

@router.post("/{doc_id}/verify")
async def verify_document(doc_id: str):
    for d in IN_MEMORY_DOCS:
        if d["id"] == doc_id:
            d["status"] = "VERIFIED"
            d["extraction_confidence"] = 1.0
            return {"status": "verified", "document": d}
    return {"status": "verified", "doc_id": doc_id}
