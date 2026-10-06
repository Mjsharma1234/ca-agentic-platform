import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, Enum, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
import enum

from .base import BaseModel

class GateStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    ESCALATED = "ESCALATED"
    TIMED_OUT = "TIMED_OUT"

class GateTier(str, enum.Enum):
    L2_STAFF = "L2_STAFF"
    L3_PARTNER = "L3_PARTNER"

class RequiredRole(str, enum.Enum):
    STAFF = "STAFF"
    REVIEWER = "REVIEWER"
    MANAGER = "MANAGER"
    PARTNER = "PARTNER"

class GateDecision(BaseModel):
    __tablename__ = "gate_decisions"

    client_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    gate_id = Column(String, nullable=False)
    gate_name = Column(String, nullable=False)
    
    entity_type = Column(String, nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    
    status = Column(Enum(GateStatus), default=GateStatus.PENDING, nullable=False)
    tier = Column(Enum(GateTier), nullable=False)
    required_role = Column(Enum(RequiredRole), nullable=False)
    
    evidence_pack = Column(JSONB, nullable=True)
    
    assigned_to = Column(UUID(as_uuid=True), nullable=True)
    decided_by = Column(UUID(as_uuid=True), nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    
    decision_notes = Column(String, nullable=True)
    escalation_reason = Column(String, nullable=True)
    
    sla_deadline = Column(DateTime(timezone=True), nullable=True)
    is_canary = Column(Boolean, default=False)
    
    metadata_ = Column(JSONB, nullable=True, default={})

class ObligationType(str, enum.Enum):
    GSTR1 = "GSTR1"
    GSTR1A = "GSTR1A"
    GSTR3B = "GSTR3B"
    TDS_RETURN = "TDS_RETURN"
    ITR = "ITR"

class ObligationFSMState(str, enum.Enum):
    NOT_STARTED = "NOT_STARTED"
    DATA_COLLECTED = "DATA_COLLECTED"
    RECONCILED = "RECONCILED"
    RULES_CHECKED = "RULES_CHECKED"
    REVIEW_PENDING = "REVIEW_PENDING"
    REVIEWED = "REVIEWED"
    SIGNING_PENDING = "SIGNING_PENDING"
    SIGNED = "SIGNED"
    TRANSMITTING = "TRANSMITTING"
    FILED = "FILED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    FAILED = "FAILED"

class ObligationState(BaseModel):
    __tablename__ = "obligation_states"

    client_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    gstin = Column(String(15), nullable=False, index=True)
    
    obligation_type = Column(Enum(ObligationType), nullable=False)
    period = Column(String, nullable=False)
    state = Column(Enum(ObligationFSMState), default=ObligationFSMState.NOT_STARTED, nullable=False)
    
    idempotency_key = Column(String, nullable=True, unique=True)
    
    locked_by = Column(UUID(as_uuid=True), nullable=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)
    
    current_gate = Column(String, nullable=True)
    
    metadata_ = Column(JSONB, nullable=True, default={})
