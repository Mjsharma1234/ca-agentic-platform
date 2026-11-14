"""Firm OS ops-tracker tables (Phase 1): staff, obligations, tasks, notices, timesheets, fee invoices,
daybook and per-firm settings, replacing the single firm_states JSON blob.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-11 10:00:00+00:00

Tables are created from the model definitions in app/models/ops.py (single source of truth). On
PostgreSQL every new table gets the same tenant_isolation policy as migration 0006, and ops_daybook
is append-only like the audit tables. firm_states is left in place (read-only legacy) so nothing is lost.
"""
from typing import Sequence, Union

from alembic import op

revision: str = '0010'
down_revision: Union[str, None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APP_ROLE = "ca_app"
APPEND_ONLY = ["ops_daybook"]


def _tables():
    from app.models import ops  # noqa: F401  (registers the tables)
    from app.core.database import Base
    return [Base.metadata.tables[name] for name in ops.OPS_TABLES]


def _postgres() -> bool:
    return op.get_context().dialect.name == "postgresql"


def upgrade() -> None:
    bind = op.get_bind()
    for table in _tables():
        table.create(bind=bind, checkfirst=True)

    if not _postgres():
        return
    for table in _tables():
        name = table.name
        op.execute(f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {name}")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {name} AS PERMISSIVE FOR ALL TO {APP_ROLE} "
            f"USING (tenant_id = (SELECT app_tenant_id())) WITH CHECK (tenant_id = (SELECT app_tenant_id()))"
        )
        privileges = "SELECT, INSERT" if name in APPEND_ONLY else "SELECT, INSERT, UPDATE, DELETE"
        op.execute(f"GRANT {privileges} ON {name} TO {APP_ROLE}")
    for name in APPEND_ONLY:
        op.execute(f"DROP TRIGGER IF EXISTS {name}_append_only ON {name}")
        op.execute(
            f"CREATE TRIGGER {name}_append_only BEFORE UPDATE OR DELETE ON {name} "
            f"FOR EACH ROW EXECUTE FUNCTION app_forbid_change()"
        )


def downgrade() -> None:
    bind = op.get_bind()
    for table in reversed(_tables()):
        table.drop(bind=bind, checkfirst=True)
