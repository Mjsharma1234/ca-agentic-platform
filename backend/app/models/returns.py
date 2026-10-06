import uuid
from decimal import Decimal
from datetime import date, datetime
from sqlalchemy import Column, String, Enum, Numeric, ForeignKey, Date, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
import enum

from .base import BaseModel, SoftDeleteMixin

class ReturnType(str, enum.Enum):
    GSTR1 = "GSTR1"
    GSTR1A = "GSTR1A"
    GSTR3B = "GSTR3B"
    GSTR9 = "GSTR9"
    GSTR9C = "GSTR9C"

class ReturnStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    RULES_CHECKED = "RULES_CHECKED"
    REVIEW_PENDING = "REVIEW_PENDING"
    REVIEWED = "REVIEWED"
    SIGNING_PENDING = "SIGNING_PENDING"
    SIGNED = "SIGNED"
    FILED = "FILED"
    ACKNOWLEDGED = "ACKNOWLEDGED"

class GSTReturn(BaseModel, SoftDeleteMixin):
    __tablename__ = "gst_returns"

    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False, index=True)
    gstin = Column(String(15), nullable=False, index=True)
    
    return_type = Column(Enum(ReturnType), nullable=False)
    period = Column(String, nullable=False)
    financial_year = Column(String, nullable=False)
    
    status = Column(Enum(ReturnStatus), default=ReturnStatus.DRAFT, nullable=False)
    
    total_taxable_outward = Column(Numeric(15, 2), default=0)
    total_tax_liability = Column(Numeric(15, 2), default=0)
    total_itc_claimed = Column(Numeric(15, 2), default=0)
    net_tax_payable = Column(Numeric(15, 2), default=0)
    late_fee = Column(Numeric(15, 2), default=0)
    interest_sec50 = Column(Numeric(15, 2), default=0)
    
    payload_json = Column(JSONB, nullable=True)
    payload_hash = Column(String, nullable=True)
    idempotency_key = Column(String, nullable=True, unique=True)
    
    rule_check_results = Column(JSONB, nullable=True)
    variance_memo = Column(String, nullable=True)
    
    preparer_id = Column(UUID(as_uuid=True), nullable=True)
    reviewer_id = Column(UUID(as_uuid=True), nullable=True)
    signing_partner_id = Column(UUID(as_uuid=True), nullable=True)
    
    arn = Column(String, nullable=True)
    filed_at = Column(DateTime(timezone=True), nullable=True)
    due_date = Column(Date, nullable=True)
    
    metadata_ = Column(JSONB, nullable=True, default={})
