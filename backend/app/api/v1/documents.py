from fastapi import APIRouter, UploadFile, File, Form
from typing import Optional
import uuid
from datetime import datetime
from ...deterministic_core.ocr_engine import extract_text_and_fields

router = APIRouter(prefix="/documents", tags=["documents"])

IN_MEMORY_DOCS = [
    {
        "id": "DOC-1001",
        "file_name": "Reliance_Polymers_INV_8821.pdf",
        "client": "Rajesh Textiles Pvt Ltd",
        "doc_type": "TAX_INVOICE",
        "invoice_number": "RPL/26-27/08821",
        "invoice_date": "2026-10-04",
        "supplier_gstin": "27AAACR5055K1Z8",
        "supplier_name": "Reliance Polymers Ltd",
        "pan": "AAACR5055K",
        "taxable_value": 450000.00,
        "igst": 0.00,
        "cgst": 40500.00,
        "sgst": 40500.00,
        "total_value": 531000.00,
        "extraction_confidence": 0.99,
        "status": "MATCHED_2B",
        "engine": "digital_pdf_parser",
        "source": "EMAIL_PDF"
    },
    {
        "id": "DOC-1002",
        "file_name": "WhatsApp_Image_2026-10-08_Bill.jpg",
        "client": "Rajesh Textiles Pvt Ltd",
        "doc_type": "TAX_INVOICE",
        "invoice_number": "SHV-2026-412",
        "invoice_date": "2026-10-05",
        "supplier_gstin": "24AABCS9821E1Z1",
        "supplier_name": "Shree Ganesh Dyeing Works",
        "pan": "AABCS9821E",
        "taxable_value": 150000.00,
        "igst": 27000.00,
        "cgst": 0.00,
        "sgst": 0.00,
        "total_value": 177000.00,
        "extraction_confidence": 0.86,
        "status": "NEEDS_REVIEW",
        "engine": "neural_ocr",
        "source": "WABA_PHOTO"
    }
]

@router.post("/upload")
async def upload_document(
    client_id: Optional[str] = Form(default="c1"),
    file: UploadFile = File(...)
):
    contents = await file.read()
    filename = file.filename or "uploaded_doc.pdf"
    
    # Run the live OCR & extraction engine
    parsed = extract_text_and_fields(contents, filename)
    
    doc_id = f"DOC-{str(uuid.uuid4())[:6].upper()}"
    status = "VERIFIED" if parsed["confidence"] >= 0.95 else "NEEDS_REVIEW"
    
    new_doc = {
        "id": doc_id,
        "file_name": filename,
        "client": client_id,
        "doc_type": parsed["doc_type"],
        "invoice_number": parsed["invoice_number"],
        "invoice_date": parsed["invoice_date"],
        "supplier_gstin": parsed["primary_gstin"],
        "supplier_name": filename.rsplit(".", 1)[0].replace("_", " ").title(),
        "pan": parsed["primary_pan"],
        "taxable_value": parsed["taxable_value"],
        "igst": parsed["igst"],
        "cgst": 0.00,
        "sgst": 0.00,
        "total_value": parsed["total_value"],
        "extraction_confidence": parsed["confidence"],
        "status": status,
        "engine": parsed["engine"],
        "raw_text_snippet": parsed["raw_text_snippet"],
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
