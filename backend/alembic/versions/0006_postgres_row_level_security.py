"""PostgreSQL row-level security, least-privilege app role and append-only audit tables

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-09 08:00:00+00:00

PostgreSQL only (a no-op on SQLite). The API connects as, or does SET ROLE to, `ca_app`: a role that
owns nothing and cannot bypass RLS. Every request pins `app.tenant_id` (see app/core/tenant_context.py)
and the policies below make a forgotten WHERE clause leak nothing. Identity tables also accept
`app.system = 'on'`, which only the pre-login code paths set.
"""
from typing import Sequence, Union

from alembic import op

revision: str = '0006'
down_revision: Union[str, None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APP_ROLE = "ca_app"

# table -> tenant column
TENANT_TABLES = {
    "audit_ledger": "tenant_id",
    "audit_blocks": "firm_id",
    "client_gstins": "tenant_id",
    "clients": "tenant_id",
    "device_authorizations": "tenant_id",
    "dsc_certificates": "tenant_id",
    "firm_daybook": "tenant_id",
    "firm_gate_logs": "tenant_id",
    "firm_notices": "tenant_id",
    "firm_obligations": "tenant_id",
    "firm_states": "tenant_id",
    "firms": "id",
    "gate_decisions": "tenant_id",
    "gst_returns": "tenant_id",
    "invoices": "tenant_id",
    "obligation_states": "tenant_id",
    "signer_devices": "tenant_id",
    "signing_requests": "tenant_id",
    "users": "firm_id",
}
# Tables the login / device-grant flow must reach before a tenant is known.
SYSTEM_TABLES = ["firms", "users", "device_authorizations", "signer_devices"]
# Tables with no tenant column: reachable only in system scope.
SYSTEM_ONLY_TABLES = ["otp_records"]
APPEND_ONLY = ["audit_ledger", "audit_blocks"]


def _postgres() -> bool:
    return op.get_context().dialect.name == "postgresql"


def upgrade() -> None:
    if not _postgres():
        return

    op.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
            END IF;
            BEGIN
                EXECUTE format('GRANT {APP_ROLE} TO %I', current_user);
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'could not grant {APP_ROLE} to %: %', current_user, SQLERRM;
            END;
        END $$;
    """)

    op.execute("""
        CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
        LANGUAGE sql STABLE PARALLEL SAFE
        AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean
        LANGUAGE sql STABLE PARALLEL SAFE
        AS $$ SELECT coalesce(current_setting('app.system', true), '') = 'on' $$;
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION app_forbid_change() RETURNS trigger
        LANGUAGE plpgsql
        AS $$ BEGIN RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
              USING ERRCODE = 'insufficient_privilege'; END $$;
    """)

    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}")
    op.execute(f"GRANT EXECUTE ON FUNCTION app_tenant_id(), app_is_system() TO {APP_ROLE}")

    for table, column in TENANT_TABLES.items():
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        # (SELECT fn()) makes the planner evaluate the setting once per statement, not per row.
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} AS PERMISSIVE FOR ALL TO {APP_ROLE} "
            f"USING ({column} = (SELECT app_tenant_id())) WITH CHECK ({column} = (SELECT app_tenant_id()))"
        )
        privileges = "SELECT, INSERT" if table in APPEND_ONLY else "SELECT, INSERT, UPDATE, DELETE"
        op.execute(f"GRANT {privileges} ON {table} TO {APP_ROLE}")

    for table in SYSTEM_TABLES + SYSTEM_ONLY_TABLES:
        if table in SYSTEM_ONLY_TABLES:
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
            op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")
        op.execute(f"DROP POLICY IF EXISTS system_scope ON {table}")
        op.execute(
            f"CREATE POLICY system_scope ON {table} AS PERMISSIVE FOR ALL TO {APP_ROLE} "
            f"USING ((SELECT app_is_system())) WITH CHECK ((SELECT app_is_system()))"
        )

    for table in APPEND_ONLY:
        op.execute(f"DROP TRIGGER IF EXISTS {table}_append_only ON {table}")
        op.execute(
            f"CREATE TRIGGER {table}_append_only BEFORE UPDATE OR DELETE ON {table} "
            f"FOR EACH ROW EXECUTE FUNCTION app_forbid_change()"
        )
        op.execute(f"DROP TRIGGER IF EXISTS {table}_no_truncate ON {table}")
        op.execute(
            f"CREATE TRIGGER {table}_no_truncate BEFORE TRUNCATE ON {table} "
            f"FOR EACH STATEMENT EXECUTE FUNCTION app_forbid_change()"
        )


def downgrade() -> None:
    if not _postgres():
        return
    for table in APPEND_ONLY:
        op.execute(f"DROP TRIGGER IF EXISTS {table}_no_truncate ON {table}")
        op.execute(f"DROP TRIGGER IF EXISTS {table}_append_only ON {table}")
    for table in SYSTEM_TABLES + SYSTEM_ONLY_TABLES:
        op.execute(f"DROP POLICY IF EXISTS system_scope ON {table}")
    for table in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON {table} FROM {APP_ROLE}")
    for table in SYSTEM_ONLY_TABLES:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON {table} FROM {APP_ROLE}")
    op.execute(f"REVOKE EXECUTE ON FUNCTION app_tenant_id(), app_is_system() FROM {APP_ROLE}")
    op.execute("DROP FUNCTION IF EXISTS app_forbid_change()")
    op.execute("DROP FUNCTION IF EXISTS app_is_system()")
    op.execute("DROP FUNCTION IF EXISTS app_tenant_id()")
    # The ca_app role is kept: it may own default privileges or grants made outside this migration.
