# PostgreSQL — setup, security model and operations

SQLite stays the zero-setup dev default. Production runs on PostgreSQL 15+ (tested on 18).

## 1. Provision (once per database)

1. Run [`backend/db/provision_roles.sql`](../backend/db/provision_roles.sql) as a superuser/cloud admin (set both passwords first).
   It creates three roles:

   | Role | Login | Purpose |
   |---|---|---|
   | `ca_owner` | yes | owns the schema; used **only** by Alembic. Table owners bypass RLS |
   | `ca_app` | no | the role every RLS policy targets; no `BYPASSRLS`, owns nothing |
   | `ca_api` | yes | the API's login. Member of `ca_app` only, so injected SQL cannot escalate |

2. Set the environment:

   ```
   DATABASE_URL=postgresql://ca_api:…@host/db?sslmode=require
   DATABASE_ADMIN_URL=postgresql://ca_owner:…@host/db?sslmode=require   # alembic only
   DB_APP_ROLE=ca_app
   ```

3. `alembic upgrade head` (the Render start command already does this). Migrations 0006/0007 are PostgreSQL-only and a no-op on SQLite.

With `DEBUG=false` on PostgreSQL the app **refuses to start** unless `DB_APP_ROLE` is set, and at boot it checks the live
connection: superuser, `BYPASSRLS`, table ownership, a login role that merely `SET ROLE`d down, or any table without RLS all abort startup
(`app/core/db_security.py`).

## 2. How isolation works

* Every authenticated request pins its tenant: `get_current_user` runs `set_config('app.tenant_id', …, is_local => true)` once the JWT signature is verified.
  The setting is transaction-local, re-applied by an `after_begin` hook to each new transaction, and can never leak to the next request on a pooled connection.
* Every table has a `tenant_isolation` policy (`tenant_id = app_tenant_id()`, for reads **and** writes). A query with a forgotten `WHERE tenant_id = …` returns only the caller's rows, and
  inserting or moving a row into another tenant fails. **No context ⇒ zero rows.**
* The pre-login flows (OTP login, Firebase login, device grant) must find a user or device before any tenant is known. They use `get_system_db`, which sets `app.system = on`.
  That opens only `firms`, `users`, `otp_records`, `device_authorizations` and `signer_devices`; business data stays closed. The endpoint calls `enter_tenant()` the moment it has identified the caller.
* `audit_ledger` and `audit_blocks` are append-only: `ca_app` has no UPDATE/DELETE, and triggers block UPDATE, DELETE and TRUNCATE even for the owner.
* `ca_app` cannot alter schema, disable RLS, or read `alembic_version`.

**Adding a table?** Put it in the next migration with `ENABLE ROW LEVEL SECURITY`, a `tenant_isolation` policy and grants.
`tests/test_postgres_rls.py::test_every_table_is_row_level_secured` fails until you do.

## 3. Performance

* Every index leads with the tenant column (RLS adds `tenant_id = X` to every plan), `(SELECT app_tenant_id())` is evaluated once per statement, and live-row reads use partial indexes (`is_deleted = false`, `revoked_at IS NULL`).
* BRIN indexes on the append-only audit tables (≈1000× smaller than a B-tree; serves time-range scans).
* Aggressive autovacuum on churn-heavy tables (`otp_records`, `signer_devices`, `device_authorizations`, `firm_states`).
* Pool: `DB_POOL_SIZE` + `DB_MAX_OVERFLOW` per worker, `pool_pre_ping`, recycle every 30 min. Size so workers × (pool + overflow) stays below the server's `max_connections`, or put PgBouncer (transaction mode) in front: tenant settings are transaction-local, so it is safe.
* Guard rails per API session: `statement_timeout` 30 s, `lock_timeout` 10 s, `idle_in_transaction_session_timeout` 60 s, `application_name=ca-platform` for `pg_stat_activity`.

## 4. Verifying

```
TEST_POSTGRES_URL=postgresql://postgres:pw@localhost:5432/ca_test TEST_POSTGRES_WIPE=yes pytest tests/test_postgres_rls.py
```

⚠️ This **wipes the `public` schema** of that database. It covers: RLS on every table, tenant isolation for read/insert/update/delete, no-context-no-rows,
system scope limits, append-only audit (owner and app), the unprivileged role, index plans, and an end-to-end run of the real API (OTP login for two firms, client isolation,
and the DPoP-bound desktop-signer grant) against RLS.

## 5. Operations

* **Backups / PITR**: enable your provider's point-in-time recovery; the audit hash chain (`audit_blocks`) makes a restore verifiable.
* **Migrations**: run as `ca_owner` (`DATABASE_ADMIN_URL`), never as `ca_api`.
* **Break-glass reads** (support): connect as `ca_owner` and log it; do not add bypass flags to the API role.
* Existing deployments: run the provisioning script, switch `DATABASE_URL` to `ca_api`, then `alembic upgrade head`.

## 6. Supabase

Provisioned project `ca-agentic-platform` (`vhjqwvgpgxskmrtdzato`, ap-south-1, PostgreSQL 17). Supabase's `postgres` role is not a
superuser, so the roles from `provision_roles.sql` are created without altering it: `ca_owner` (migrations), `ca_api` (API), `ca_app`.
Connection strings live in the git-ignored `backend/.env.supabase`; load them with `set -a; . ./.env.supabase; set +a`.

* Run migrations with `DATABASE_URL="$DATABASE_ADMIN_URL" alembic upgrade head`.
* Tables are created by `ca_owner`, so Supabase's default grants to `anon` / `authenticated` / `service_role` never apply, and the Data API exposes nothing.
* `get_advisors(security)` is clean. Direct connection is IPv6-only on the free plan; use the session pooler (port 5432) from IPv4-only hosts such as Render.
* Never run `tests/test_postgres_rls.py` against this database: it wipes the `public` schema.
