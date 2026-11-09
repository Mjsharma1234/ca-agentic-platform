"""Alembic environment.

The URL always comes from application settings so migrations run against exactly the
database the API uses. Async driver suffixes are normalised because migrations run on a
synchronous connection.
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.core.database import Base
from app import models  # noqa: F401  (registers every table on Base.metadata)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


# Physical-tuning indexes created by migration 0007 (PostgreSQL only) are not modelled on the ORM.
_PG_TUNING_INDEXES = {
    "ix_invoices_tenant_client_date", "ix_gst_returns_tenant_client_period", "ix_gate_decisions_tenant_created",
    "ix_firm_obligations_tenant_due", "ix_firm_obligations_tenant_state", "ix_firm_notices_tenant_hearing",
    "ix_firm_daybook_tenant_day", "ix_firm_gate_logs_tenant_decided", "ix_audit_ledger_tenant_created",
    "ix_signing_requests_tenant_status", "ix_signing_requests_tenant_expiry", "ix_signer_devices_tenant_active",
    "ix_dsc_certificates_tenant_user", "ix_clients_tenant_name_live", "ix_client_gstins_tenant_client",
    "ix_users_phone", "ix_client_gstins_client_id", "ix_otp_records_identifier_created", "ix_otp_records_expires",
    "brin_audit_ledger_created", "brin_audit_blocks_timestamp",
}


def include_object(obj, name, type_, reflected, compare_to):
    return not (type_ == "index" and reflected and name in _PG_TUNING_INDEXES)


def _sync_url() -> str:
    # Migrations need the schema owner; the API itself runs as the restricted role (DATABASE_URL).
    url = settings.DATABASE_ADMIN_URL or settings.DATABASE_URL
    replacements = {
        "sqlite+aiosqlite:": "sqlite:",
        "postgresql+asyncpg:": "postgresql+psycopg2:",
        "postgres://": "postgresql+psycopg2://",
    }
    for old, new in replacements.items():
        if url.startswith(old):
            url = url.replace(old, new, 1)
    return url


def run_migrations_offline() -> None:
    url = _sync_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=include_object,
        render_as_batch=url.startswith("sqlite"),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    cfg = config.get_section(config.config_ini_section) or {}
    cfg["sqlalchemy.url"] = _sync_url()
    connectable = engine_from_config(cfg, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
