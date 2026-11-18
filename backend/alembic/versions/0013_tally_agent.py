"""Tally desktop agent: agent keys, reported Tally companies, and invoices.external_ref.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-18 10:00:00+00:00

Tables come from app/models/tally_agent.py (single source of truth). invoices gets a nullable
external_ref (the Tally voucher GUID) and a unique index per client so the agent can upsert.
On PostgreSQL both new tables get the tenant_isolation policy of migrations 0010/0011, and
tally_agents also gets system_scope (migration 0006): the agent's key is looked up before any tenant is known.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0013'
down_revision: Union[str, None] = '0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APP_ROLE = "ca_app"
INDEX = "uq_invoices_client_external_ref"


def _tables():
    from app.models import tally_agent  # noqa: F401  (registers the tables)
    from app.core.database import Base
    return [Base.metadata.tables[name] for name in tally_agent.TALLY_AGENT_TABLES]


def _postgres() -> bool:
    return op.get_context().dialect.name == "postgresql"


def upgrade() -> None:
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("invoices")}
    if "external_ref" not in columns:
        with op.batch_alter_table("invoices") as batch:
            batch.add_column(sa.Column("external_ref", sa.String(64), nullable=True))
    existing = {i["name"] for i in sa.inspect(bind).get_indexes("invoices")}
    if INDEX not in existing:
        op.create_index(
            INDEX, "invoices", ["tenant_id", "client_id", "external_ref"], unique=True,
            postgresql_where=sa.text("external_ref IS NOT NULL"),
            sqlite_where=sa.text("external_ref IS NOT NULL"),
        )

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
    op.execute("DROP POLICY IF EXISTS system_scope ON tally_agents")
    op.execute(
        f"CREATE POLICY system_scope ON tally_agents AS PERMISSIVE FOR ALL TO {APP_ROLE} "
        f"USING ((SELECT app_is_system())) WITH CHECK ((SELECT app_is_system()))"
    )


def downgrade() -> None:
    bind = op.get_bind()
    if _postgres():
        op.execute("DROP POLICY IF EXISTS system_scope ON tally_agents")
    for table in reversed(_tables()):
        table.drop(bind=bind, checkfirst=True)
    op.drop_index(INDEX, table_name="invoices")
    with op.batch_alter_table("invoices") as batch:
        batch.drop_column("external_ref")
