import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum, Float
from sqlalchemy.dialects.postgresql import UUID, JSONB
import enum

from ..core.database import Base

class ActionType(str, enum.Enum):
    EXTRACTED = "EXTRACTED"
    CLASSIFIED = "CLASSIFIED"
    MATCHED = "MATCHED"
    PROPOSED = "PROPOSED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SIGNED = "SIGNED"
    FILED = "FILED"

class AuditLedger(Base):
    __tablename__ = "audit_ledger"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    
    agent_id = Column(String, nullable=False)
    agent_version = Column(String, nullable=False)
    action_type = Column(Enum(ActionType), nullable=False)
    
    entity_type = Column(String, nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    
    input_hash = Column(String, nullable=False)
    output_hash = Column(String, nullable=False)
    output_snapshot = Column(JSONB, nullable=False)
    
    model_id = Column(String, nullable=True)
    prompt_version = Column(String, nullable=True)
    confidence_score = Column(Float, nullable=True)
    
    gate_id = Column(String, nullable=True)
    actor_id = Column(UUID(as_uuid=True), nullable=True)
    actor_role = Column(String, nullable=True)
    
    metadata_ = Column(JSONB, nullable=True, default={})
