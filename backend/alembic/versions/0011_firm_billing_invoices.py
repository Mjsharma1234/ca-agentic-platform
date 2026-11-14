"""Firm billing invoices table (the firm's own professional-fee invoices to its clients),
replacing the process-global in-memory store the /billing API used to keep.

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-14 10:00:00+00:00

The table is created from the model definition in app/models/billing.py (single source of truth).
On PostgreSQL it gets the same tenant_isolation row-level-security policy and ca_app grants as
every other tenant-scoped table (see migrations 0006 and 0010).
"""
from typing import Sequence, Union

from alembic import op

revision: str = '0011'
down_revision: Union[str, None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APP_ROLE = "ca_app"


def _tables():
    from app.models import billing  # noqa: F401  (registers the tables)
    from app.core.database import Base
    return [Base.metadata.tables[name] for name in billing.BILLING_TABLES]


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
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {name} TO {APP_ROLE}")


def downgrade() -> None:
    bind = op.get_bind()
    for table in reversed(_tables()):
        table.drop(bind=bind, checkfirst=True)
