"""one permissive policy per identity table, and an index for the client_gstins foreign key

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-09 09:30:00+00:00

firms, users, device_authorizations and signer_devices carried two permissive policies (tenant OR system), which
PostgreSQL evaluates separately for every row. One combined policy has identical semantics and is cheaper
(Supabase linter 0006). Also covers client_gstins.client_id (linter 0001).
"""
from typing import Sequence, Union

from alembic import op

revision: str = '0009'
down_revision: Union[str, None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APP_ROLE = "ca_app"
IDENTITY = {"firms": "id", "users": "firm_id", "device_authorizations": "tenant_id", "signer_devices": "tenant_id"}


def _postgres() -> bool:
    return op.get_context().dialect.name == "postgresql"


def upgrade() -> None:
    if not _postgres():
        return
    for table, col in IDENTITY.items():
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"DROP POLICY IF EXISTS system_scope ON {table}")
        expr = f"{col} = (SELECT app_tenant_id()) OR (SELECT app_is_system())"
        op.execute(
            f"CREATE POLICY tenant_or_system ON {table} AS PERMISSIVE FOR ALL TO {APP_ROLE} "
            f"USING ({expr}) WITH CHECK ({expr})"
        )
    op.execute("CREATE INDEX IF NOT EXISTS ix_client_gstins_client_id ON client_gstins (client_id)")


def downgrade() -> None:
    if not _postgres():
        return
    op.execute("DROP INDEX IF EXISTS ix_client_gstins_client_id")
    for table, col in IDENTITY.items():
        op.execute(f"DROP POLICY IF EXISTS tenant_or_system ON {table}")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} AS PERMISSIVE FOR ALL TO {APP_ROLE} "
            f"USING ({col} = (SELECT app_tenant_id())) WITH CHECK ({col} = (SELECT app_tenant_id()))"
        )
        op.execute(
            f"CREATE POLICY system_scope ON {table} AS PERMISSIVE FOR ALL TO {APP_ROLE} "
            f"USING ((SELECT app_is_system())) WITH CHECK ((SELECT app_is_system()))"
        )
