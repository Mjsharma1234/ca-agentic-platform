"""drop the DSC and desktop-signer tables

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-16 09:00:00+00:00

The product no longer handles digital signature certificates or desktop signing, so the tables
created by migrations 0002, 0004 and 0005 are removed. Indexes, RLS policies and per-table
storage options go with the tables. The downgrade recreates the tables (and, on PostgreSQL,
the row-level-security state migrations 0006 and 0009 gave them) but not any data.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0012'
down_revision: Union[str, None] = '0011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APP_ROLE = "ca_app"
TABLES = ("signing_requests", "dsc_certificates", "signer_devices", "device_authorizations")
ENUMS = ("dsccertstatus", "signingstatus", "devicegrantstatus")


class GUID(sa.types.TypeDecorator):
    """Mirror of app.models.base.GUID, frozen here so the migration never drifts with app code:
    native UUID on PostgreSQL, CHAR(36) elsewhere."""
    impl = sa.CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(postgresql.UUID(as_uuid=True))
        return dialect.type_descriptor(sa.CHAR(36))


def _postgres() -> bool:
    return op.get_context().dialect.name == "postgresql"


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    for table in TABLES:
        if table in existing:
            op.drop_table(table)
    if _postgres():
        for name in ENUMS:
            sa.Enum(name=name).drop(op.get_bind(), checkfirst=True)


def _audit_columns():
    return [
        sa.Column('id', GUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('tenant_id', GUID(), nullable=False),
    ]


def downgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    if 'dsc_certificates' not in existing:
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
            *_audit_columns(),
            sa.PrimaryKeyConstraint('id'),
        )
        with op.batch_alter_table('dsc_certificates', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_dsc_certificates_fingerprint_sha256'), ['fingerprint_sha256'], unique=True)
            batch_op.create_index(batch_op.f('ix_dsc_certificates_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_dsc_certificates_tenant_id'), ['tenant_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_dsc_certificates_user_id'), ['user_id'], unique=False)

    if 'signing_requests' not in existing:
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
            *_audit_columns(),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('nonce'),
        )
        with op.batch_alter_table('signing_requests', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_signing_requests_entity_id'), ['entity_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_signing_requests_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_signing_requests_signer_id'), ['signer_id'], unique=False)
            batch_op.create_index('ix_signing_requests_signer_status', ['signer_id', 'status'], unique=False)
            batch_op.create_index(batch_op.f('ix_signing_requests_tenant_id'), ['tenant_id'], unique=False)

    if 'device_authorizations' not in existing:
        op.create_table('device_authorizations',
            sa.Column('device_code_hash', sa.String(length=64), nullable=False),
            sa.Column('user_code', sa.String(length=12), nullable=False),
            sa.Column('device_name', sa.String(length=120), nullable=False),
            sa.Column('status', sa.Enum('PENDING', 'APPROVED', 'DENIED', 'CONSUMED', name='devicegrantstatus'), nullable=False),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('approved_user_id', GUID(), nullable=True),
            sa.Column('last_polled_at', sa.DateTime(timezone=True), nullable=True),
            *_audit_columns(),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('device_code_hash'),
        )
        with op.batch_alter_table('device_authorizations', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_device_authorizations_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_device_authorizations_tenant_id'), ['tenant_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_device_authorizations_user_code'), ['user_code'], unique=False)

    if 'signer_devices' not in existing:
        op.create_table('signer_devices',
            sa.Column('user_id', GUID(), nullable=False),
            sa.Column('device_name', sa.String(length=120), nullable=False),
            sa.Column('refresh_hash', sa.String(length=64), nullable=False),
            sa.Column('previous_refresh_hash', sa.String(length=64), nullable=True),
            sa.Column('refresh_expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('dpop_jkt', sa.String(length=64), nullable=True),
            *_audit_columns(),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('refresh_hash'),
        )
        with op.batch_alter_table('signer_devices', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_signer_devices_id'), ['id'], unique=False)
            batch_op.create_index(batch_op.f('ix_signer_devices_tenant_id'), ['tenant_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_signer_devices_user_id'), ['user_id'], unique=False)

    if _postgres():
        # Restore the row-level-security state migrations 0006 and 0009 left these tables in.
        for table in ("dsc_certificates", "signing_requests"):
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
            op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
            op.execute(
                f"CREATE POLICY tenant_isolation ON {table} AS PERMISSIVE FOR ALL TO {APP_ROLE} "
                f"USING (tenant_id = (SELECT app_tenant_id())) WITH CHECK (tenant_id = (SELECT app_tenant_id()))"
            )
            op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")
        for table in ("device_authorizations", "signer_devices"):
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
            op.execute(f"DROP POLICY IF EXISTS tenant_or_system ON {table}")
            expr = "tenant_id = (SELECT app_tenant_id()) OR (SELECT app_is_system())"
            op.execute(
                f"CREATE POLICY tenant_or_system ON {table} AS PERMISSIVE FOR ALL TO {APP_ROLE} "
                f"USING ({expr}) WITH CHECK ({expr})"
            )
            op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")
