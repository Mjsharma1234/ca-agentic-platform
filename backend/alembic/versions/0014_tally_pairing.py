"""Tally agent pairing: tally_enrollments table and tally_companies.link_method.

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-19 10:00:00+00:00

tally_enrollments holds agents that asked to be paired before any firm has approved them, so its rows have a
NULL tenant_id until approval. On PostgreSQL it gets the tenant_isolation policy (rows of an approving firm) and
the system_scope policy (the unauthenticated start/poll calls and the approver's code lookup run in system scope),
matching migrations 0006 and 0013.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0014'
down_revision: Union[str, None] = '0013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APP_ROLE = "ca_app"


def _tables():
    from app.models import tally_agent  # noqa: F401  (registers the tables)
    from app.core.database import Base
    return [Base.metadata.tables[name] for name in tally_agent.TALLY_ENROLLMENT_TABLES]


def _postgres() -> bool:
    return op.get_context().dialect.name == "postgresql"


def upgrade() -> None:
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("tally_companies")}
    if "link_method" not in columns:
        with op.batch_alter_table("tally_companies") as batch:
            batch.add_column(sa.Column("link_method", sa.String(10), nullable=True))
        op.execute("UPDATE tally_companies SET link_method = 'manual' WHERE client_id IS NOT NULL")

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
        op.execute(f"DROP POLICY IF EXISTS system_scope ON {name}")
        op.execute(
            f"CREATE POLICY system_scope ON {name} AS PERMISSIVE FOR ALL TO {APP_ROLE} "
            f"USING ((SELECT app_is_system())) WITH CHECK ((SELECT app_is_system()))"
        )
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {name} TO {APP_ROLE}")


def downgrade() -> None:
    bind = op.get_bind()
    if _postgres():
        for table in _tables():
            op.execute(f"DROP POLICY IF EXISTS system_scope ON {table.name}")
    for table in reversed(_tables()):
        table.drop(bind=bind, checkfirst=True)
    with op.batch_alter_table("tally_companies") as batch:
        batch.drop_column("link_method")
