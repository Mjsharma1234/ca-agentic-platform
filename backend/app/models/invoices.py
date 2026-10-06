import uuid
from decimal import Decimal
from sqlalchemy import Column, String, Boolean, Enum, Numeric, ForeignKey, Integer, Float
from sqlalchemy.dialects.postgresql import UUID, JSONB
import enum

from .base import BaseModel, SoftDeleteMixin

class InvoiceDirection(str, enum.Enum):
    INWARD = "INWARD"
    OUTWARD = "OUTWARD"

class InvoiceSource(str, enum.Enum):
    WABA_PHOTO = "WABA_PHOTO"
    EMAIL_PDF = "EMAIL_PDF"
    ERP_SYNC = "ERP_SYNC"
    PORTAL_UPLOAD = "PORTAL_UPLOAD"
    GSP_2B = "GSP_2B"
    GSP_IMS = "GSP_IMS"

class IMSStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    ON_HOLD = "ON_HOLD"

class InvoiceStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    EXTRACTED = "EXTRACTED"
    VERIFIED = "VERIFIED"
    CLASSIFIED = "CLASSIFIED"
    MATCHED = "MATCHED"
    IN_RETURN = "IN_RETURN"
    FILED = "FILED"

class Invoice(BaseModel, SoftDeleteMixin):
    __tablename__ = "invoices"

    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False, index=True)
    gstin = Column(String(15), nullable=False, index=True)
    direction = Column(Enum(InvoiceDirection), nullable=False)
    
    invoice_number = Column(String, nullable=False)
    invoice_date = Column(String, nullable=False)
    
    supplier_gstin = Column(String(15), nullable=True)
    supplier_name = Column(String, nullable=True)
    
    buyer_gstin = Column(String(15), nullable=True)
    buyer_name = Column(String, nullable=True)
    
    taxable_value = Column(Numeric(15, 2), default=0)
    cgst = Column(Numeric(15, 2), default=0)
    sgst = Column(Numeric(15, 2), default=0)
    igst = Column(Numeric(15, 2), default=0)
    cess = Column(Numeric(15, 2), default=0)
    total_value = Column(Numeric(15, 2), default=0)
    
    hsn_code = Column(String, nullable=True)
    sac_code = Column(String, nullable=True)
    
    place_of_supply = Column(String(2), nullable=True)
    reverse_charge = Column(Boolean, default=False)
    
    source = Column(Enum(InvoiceSource), nullable=False)
    extraction_confidence = Column(Float, nullable=True)
    
    ims_status = Column(Enum(IMSStatus), nullable=True)
    ims_proposed_by = Column(String, nullable=True)
    ims_committed_by = Column(UUID(as_uuid=True), nullable=True)
    
    vendor_risk_score = Column(Float, nullable=True)
    matched_2b = Column(Boolean, default=False)
    itc_eligible = Column(Boolean, default=False)
    itc_blocked_reason = Column(String, nullable=True)
    rule_37_aging_days = Column(Integer, nullable=True)
    
    document_hash = Column(String, nullable=True)
    raw_document_url = Column(String, nullable=True)
    
    status = Column(Enum(InvoiceStatus), default=InvoiceStatus.DRAFT, nullable=False)
    metadata_ = Column(JSONB, nullable=True, default={})
