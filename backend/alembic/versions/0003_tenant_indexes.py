"""tenant query indexes and client gstin uniqueness

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-01 06:31:04.882247+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

class GUID(sa.types.TypeDecorator):
    """Mirror of app.models.base.GUID, frozen here so the migration never drifts with app code:
    native UUID on PostgreSQL, CHAR(36) elsewhere."""
    impl = sa.CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(postgresql.UUID(as_uuid=True))
        return dialect.type_descriptor(sa.CHAR(36))


revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('clients', schema=None) as batch_op:
        batch_op.create_index('ix_clients_tenant_active', ['tenant_id', 'is_deleted'], unique=False)
        batch_op.create_index('uq_clients_tenant_gstin_live', ['tenant_id', 'gstin'], unique=True, postgresql_where=sa.text('gstin IS NOT NULL AND is_deleted = false'), sqlite_where=sa.text('gstin IS NOT NULL AND is_deleted = 0'))

    with op.batch_alter_table('gate_decisions', schema=None) as batch_op:
        batch_op.create_index('ix_gate_decisions_tenant_status', ['tenant_id', 'status'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('gate_decisions', schema=None) as batch_op:
        batch_op.drop_index('ix_gate_decisions_tenant_status')

    with op.batch_alter_table('clients', schema=None) as batch_op:
        batch_op.drop_index('uq_clients_tenant_gstin_live', postgresql_where=sa.text('gstin IS NOT NULL AND is_deleted = false'), sqlite_where=sa.text('gstin IS NOT NULL AND is_deleted = 0'))
        batch_op.drop_index('ix_clients_tenant_active')

