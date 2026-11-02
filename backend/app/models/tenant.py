import uuid
from datetime import datetime
from enum import Enum
from sqlalchemy import Column, String, Boolean, DateTime, JSON, Integer, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from .base import BaseModel, GUID
from ..core.database import Base

class FirmConstitution(str, Enum):
    PROPRIETORSHIP = "PROPRIETORSHIP"
    PARTNERSHIP = "PARTNERSHIP"
    LLP = "LLP"

class PlanTier(str, Enum):
    STARTER = "STARTER"        # Solo CA / Small Firm (up to 5 staff, 100 clients)
    GROWTH = "GROWTH"          # Medium Practice (up to 20 staff, 500 clients)
    ENTERPRISE = "ENTERPRISE"  # Large Firm / Multi-branch (Unlimited)

class UserRole(str, Enum):
    PARTNER = "PARTNER"                # Full sign-off, DSC authority, G12/G14 releases
    SENIOR_MANAGER = "SENIOR_MANAGER"  # Work review, high-value check, G6-G10 approvals
    MANAGER = "MANAGER"                # Routine work review, allocation
    ARTICLE_TRAINEE = "ARTICLE_TRAINEE"# Preparation, data entry, initial reconciliation
    CLIENT_USER = "CLIENT_USER"        # Client portal view, document upload, approval

class Firm(Base):
    __tablename__ = "firms"

    id = Column(GUID, primary_key=True, default=uuid.uuid4, index=True)
    firm_code = Column(String(50), unique=True, index=True, nullable=False) # e.g. "nallamala-co"
    firm_name = Column(String(200), nullable=False)
    frn = Column(String(20), unique=True, nullable=True, index=True)       # ICAI Firm Registration No
    constitution = Column(String(30), default=FirmConstitution.PARTNERSHIP.value)
    plan_tier = Column(String(30), default=PlanTier.GROWTH.value)
    pan = Column(String(10), nullable=True)
    gstin = Column(String(15), nullable=True)
    head_office_city = Column(String(100), default="Hyderabad")
    is_active = Column(Boolean, default=True)
    settings = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", back_populates="firm", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "users"

    id = Column(GUID, primary_key=True, default=uuid.uuid4, index=True)
    firm_id = Column(GUID, ForeignKey("firms.id"), nullable=False, index=True)
    email = Column(String(150), unique=True, index=True, nullable=False)
    full_name = Column(String(150), nullable=False)
    role = Column(String(30), default=UserRole.ARTICLE_TRAINEE.value, nullable=False)
    membership_no = Column(String(20), nullable=True) # ICAI Membership No for CAs
    hashed_password = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    mfa_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    firm = relationship("Firm", back_populates="users")

class AuditBlock(Base):
    """Immutable Cryptographic Audit Trail Block (ICAI SQC-1 Compliance).
    Maintains a SHA-256 hash chain where each block's integrity verifies the prior block.
    """
    __tablename__ = "audit_blocks"
    __table_args__ = (UniqueConstraint("firm_id", "sequence", name="uq_audit_blocks_firm_sequence"),)

    id = Column(GUID, primary_key=True, default=uuid.uuid4, index=True)
    firm_id = Column(GUID, ForeignKey("firms.id"), nullable=False, index=True)
    sequence = Column(Integer, nullable=False, index=True)
    prev_hash = Column(String(64), nullable=False)
    block_hash = Column(String(64), nullable=False, index=True)
    actor_id = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=False)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(String(100), nullable=False)
    payload_json = Column(JSON, default=dict)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
