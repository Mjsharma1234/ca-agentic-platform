"""dsc signing tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-01 06:30:49.209939+00:00
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


revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('dsc_certificates',
    sa.Column('user_id', GUID(), nullable=False),
    sa.Column('fingerprint_sha256', sa.String(length=64), nullable=False),
    sa.Column('serial_number', sa.String(length=80), nullable=False),
    sa.Column('subject_dn', sa.String(length=500), nullable=False),
    sa.Column('issuer_dn', sa.String(length=500), nullable=False),
    sa.Column('not_before', sa.DateTime(timezone=True), nullable=False),
    sa.Column('not_after', sa.DateTime(timezone=True), nullable=False),
    sa.Column('certificate_pem', sa.Text(), nullable=False),
    sa.Column('status', sa.Enum('ACTIVE', 'REVOKED', name='dsccertstatus'), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('dsc_certificates', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_dsc_certificates_fingerprint_sha256'), ['fingerprint_sha256'], unique=True)
        batch_op.create_index(batch_op.f('ix_dsc_certificates_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_dsc_certificates_tenant_id'), ['tenant_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_dsc_certificates_user_id'), ['user_id'], unique=False)

    op.create_table('signing_requests',
    sa.Column('entity_type', sa.String(length=40), nullable=False),
    sa.Column('entity_id', sa.String(length=64), nullable=False),
    sa.Column('gate_id', sa.String(length=8), nullable=False),
    sa.Column('document_hash', sa.String(length=64), nullable=False),
    sa.Column('document_label', sa.String(length=200), nullable=False),
    sa.Column('requested_by', GUID(), nullable=False),
    sa.Column('signer_id', GUID(), nullable=False),
    sa.Column('preparer_id', GUID(), nullable=True),
    sa.Column('nonce', sa.String(length=64), nullable=False),
    sa.Column('status', sa.Enum('PENDING', 'SIGNED', 'REJECTED', 'EXPIRED', 'FAILED', name='signingstatus'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('signature_b64', sa.Text(), nullable=True),
    sa.Column('cert_fingerprint', sa.String(length=64), nullable=True),
    sa.Column('signed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('signer_device', sa.String(length=120), nullable=True),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('failure_reason', sa.String(length=300), nullable=True),
    sa.Column('audit_block_hash', sa.String(length=64), nullable=True),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('nonce')
    )
    with op.batch_alter_table('signing_requests', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_signing_requests_entity_id'), ['entity_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_signing_requests_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_signing_requests_signer_id'), ['signer_id'], unique=False)
        batch_op.create_index('ix_signing_requests_signer_status', ['signer_id', 'status'], unique=False)
        batch_op.create_index(batch_op.f('ix_signing_requests_tenant_id'), ['tenant_id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('signing_requests', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_signing_requests_tenant_id'))
        batch_op.drop_index('ix_signing_requests_signer_status')
        batch_op.drop_index(batch_op.f('ix_signing_requests_signer_id'))
        batch_op.drop_index(batch_op.f('ix_signing_requests_id'))
        batch_op.drop_index(batch_op.f('ix_signing_requests_entity_id'))

    op.drop_table('signing_requests')
    with op.batch_alter_table('dsc_certificates', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_dsc_certificates_user_id'))
        batch_op.drop_index(batch_op.f('ix_dsc_certificates_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_dsc_certificates_id'))
        batch_op.drop_index(batch_op.f('ix_dsc_certificates_fingerprint_sha256'))

    op.drop_table('dsc_certificates')

    if op.get_bind().dialect.name == "postgresql":
        for enum_name in ['dsccertstatus', 'signingstatus']:
            sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
