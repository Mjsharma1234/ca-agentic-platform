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
from .base import GUID, JSONB


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
    link_method = Column(String(10), nullable=True)            # "manual" or "auto" (matched by exact name); None while unlinked


class TallyEnrollment(Base):
    """A Tally agent asking to be paired with a firm (device-code flow).

    The agent starts one with no credentials; a signed-in manager approves it by its short user_code; the agent
    then collects a freshly generated key exactly once by polling with its secret device_code. Until approval the
    row belongs to no firm (tenant_id NULL), so it is reachable only in system scope (see migration 0014).
    """
    __tablename__ = "tally_enrollments"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    device_code_hash = Column(String(64), nullable=False, unique=True, index=True)
    user_code = Column(String(9), nullable=False, unique=True, index=True)   # XXXX-XXXX, shown on the PC and in the link
    status = Column(String(12), nullable=False, default="pending")           # pending | approved | denied | delivered
    pc_name = Column(String(80), nullable=False, default="")
    agent_version = Column(String(32), nullable=False, default="")
    companies = Column(JSONB, nullable=False, default=list)                  # Tally companies the agent saw, for the approver
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    tenant_id = Column(GUID, nullable=True, index=True)
    approved_by = Column(String(64), nullable=True)
    agent_id = Column(GUID, nullable=True)


TALLY_ENROLLMENT_TABLES = ["tally_enrollments"]
TALLY_AGENT_TABLES = ["tally_agents", "tally_companies"]
