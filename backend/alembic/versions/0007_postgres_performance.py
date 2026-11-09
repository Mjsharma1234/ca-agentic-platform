"""PostgreSQL performance: tenant-leading composite and partial indexes, autovacuum tuning

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-09 08:30:00+00:00

PostgreSQL only. Every request is tenant-filtered (RLS adds `tenant_id = X` to every plan), so every
index leads with the tenant column. Partial indexes cover the "live rows only" reads.
"""
from typing import Sequence, Union

from alembic import op

revision: str = '0007'
down_revision: Union[str, None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (name, table, columns/expressions, optional partial predicate)
INDEXES = [
    ("ix_invoices_tenant_client_date", "invoices", "tenant_id, client_id, invoice_date DESC", None),
    ("ix_gst_returns_tenant_client_period", "gst_returns", "tenant_id, client_id, period", None),
    ("ix_gate_decisions_tenant_created", "gate_decisions", "tenant_id, created_at DESC", None),
    ("ix_firm_obligations_tenant_due", "firm_obligations", "tenant_id, statutory_due_date", "is_deleted = false"),
    ("ix_firm_obligations_tenant_state", "firm_obligations", "tenant_id, state", "is_deleted = false"),
    ("ix_firm_notices_tenant_hearing", "firm_notices", "tenant_id, statutory_hearing_date", "is_deleted = false"),
    ("ix_firm_daybook_tenant_day", "firm_daybook", "tenant_id, day_date DESC", None),
    ("ix_firm_gate_logs_tenant_decided", "firm_gate_logs", "tenant_id, decided_at DESC", None),
    ("ix_audit_ledger_tenant_created", "audit_ledger", "tenant_id, created_at DESC", None),
    ("ix_signing_requests_tenant_status", "signing_requests", "tenant_id, status, created_at DESC", None),
    ("ix_signing_requests_tenant_expiry", "signing_requests", "tenant_id, expires_at", None),
    ("ix_signer_devices_tenant_active", "signer_devices", "tenant_id, user_id", "revoked_at IS NULL"),
    ("ix_dsc_certificates_tenant_user", "dsc_certificates", "tenant_id, user_id", None),
    ("ix_clients_tenant_name_live", "clients", "tenant_id, client_name", "is_deleted = false"),
    ("ix_client_gstins_tenant_client", "client_gstins", "tenant_id, client_id", None),
    ("ix_users_phone", "users", "phone", "phone IS NOT NULL"),
    ("ix_otp_records_identifier_created", "otp_records", "identifier, created_at DESC", None),
    ("ix_otp_records_expires", "otp_records", "expires_at", None),
]

# Append-only, time-ordered: a BRIN index is ~1000x smaller than a B-tree and serves range scans.
BRIN = [
    ("brin_audit_ledger_created", "audit_ledger", "created_at"),
    ("brin_audit_blocks_timestamp", "audit_blocks", "timestamp"),
]

# High-churn small tables: vacuum early so dead tuples never pile up.
AUTOVACUUM = {
    "otp_records": "autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02",
    "signer_devices": "autovacuum_vacuum_scale_factor = 0.05",
    "device_authorizations": "autovacuum_vacuum_scale_factor = 0.02",
    "firm_states": "autovacuum_vacuum_scale_factor = 0.02",
}


def _postgres() -> bool:
    return op.get_context().dialect.name == "postgresql"


def upgrade() -> None:
    if not _postgres():
        return
    for name, table, cols, where in INDEXES:
        predicate = f" WHERE {where}" if where else ""
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({cols}){predicate}")
    for name, table, col in BRIN:
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} USING brin ({col})")
    for table, opts in AUTOVACUUM.items():
        op.execute(f"ALTER TABLE {table} SET ({opts})")


def downgrade() -> None:
    if not _postgres():
        return
    for table, opts in AUTOVACUUM.items():
        keys = ", ".join(part.split("=")[0].strip() for part in opts.split(","))
        op.execute(f"ALTER TABLE {table} RESET ({keys})")
    for name, _, _ in BRIN:
        op.execute(f"DROP INDEX IF EXISTS {name}")
    for name, _, _, _ in INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {name}")
