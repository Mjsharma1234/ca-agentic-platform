"""Firm OS ops-tracker records (Phase 1: one table per entity instead of one JSON blob).

Every table is tenant-scoped (tenant_id = the firm's id, protected by PostgreSQL RLS) and keyed by
`ref`, the stable identifier the web tracker uses for the record (e.g. 'c01', 'ob-1a2b3c4', 'tk1').
Fields the platform reasons about are real, typed, indexed columns; `data` keeps the full record
exactly as the tracker sent it so the UI round-trips losslessly while the schema grows.

Clients are not here: they live in the shared `clients` table (models/clients.py) with the tracker's
ref and profile in `clients.metadata_`, so the ops tracker and the filing engines share one client master.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Index, Integer, Numeric, String, Text, UniqueConstraint,
)

from ..core.database import Base
from .base import GUID, JSONB


class _OpsRecord:
    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    tenant_id = Column(GUID, nullable=False, index=True)
    ref = Column(String(64), nullable=False)
    data = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by = Column(String(64), nullable=True)


def _uniq(table: str):
    return UniqueConstraint("tenant_id", "ref", name=f"uq_{table}_tenant_ref")


class OpsStaff(_OpsRecord, Base):
    """A person in the firm as the tracker knows them (role codes MP/PT/MG/SA/AR/PX/CC)."""
    __tablename__ = "ops_staff"
    __table_args__ = (_uniq("ops_staff"),)

    name = Column(String(150), nullable=False)
    role = Column(String(8), nullable=False)
    email = Column(String(150), nullable=True, index=True)
    phone = Column(String(20), nullable=True, index=True)
    user_id = Column(GUID, nullable=True, index=True)  # linked login (users.id), once they have signed in
    active = Column(Boolean, default=True, nullable=False)


class OpsObligation(_OpsRecord, Base):
    """One filing for one client and period on The Line."""
    __tablename__ = "ops_obligations"
    __table_args__ = (
        _uniq("ops_obligations"),
        Index("ix_ops_obligations_tenant_due", "tenant_id", "due_at"),
        Index("ix_ops_obligations_tenant_state", "tenant_id", "state"),
    )

    client_ref = Column(String(64), nullable=False, index=True)
    form = Column(String(64), nullable=False)
    domain = Column(String(16), nullable=True)
    period = Column(String(64), nullable=True)
    due_at = Column(DateTime(timezone=True), nullable=False)
    state = Column(String(24), nullable=False)
    preparer_ref = Column(String(64), nullable=True)
    reviewer_ref = Column(String(64), nullable=True)
    partner_ref = Column(String(64), nullable=True)
    ack = Column(String(64), nullable=True)
    amount = Column(Numeric(15, 2), default=0, nullable=False)


class OpsTask(_OpsRecord, Base):
    __tablename__ = "ops_tasks"
    __table_args__ = (_uniq("ops_tasks"),)

    title = Column(Text, nullable=False)
    client_ref = Column(String(64), nullable=True, index=True)
    owner_ref = Column(String(64), nullable=True, index=True)
    due_at = Column(DateTime(timezone=True), nullable=True)
    done = Column(Boolean, default=False, nullable=False)


class OpsNotice(_OpsRecord, Base):
    __tablename__ = "ops_notices"
    __table_args__ = (_uniq("ops_notices"),)

    client_ref = Column(String(64), nullable=False, index=True)
    notice_type = Column(String(128), nullable=False)
    demand = Column(Numeric(15, 2), default=0, nullable=False)
    received_at = Column(DateTime(timezone=True), nullable=True)
    reply_by = Column(DateTime(timezone=True), nullable=True, index=True)
    owner_ref = Column(String(64), nullable=True)
    stage = Column(String(128), nullable=True)


class OpsTimesheet(_OpsRecord, Base):
    __tablename__ = "ops_timesheets"
    __table_args__ = (_uniq("ops_timesheets"), Index("ix_ops_timesheets_tenant_date", "tenant_id", "work_date"))

    staff_ref = Column(String(64), nullable=False, index=True)
    client_ref = Column(String(64), nullable=True)
    work_date = Column(Date, nullable=False)
    minutes = Column(Integer, nullable=False)
    source = Column(String(16), default="manual", nullable=False)  # manual | daybook


class OpsFeeInvoice(_OpsRecord, Base):
    """The firm's own fee invoices to clients (not GST purchase/sales documents)."""
    __tablename__ = "ops_fee_invoices"
    __table_args__ = (_uniq("ops_fee_invoices"),)

    client_ref = Column(String(64), nullable=False, index=True)
    status = Column(String(64), nullable=False)
    amount = Column(Numeric(15, 2), default=0, nullable=False)
    issued_at = Column(DateTime(timezone=True), nullable=True)


class OpsDaybookEntry(_OpsRecord, Base):
    """The tracker's append-only, hash-chained activity record. Never updated or deleted."""
    __tablename__ = "ops_daybook"
    __table_args__ = (_uniq("ops_daybook"), Index("ix_ops_daybook_tenant_at", "tenant_id", "at"))

    seq = Column(Integer, nullable=False)
    at = Column(DateTime(timezone=True), nullable=False)
    actor_ref = Column(String(64), nullable=False)
    kind = Column(String(16), nullable=False)
    action = Column(Text, nullable=False)
    client_ref = Column(String(64), nullable=True, index=True)
    hash = Column(String(64), nullable=False)
    prev_hash = Column(String(64), nullable=False)


class OpsSettings(Base):
    """Per-firm workspace settings that are not yet their own tables (gates, threads, automations,
    capability matrix, ethical walls…). One row per firm, tenant-scoped like everything else."""
    __tablename__ = "ops_settings"

    tenant_id = Column(GUID, primary_key=True)
    data = Column(JSONB, nullable=False, default=dict)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by = Column(String(64), nullable=True)


OPS_TABLES = [
    "ops_staff", "ops_obligations", "ops_tasks", "ops_notices", "ops_timesheets",
    "ops_fee_invoices", "ops_daybook", "ops_settings",
]
