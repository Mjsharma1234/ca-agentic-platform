import uuid
from sqlalchemy import Column, String, Boolean, Enum, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import enum

from .base import BaseModel, SoftDeleteMixin

class ClientType(str, enum.Enum):
    INDIVIDUAL = "INDIVIDUAL"
    HUF = "HUF"
    PARTNERSHIP = "PARTNERSHIP"
    LLP = "LLP"
    COMPANY = "COMPANY"
    TRUST = "TRUST"

class ClientStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    ONBOARDING = "ONBOARDING"
    EXITED = "EXITED"

class ERPType(str, enum.Enum):
    TALLY_PRIME = "TALLY_PRIME"
    ZOHO_BOOKS = "ZOHO_BOOKS"
    BUSY = "BUSY"
    SAP = "SAP"
    MANUAL = "MANUAL"

class RiskTier(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class GSTINStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    CANCELLED = "CANCELLED"

class Client(BaseModel, SoftDeleteMixin):
    __tablename__ = "clients"

    client_name = Column(String, nullable=False)
    trade_name = Column(String, nullable=True)
    pan = Column(String(10), nullable=False, index=True)
    gstin = Column(String(15), nullable=True)
    
    client_type = Column(Enum(ClientType), nullable=False)
    status = Column(Enum(ClientStatus), default=ClientStatus.ONBOARDING, nullable=False)
    erp_type = Column(Enum(ERPType), nullable=False)
    
    assigned_partner_id = Column(UUID(as_uuid=True), nullable=True)
    assigned_staff_id = Column(UUID(as_uuid=True), nullable=True)
    
    risk_tier = Column(Enum(RiskTier), default=RiskTier.LOW, nullable=False)
    annual_turnover = Column(Numeric(15, 2), default=0)
    is_composition = Column(Boolean, default=False)
    
    financial_year_start = Column(String, nullable=False)
    financial_year_end = Column(String, nullable=False)
    
    emergency_bypass_active = Column(Boolean, default=False)
    metadata_ = Column(JSONB, nullable=True, default={})

    gstins = relationship("ClientGSTIN", back_populates="client", cascade="all, delete-orphan")

class ClientGSTIN(BaseModel):
    __tablename__ = "client_gstins"

    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    gstin = Column(String(15), unique=True, nullable=False, index=True)
    state_code = Column(String(2), nullable=False)
    registration_date = Column(String, nullable=True)
    status = Column(Enum(GSTINStatus), default=GSTINStatus.ACTIVE, nullable=False)

    client = relationship("Client", back_populates="gstins")
