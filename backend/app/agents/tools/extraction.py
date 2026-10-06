from enum import Enum
import hashlib

class DocumentType(Enum):
    INVOICE = "invoice"
    BANK_STATEMENT = "bank_statement"
    CHALLAN = "challan"

def extract_fields(document_data: bytes, doc_type: str) -> dict:
    return {"invoice_number": {"value": "INV-001", "confidence": 0.98}}

def classify_document(document_data: bytes) -> DocumentType:
    return DocumentType.INVOICE

def compute_checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
