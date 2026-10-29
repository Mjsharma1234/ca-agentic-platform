import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Numeric, Boolean, Date, Text
from sqlalchemy.orm import declarative_mixin

from .base import BaseModel, SoftDeleteMixin, UUID, JSONB

class FirmStateModel(BaseModel):
    """Stores full persistent state snapshots of the CA Firm OS."""
    __tablename__ = "firm_states"

    firm_id = Column(String(64), unique=True, index=True, nullable=False, default="nallamala-co")
    firm_name = Column(String(128), default="Nallamala & Co., Chartered Accountants", nullable=False)
    state_json = Column(JSONB, nullable=False)
    version = Column(String(32), default="v1.0", nullable=False)
    last_synced_by = Column(String(64), default="srinivas", nullable=False)

class ObligationItem(BaseModel, SoftDeleteMixin):
    """Tracks each compliance obligation on The Line across 12 domains."""
    __tablename__ = "firm_obligations"

    client_id = Column(String(64), index=True, nullable=False)
    client_name = Column(String(128), nullable=True)
    domain = Column(String(16), index=True, nullable=False)  # GST, ITX, TDS, ROC, etc.
    form_id = Column(String(32), index=True, nullable=False)   # GSTR-3B, 26Q, ITR-6, etc.
    period = Column(String(32), nullable=False)               # Sep 2026, Q2 FY 2026-27
    statutory_due_date = Column(Date, nullable=False)
    internal_buffer_date = Column(Date, nullable=True)        # 3-day buffer
    
    state = Column(String(32), default="scheduled", index=True, nullable=False)
    # scheduled, awaiting, received, preparing, review, signed, filed, acknowledged
    
    assigned_staff = Column(String(64), nullable=True)
    reviewer_staff = Column(String(64), nullable=True)
    signing_partner = Column(String(64), nullable=True)
    
    amount = Column(Numeric(15, 2), default=0.0)
    tax_liability = Column(Numeric(15, 2), default=0.0)
    itc_claimed = Column(Numeric(15, 2), default=0.0)
    
    acknowledgement_ref = Column(String(64), nullable=True)   # ARN / Ack Number
    filed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    metadata_ = Column(JSONB, default={}, nullable=True)

class NoticeItem(BaseModel, SoftDeleteMixin):
    """Notice desk tracker for tax and statutory notices (DRC-01, ASMT-10, 148, 143(1))."""
    __tablename__ = "firm_notices"

    client_id = Column(String(64), index=True, nullable=False)
    client_name = Column(String(128), nullable=True)
    domain = Column(String(16), index=True, nullable=False)  # GST, ITX, MCA
    notice_type = Column(String(32), index=True, nullable=False) # DRC-01, ASMT-10, 148, etc.
    notice_number = Column(String(64), nullable=False)
    section = Column(String(64), nullable=False)
    
    issuing_authority = Column(String(128), nullable=True)
    demand_amount = Column(Numeric(15, 2), default=0.0)
    
    service_date = Column(Date, nullable=False)
    statutory_hearing_date = Column(Date, nullable=False)
    internal_buffer_date = Column(Date, nullable=False) # Mandatory 5-day buffer
    
    stage = Column(String(32), default="Ingested", nullable=False)
    # Ingested, In Draft, Partner Review, Replied, Closed
    
    assigned_to = Column(String(64), nullable=True)
    partner_id = Column(String(64), nullable=True)
    reply_summary = Column(Text, nullable=True)
    metadata_ = Column(JSONB, default={}, nullable=True)

class DaybookEntry(BaseModel):
    """Sealed daily operational diary entry."""
    __tablename__ = "firm_daybook"

    day_date = Column(Date, index=True, nullable=False)
    actor_id = Column(String(64), nullable=False)
    actor_name = Column(String(128), nullable=False)
    action_category = Column(String(32), nullable=False) # filing, gate, notice, client, reco
    description = Column(Text, nullable=False)
    ref_id = Column(String(64), nullable=True)
    sealed_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    metadata_ = Column(JSONB, default={}, nullable=True)

class GateApprovalLog(BaseModel):
    """Cryptographic audit log for G1-G18 gate decisions."""
    __tablename__ = "firm_gate_logs"

    gate_code = Column(String(8), index=True, nullable=False) # G1 through G18
    gate_title = Column(String(128), nullable=False)
    item_id = Column(String(64), index=True, nullable=False)
    client_id = Column(String(64), index=True, nullable=False)
    
    action = Column(String(16), nullable=False) # APPROVED, REJECTED, ESCALATED
    decided_by = Column(String(64), nullable=False)
    actor_role = Column(String(16), nullable=False) # MP, PT, MG, SA, etc.
    
    decision_notes = Column(Text, nullable=True)
    four_eyes_verified = Column(Boolean, default=True)
    preparer_id = Column(String(64), nullable=True)
    
    payload_hash = Column(String(64), nullable=False) # SHA-256
    signature_token = Column(String(128), nullable=True)
    decided_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    metadata_ = Column(JSONB, default={}, nullable=True)
