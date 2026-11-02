"""signer devices and audit sequence uniqueness

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-02 04:31:44.238295+00:00
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


revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('device_authorizations',
    sa.Column('device_code_hash', sa.String(length=64), nullable=False),
    sa.Column('user_code', sa.String(length=12), nullable=False),
    sa.Column('device_name', sa.String(length=120), nullable=False),
    sa.Column('status', sa.Enum('PENDING', 'APPROVED', 'DENIED', 'CONSUMED', name='devicegrantstatus'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('approved_user_id', GUID(), nullable=True),
    sa.Column('last_polled_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('device_code_hash')
    )
    with op.batch_alter_table('device_authorizations', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_device_authorizations_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_device_authorizations_tenant_id'), ['tenant_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_device_authorizations_user_code'), ['user_code'], unique=False)

    op.create_table('signer_devices',
    sa.Column('user_id', GUID(), nullable=False),
    sa.Column('device_name', sa.String(length=120), nullable=False),
    sa.Column('refresh_hash', sa.String(length=64), nullable=False),
    sa.Column('previous_refresh_hash', sa.String(length=64), nullable=True),
    sa.Column('refresh_expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('refresh_hash')
    )
    with op.batch_alter_table('signer_devices', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_signer_devices_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_signer_devices_tenant_id'), ['tenant_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_signer_devices_user_id'), ['user_id'], unique=False)

    # Legacy databases may already hold forked sequences (from the pre-lock writer). Rewriting
    # history would break the hash chain, so only enforce uniqueness when the data allows it;
    # otherwise skip loudly and let the row lock in append_audit_block prevent new forks.
    dupes = op.get_bind().execute(
        sa.text("SELECT COUNT(*) FROM (SELECT firm_id, sequence FROM audit_blocks GROUP BY firm_id, sequence HAVING COUNT(*) > 1) d")
    ).scalar()
    if dupes:
        print(f"WARNING: {dupes} duplicate audit (firm, sequence) pairs found; uq_audit_blocks_firm_sequence NOT created.")
    else:
        with op.batch_alter_table('audit_blocks', schema=None) as batch_op:
            batch_op.create_unique_constraint('uq_audit_blocks_firm_sequence', ['firm_id', 'sequence'])



def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if any(u["name"] == "uq_audit_blocks_firm_sequence" for u in insp.get_unique_constraints("audit_blocks")):
        with op.batch_alter_table('audit_blocks', schema=None) as batch_op:
            batch_op.drop_constraint('uq_audit_blocks_firm_sequence', type_='unique')

    with op.batch_alter_table('signer_devices', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_signer_devices_user_id'))
        batch_op.drop_index(batch_op.f('ix_signer_devices_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_signer_devices_id'))

    op.drop_table('signer_devices')
    with op.batch_alter_table('device_authorizations', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_device_authorizations_user_code'))
        batch_op.drop_index(batch_op.f('ix_device_authorizations_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_device_authorizations_id'))

    op.drop_table('device_authorizations')

    if op.get_bind().dialect.name == "postgresql":
        for enum_name in ['devicegrantstatus']:
            sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
