"""Tally desktop agent: its credentials and the Tally companies it reports.

An agent is a small Windows program on a client's PC that reads Tally over localhost and pushes the
purchase register to Firm OS. It authenticates with a per-firm key (only the SHA-256 of the key is stored).
Both tables are tenant-scoped (tenant_id = the firm's id) with row-level security in migration 0013;
tally_agents additionally opens to system scope, because the key lookup happens before any tenant is known.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from ..core.database import Base
from .base import GUID


class TallyAgent(Base):
    __tablename__ = "tally_agents"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID, nullable=False, index=True)
    name = Column(String(120), nullable=False)                 # e.g. "Reception PC"
    key_prefix = Column(String(12), nullable=False)            # shown in lists so people can tell keys apart
    key_hash = Column(String(64), nullable=False, unique=True, index=True)
    created_by = Column(String(64), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at = Column(DateTime, nullable=True)
    agent_version = Column(String(32), nullable=True)
    revoked_at = Column(DateTime, nullable=True)


class TallyCompany(Base):
    __tablename__ = "tally_companies"
    __table_args__ = (
        UniqueConstraint("tenant_id", "agent_id", "company_name", name="uq_tally_companies_agent_name"),
    )

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID, nullable=False, index=True)
    agent_id = Column(GUID, ForeignKey("tally_agents.id"), nullable=False, index=True)
    company_name = Column(String(250), nullable=False)
    client_id = Column(GUID, nullable=True, index=True)        # linked Firm OS client; None until a manager links it
    first_seen_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_synced_at = Column(DateTime, nullable=True)
    last_period_from = Column(String(10), nullable=True)
    last_period_to = Column(String(10), nullable=True)
    last_voucher_count = Column(Integer, nullable=True)
    last_error = Column(String(500), nullable=True)


TALLY_AGENT_TABLES = ["tally_agents", "tally_companies"]
