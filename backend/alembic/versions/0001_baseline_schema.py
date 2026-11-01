"""baseline schema

Revision ID: 0001
Revises: 
Create Date: 2026-11-01 06:30:28.606910+00:00
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


revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('audit_ledger',
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.Column('client_id', GUID(), nullable=False),
    sa.Column('agent_id', sa.String(), nullable=False),
    sa.Column('agent_version', sa.String(), nullable=False),
    sa.Column('action_type', sa.Enum('EXTRACTED', 'CLASSIFIED', 'MATCHED', 'PROPOSED', 'APPROVED', 'REJECTED', 'SIGNED', 'FILED', name='actiontype'), nullable=False),
    sa.Column('entity_type', sa.String(), nullable=False),
    sa.Column('entity_id', GUID(), nullable=False),
    sa.Column('input_hash', sa.String(), nullable=False),
    sa.Column('output_hash', sa.String(), nullable=False),
    sa.Column('output_snapshot', sa.JSON(), nullable=False),
    sa.Column('model_id', sa.String(), nullable=True),
    sa.Column('prompt_version', sa.String(), nullable=True),
    sa.Column('confidence_score', sa.Float(), nullable=True),
    sa.Column('gate_id', sa.String(), nullable=True),
    sa.Column('actor_id', GUID(), nullable=True),
    sa.Column('actor_role', sa.String(), nullable=True),
    sa.Column('metadata_', sa.JSON(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('audit_ledger', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_audit_ledger_client_id'), ['client_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_ledger_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_ledger_tenant_id'), ['tenant_id'], unique=False)

    op.create_table('clients',
    sa.Column('client_name', sa.String(), nullable=False),
    sa.Column('trade_name', sa.String(), nullable=True),
    sa.Column('pan', sa.String(length=10), nullable=False),
    sa.Column('gstin', sa.String(length=15), nullable=True),
    sa.Column('client_type', sa.Enum('INDIVIDUAL', 'HUF', 'PARTNERSHIP', 'LLP', 'COMPANY', 'TRUST', name='clienttype'), nullable=False),
    sa.Column('status', sa.Enum('ACTIVE', 'SUSPENDED', 'ONBOARDING', 'EXITED', name='clientstatus'), nullable=False),
    sa.Column('erp_type', sa.Enum('TALLY_PRIME', 'ZOHO_BOOKS', 'BUSY', 'SAP', 'MANUAL', name='erptype'), nullable=False),
    sa.Column('assigned_partner_id', GUID(), nullable=True),
    sa.Column('assigned_staff_id', GUID(), nullable=True),
    sa.Column('risk_tier', sa.Enum('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', name='risktier'), nullable=False),
    sa.Column('annual_turnover', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('is_composition', sa.Boolean(), nullable=True),
    sa.Column('financial_year_start', sa.String(), nullable=False),
    sa.Column('financial_year_end', sa.String(), nullable=False),
    sa.Column('emergency_bypass_active', sa.Boolean(), nullable=True),
    sa.Column('metadata_', sa.JSON(), nullable=True),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('clients', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_clients_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_clients_pan'), ['pan'], unique=False)
        batch_op.create_index(batch_op.f('ix_clients_tenant_id'), ['tenant_id'], unique=False)

    op.create_table('firm_daybook',
    sa.Column('day_date', sa.Date(), nullable=False),
    sa.Column('actor_id', sa.String(length=64), nullable=False),
    sa.Column('actor_name', sa.String(length=128), nullable=False),
    sa.Column('action_category', sa.String(length=32), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('ref_id', sa.String(length=64), nullable=True),
    sa.Column('sealed_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('metadata_', sa.JSON(), nullable=True),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('firm_daybook', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_firm_daybook_day_date'), ['day_date'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_daybook_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_daybook_tenant_id'), ['tenant_id'], unique=False)

    op.create_table('firm_gate_logs',
    sa.Column('gate_code', sa.String(length=8), nullable=False),
    sa.Column('gate_title', sa.String(length=128), nullable=False),
    sa.Column('item_id', sa.String(length=64), nullable=False),
    sa.Column('client_id', sa.String(length=64), nullable=False),
    sa.Column('action', sa.String(length=16), nullable=False),
    sa.Column('decided_by', sa.String(length=64), nullable=False),
    sa.Column('actor_role', sa.String(length=16), nullable=False),
    sa.Column('decision_notes', sa.Text(), nullable=True),
    sa.Column('four_eyes_verified', sa.Boolean(), nullable=True),
    sa.Column('preparer_id', sa.String(length=64), nullable=True),
    sa.Column('payload_hash', sa.String(length=64), nullable=False),
    sa.Column('signature_token', sa.String(length=128), nullable=True),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('metadata_', sa.JSON(), nullable=True),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('firm_gate_logs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_firm_gate_logs_client_id'), ['client_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_gate_logs_gate_code'), ['gate_code'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_gate_logs_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_gate_logs_item_id'), ['item_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_gate_logs_tenant_id'), ['tenant_id'], unique=False)

    op.create_table('firm_notices',
    sa.Column('client_id', sa.String(length=64), nullable=False),
    sa.Column('client_name', sa.String(length=128), nullable=True),
    sa.Column('domain', sa.String(length=16), nullable=False),
    sa.Column('notice_type', sa.String(length=32), nullable=False),
    sa.Column('notice_number', sa.String(length=64), nullable=False),
    sa.Column('section', sa.String(length=64), nullable=False),
    sa.Column('issuing_authority', sa.String(length=128), nullable=True),
    sa.Column('demand_amount', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('service_date', sa.Date(), nullable=False),
    sa.Column('statutory_hearing_date', sa.Date(), nullable=False),
    sa.Column('internal_buffer_date', sa.Date(), nullable=False),
    sa.Column('stage', sa.String(length=32), nullable=False),
    sa.Column('assigned_to', sa.String(length=64), nullable=True),
    sa.Column('partner_id', sa.String(length=64), nullable=True),
    sa.Column('reply_summary', sa.Text(), nullable=True),
    sa.Column('metadata_', sa.JSON(), nullable=True),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('firm_notices', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_firm_notices_client_id'), ['client_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_notices_domain'), ['domain'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_notices_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_notices_notice_type'), ['notice_type'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_notices_tenant_id'), ['tenant_id'], unique=False)

    op.create_table('firm_obligations',
    sa.Column('client_id', sa.String(length=64), nullable=False),
    sa.Column('client_name', sa.String(length=128), nullable=True),
    sa.Column('domain', sa.String(length=16), nullable=False),
    sa.Column('form_id', sa.String(length=32), nullable=False),
    sa.Column('period', sa.String(length=32), nullable=False),
    sa.Column('statutory_due_date', sa.Date(), nullable=False),
    sa.Column('internal_buffer_date', sa.Date(), nullable=True),
    sa.Column('state', sa.String(length=32), nullable=False),
    sa.Column('assigned_staff', sa.String(length=64), nullable=True),
    sa.Column('reviewer_staff', sa.String(length=64), nullable=True),
    sa.Column('signing_partner', sa.String(length=64), nullable=True),
    sa.Column('amount', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('tax_liability', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('itc_claimed', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('acknowledgement_ref', sa.String(length=64), nullable=True),
    sa.Column('filed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('metadata_', sa.JSON(), nullable=True),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('firm_obligations', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_firm_obligations_client_id'), ['client_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_obligations_domain'), ['domain'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_obligations_form_id'), ['form_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_obligations_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_obligations_state'), ['state'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_obligations_tenant_id'), ['tenant_id'], unique=False)

    op.create_table('firm_states',
    sa.Column('firm_id', sa.String(length=64), nullable=False),
    sa.Column('firm_name', sa.String(length=128), nullable=False),
    sa.Column('state_json', sa.JSON(), nullable=False),
    sa.Column('version', sa.String(length=32), nullable=False),
    sa.Column('last_synced_by', sa.String(length=64), nullable=False),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('firm_states', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_firm_states_firm_id'), ['firm_id'], unique=True)
        batch_op.create_index(batch_op.f('ix_firm_states_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_firm_states_tenant_id'), ['tenant_id'], unique=False)

    op.create_table('firms',
    sa.Column('id', GUID(), nullable=False),
    sa.Column('firm_code', sa.String(length=50), nullable=False),
    sa.Column('firm_name', sa.String(length=200), nullable=False),
    sa.Column('frn', sa.String(length=20), nullable=True),
    sa.Column('constitution', sa.String(length=30), nullable=True),
    sa.Column('plan_tier', sa.String(length=30), nullable=True),
    sa.Column('pan', sa.String(length=10), nullable=True),
    sa.Column('gstin', sa.String(length=15), nullable=True),
    sa.Column('head_office_city', sa.String(length=100), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=True),
    sa.Column('settings', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('firms', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_firms_firm_code'), ['firm_code'], unique=True)
        batch_op.create_index(batch_op.f('ix_firms_frn'), ['frn'], unique=True)
        batch_op.create_index(batch_op.f('ix_firms_id'), ['id'], unique=False)

    op.create_table('gate_decisions',
    sa.Column('client_id', GUID(), nullable=False),
    sa.Column('gate_id', sa.String(), nullable=False),
    sa.Column('gate_name', sa.String(), nullable=False),
    sa.Column('entity_type', sa.String(), nullable=False),
    sa.Column('entity_id', GUID(), nullable=False),
    sa.Column('status', sa.Enum('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED', 'TIMED_OUT', name='gatestatus'), nullable=False),
    sa.Column('tier', sa.Enum('L2_STAFF', 'L3_PARTNER', name='gatetier'), nullable=False),
    sa.Column('required_role', sa.Enum('STAFF', 'REVIEWER', 'MANAGER', 'PARTNER', name='requiredrole'), nullable=False),
    sa.Column('evidence_pack', sa.JSON(), nullable=True),
    sa.Column('assigned_to', GUID(), nullable=True),
    sa.Column('decided_by', GUID(), nullable=True),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('decision_notes', sa.String(), nullable=True),
    sa.Column('escalation_reason', sa.String(), nullable=True),
    sa.Column('sla_deadline', sa.DateTime(timezone=True), nullable=True),
    sa.Column('is_canary', sa.Boolean(), nullable=True),
    sa.Column('metadata_', sa.JSON(), nullable=True),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('gate_decisions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_gate_decisions_client_id'), ['client_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_gate_decisions_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_gate_decisions_tenant_id'), ['tenant_id'], unique=False)

    op.create_table('obligation_states',
    sa.Column('client_id', GUID(), nullable=False),
    sa.Column('gstin', sa.String(length=15), nullable=False),
    sa.Column('obligation_type', sa.Enum('GSTR1', 'GSTR1A', 'GSTR3B', 'TDS_RETURN', 'ITR', name='obligationtype'), nullable=False),
    sa.Column('period', sa.String(), nullable=False),
    sa.Column('state', sa.Enum('NOT_STARTED', 'DATA_COLLECTED', 'RECONCILED', 'RULES_CHECKED', 'REVIEW_PENDING', 'REVIEWED', 'SIGNING_PENDING', 'SIGNED', 'TRANSMITTING', 'FILED', 'ACKNOWLEDGED', 'FAILED', name='obligationfsmstate'), nullable=False),
    sa.Column('idempotency_key', sa.String(), nullable=True),
    sa.Column('locked_by', GUID(), nullable=True),
    sa.Column('locked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('current_gate', sa.String(), nullable=True),
    sa.Column('metadata_', sa.JSON(), nullable=True),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('idempotency_key')
    )
    with op.batch_alter_table('obligation_states', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_obligation_states_client_id'), ['client_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_obligation_states_gstin'), ['gstin'], unique=False)
        batch_op.create_index(batch_op.f('ix_obligation_states_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_obligation_states_tenant_id'), ['tenant_id'], unique=False)

    op.create_table('otp_records',
    sa.Column('id', GUID(), nullable=False),
    sa.Column('identifier', sa.String(length=150), nullable=False),
    sa.Column('otp_hash', sa.String(length=64), nullable=False),
    sa.Column('channel', sa.String(length=20), nullable=False),
    sa.Column('purpose', sa.String(length=50), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('max_attempts', sa.Integer(), nullable=False),
    sa.Column('is_verified', sa.Boolean(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('otp_records', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_otp_records_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_otp_records_identifier'), ['identifier'], unique=False)

    op.create_table('audit_blocks',
    sa.Column('id', GUID(), nullable=False),
    sa.Column('firm_id', GUID(), nullable=False),
    sa.Column('sequence', sa.Integer(), nullable=False),
    sa.Column('prev_hash', sa.String(length=64), nullable=False),
    sa.Column('block_hash', sa.String(length=64), nullable=False),
    sa.Column('actor_id', sa.String(length=100), nullable=False),
    sa.Column('actor_role', sa.String(length=50), nullable=False),
    sa.Column('action', sa.String(length=100), nullable=False),
    sa.Column('entity_type', sa.String(length=100), nullable=False),
    sa.Column('entity_id', sa.String(length=100), nullable=False),
    sa.Column('payload_json', sa.JSON(), nullable=True),
    sa.Column('timestamp', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['firm_id'], ['firms.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('audit_blocks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_audit_blocks_block_hash'), ['block_hash'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_blocks_firm_id'), ['firm_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_blocks_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_blocks_sequence'), ['sequence'], unique=False)

    op.create_table('client_gstins',
    sa.Column('client_id', GUID(), nullable=False),
    sa.Column('gstin', sa.String(length=15), nullable=False),
    sa.Column('state_code', sa.String(length=2), nullable=False),
    sa.Column('registration_date', sa.String(), nullable=True),
    sa.Column('status', sa.Enum('ACTIVE', 'SUSPENDED', 'CANCELLED', name='gstinstatus'), nullable=False),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('client_gstins', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_client_gstins_gstin'), ['gstin'], unique=True)
        batch_op.create_index(batch_op.f('ix_client_gstins_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_client_gstins_tenant_id'), ['tenant_id'], unique=False)

    op.create_table('gst_returns',
    sa.Column('client_id', GUID(), nullable=False),
    sa.Column('gstin', sa.String(length=15), nullable=False),
    sa.Column('return_type', sa.Enum('GSTR1', 'GSTR1A', 'GSTR3B', 'GSTR9', 'GSTR9C', name='returntype'), nullable=False),
    sa.Column('period', sa.String(), nullable=False),
    sa.Column('financial_year', sa.String(), nullable=False),
    sa.Column('status', sa.Enum('DRAFT', 'RULES_CHECKED', 'REVIEW_PENDING', 'REVIEWED', 'SIGNING_PENDING', 'SIGNED', 'FILED', 'ACKNOWLEDGED', name='returnstatus'), nullable=False),
    sa.Column('total_taxable_outward', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('total_tax_liability', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('total_itc_claimed', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('net_tax_payable', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('late_fee', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('interest_sec50', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('payload_json', sa.JSON(), nullable=True),
    sa.Column('payload_hash', sa.String(), nullable=True),
    sa.Column('idempotency_key', sa.String(), nullable=True),
    sa.Column('rule_check_results', sa.JSON(), nullable=True),
    sa.Column('variance_memo', sa.String(), nullable=True),
    sa.Column('preparer_id', GUID(), nullable=True),
    sa.Column('reviewer_id', GUID(), nullable=True),
    sa.Column('signing_partner_id', GUID(), nullable=True),
    sa.Column('arn', sa.String(), nullable=True),
    sa.Column('filed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('due_date', sa.Date(), nullable=True),
    sa.Column('metadata_', sa.JSON(), nullable=True),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('idempotency_key')
    )
    with op.batch_alter_table('gst_returns', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_gst_returns_client_id'), ['client_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_gst_returns_gstin'), ['gstin'], unique=False)
        batch_op.create_index(batch_op.f('ix_gst_returns_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_gst_returns_tenant_id'), ['tenant_id'], unique=False)

    op.create_table('invoices',
    sa.Column('client_id', GUID(), nullable=False),
    sa.Column('gstin', sa.String(length=15), nullable=False),
    sa.Column('direction', sa.Enum('INWARD', 'OUTWARD', name='invoicedirection'), nullable=False),
    sa.Column('invoice_number', sa.String(), nullable=False),
    sa.Column('invoice_date', sa.String(), nullable=False),
    sa.Column('supplier_gstin', sa.String(length=15), nullable=True),
    sa.Column('supplier_name', sa.String(), nullable=True),
    sa.Column('buyer_gstin', sa.String(length=15), nullable=True),
    sa.Column('buyer_name', sa.String(), nullable=True),
    sa.Column('taxable_value', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('cgst', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('sgst', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('igst', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('cess', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('total_value', sa.Numeric(precision=15, scale=2), nullable=True),
    sa.Column('hsn_code', sa.String(), nullable=True),
    sa.Column('sac_code', sa.String(), nullable=True),
    sa.Column('place_of_supply', sa.String(length=2), nullable=True),
    sa.Column('reverse_charge', sa.Boolean(), nullable=True),
    sa.Column('source', sa.Enum('WABA_PHOTO', 'EMAIL_PDF', 'ERP_SYNC', 'PORTAL_UPLOAD', 'GSP_2B', 'GSP_IMS', name='invoicesource'), nullable=False),
    sa.Column('extraction_confidence', sa.Float(), nullable=True),
    sa.Column('ims_status', sa.Enum('PENDING', 'ACCEPTED', 'REJECTED', 'ON_HOLD', name='imsstatus'), nullable=True),
    sa.Column('ims_proposed_by', sa.String(), nullable=True),
    sa.Column('ims_committed_by', GUID(), nullable=True),
    sa.Column('vendor_risk_score', sa.Float(), nullable=True),
    sa.Column('matched_2b', sa.Boolean(), nullable=True),
    sa.Column('itc_eligible', sa.Boolean(), nullable=True),
    sa.Column('itc_blocked_reason', sa.String(), nullable=True),
    sa.Column('rule_37_aging_days', sa.Integer(), nullable=True),
    sa.Column('document_hash', sa.String(), nullable=True),
    sa.Column('raw_document_url', sa.String(), nullable=True),
    sa.Column('status', sa.Enum('DRAFT', 'EXTRACTED', 'VERIFIED', 'CLASSIFIED', 'MATCHED', 'IN_RETURN', 'FILED', name='invoicestatus'), nullable=False),
    sa.Column('metadata_', sa.JSON(), nullable=True),
    sa.Column('id', GUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('tenant_id', GUID(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_invoices_client_id'), ['client_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_invoices_gstin'), ['gstin'], unique=False)
        batch_op.create_index(batch_op.f('ix_invoices_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_invoices_tenant_id'), ['tenant_id'], unique=False)

    op.create_table('users',
    sa.Column('id', GUID(), nullable=False),
    sa.Column('firm_id', GUID(), nullable=False),
    sa.Column('email', sa.String(length=150), nullable=False),
    sa.Column('full_name', sa.String(length=150), nullable=False),
    sa.Column('role', sa.String(length=30), nullable=False),
    sa.Column('membership_no', sa.String(length=20), nullable=True),
    sa.Column('hashed_password', sa.String(length=255), nullable=False),
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=True),
    sa.Column('mfa_enabled', sa.Boolean(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['firm_id'], ['firms.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)
        batch_op.create_index(batch_op.f('ix_users_firm_id'), ['firm_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_users_id'), ['id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_id'))
        batch_op.drop_index(batch_op.f('ix_users_firm_id'))
        batch_op.drop_index(batch_op.f('ix_users_email'))

    op.drop_table('users')
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_invoices_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_invoices_id'))
        batch_op.drop_index(batch_op.f('ix_invoices_gstin'))
        batch_op.drop_index(batch_op.f('ix_invoices_client_id'))

    op.drop_table('invoices')
    with op.batch_alter_table('gst_returns', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_gst_returns_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_gst_returns_id'))
        batch_op.drop_index(batch_op.f('ix_gst_returns_gstin'))
        batch_op.drop_index(batch_op.f('ix_gst_returns_client_id'))

    op.drop_table('gst_returns')
    with op.batch_alter_table('client_gstins', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_client_gstins_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_client_gstins_id'))
        batch_op.drop_index(batch_op.f('ix_client_gstins_gstin'))

    op.drop_table('client_gstins')
    with op.batch_alter_table('audit_blocks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_audit_blocks_sequence'))
        batch_op.drop_index(batch_op.f('ix_audit_blocks_id'))
        batch_op.drop_index(batch_op.f('ix_audit_blocks_firm_id'))
        batch_op.drop_index(batch_op.f('ix_audit_blocks_block_hash'))

    op.drop_table('audit_blocks')
    with op.batch_alter_table('otp_records', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_otp_records_identifier'))
        batch_op.drop_index(batch_op.f('ix_otp_records_id'))

    op.drop_table('otp_records')
    with op.batch_alter_table('obligation_states', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_obligation_states_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_obligation_states_id'))
        batch_op.drop_index(batch_op.f('ix_obligation_states_gstin'))
        batch_op.drop_index(batch_op.f('ix_obligation_states_client_id'))

    op.drop_table('obligation_states')
    with op.batch_alter_table('gate_decisions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_gate_decisions_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_gate_decisions_id'))
        batch_op.drop_index(batch_op.f('ix_gate_decisions_client_id'))

    op.drop_table('gate_decisions')
    with op.batch_alter_table('firms', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_firms_id'))
        batch_op.drop_index(batch_op.f('ix_firms_frn'))
        batch_op.drop_index(batch_op.f('ix_firms_firm_code'))

    op.drop_table('firms')
    with op.batch_alter_table('firm_states', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_firm_states_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_firm_states_id'))
        batch_op.drop_index(batch_op.f('ix_firm_states_firm_id'))

    op.drop_table('firm_states')
    with op.batch_alter_table('firm_obligations', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_firm_obligations_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_firm_obligations_state'))
        batch_op.drop_index(batch_op.f('ix_firm_obligations_id'))
        batch_op.drop_index(batch_op.f('ix_firm_obligations_form_id'))
        batch_op.drop_index(batch_op.f('ix_firm_obligations_domain'))
        batch_op.drop_index(batch_op.f('ix_firm_obligations_client_id'))

    op.drop_table('firm_obligations')
    with op.batch_alter_table('firm_notices', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_firm_notices_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_firm_notices_notice_type'))
        batch_op.drop_index(batch_op.f('ix_firm_notices_id'))
        batch_op.drop_index(batch_op.f('ix_firm_notices_domain'))
        batch_op.drop_index(batch_op.f('ix_firm_notices_client_id'))

    op.drop_table('firm_notices')
    with op.batch_alter_table('firm_gate_logs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_firm_gate_logs_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_firm_gate_logs_item_id'))
        batch_op.drop_index(batch_op.f('ix_firm_gate_logs_id'))
        batch_op.drop_index(batch_op.f('ix_firm_gate_logs_gate_code'))
        batch_op.drop_index(batch_op.f('ix_firm_gate_logs_client_id'))

    op.drop_table('firm_gate_logs')
    with op.batch_alter_table('firm_daybook', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_firm_daybook_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_firm_daybook_id'))
        batch_op.drop_index(batch_op.f('ix_firm_daybook_day_date'))

    op.drop_table('firm_daybook')
    with op.batch_alter_table('clients', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_clients_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_clients_pan'))
        batch_op.drop_index(batch_op.f('ix_clients_id'))

    op.drop_table('clients')
    with op.batch_alter_table('audit_ledger', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_audit_ledger_tenant_id'))
        batch_op.drop_index(batch_op.f('ix_audit_ledger_id'))
        batch_op.drop_index(batch_op.f('ix_audit_ledger_client_id'))

    op.drop_table('audit_ledger')

    if op.get_bind().dialect.name == "postgresql":
        for enum_name in ['actiontype', 'clientstatus', 'clienttype', 'erptype', 'gatestatus', 'gatetier', 'gstinstatus', 'imsstatus', 'invoicedirection', 'invoicesource', 'invoicestatus', 'obligationfsmstate', 'obligationtype', 'requiredrole', 'returnstatus', 'returntype', 'risktier']:
            sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
