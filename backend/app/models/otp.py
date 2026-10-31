import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Integer
from .base import BaseModel, GUID
from ..core.database import Base

class OTPRecord(Base):
    __tablename__ = "otp_records"

    id = Column(GUID, primary_key=True, default=uuid.uuid4, index=True)
    identifier = Column(String(150), index=True, nullable=False) # E.164 phone or normalized email
    otp_hash = Column(String(64), nullable=False)                # SHA-256 hash of (identifier + otp + secret)
    channel = Column(String(20), default="SMS", nullable=False)  # "SMS" | "EMAIL"
    purpose = Column(String(50), default="LOGIN", nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    max_attempts = Column(Integer, default=3, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
