-- One-time PostgreSQL provisioning for the CA platform. Run as a superuser / cloud admin, once per database,
-- BEFORE the first `alembic upgrade head`. Replace both passwords.
--
--   ca_owner  owns the schema; used ONLY by Alembic (DATABASE_ADMIN_URL). A table owner bypasses RLS.
--   ca_app    NOLOGIN, NOBYPASSRLS: the role every RLS policy targets (migration 0006 reuses it).
--   ca_api    the API's login role (DATABASE_URL): a member of ca_app and nothing else, so it can neither
--             bypass RLS nor SET ROLE to anything more powerful, even through injected SQL.

CREATE ROLE ca_app   NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE ca_owner LOGIN PASSWORD 'change-me-owner' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE ca_api   LOGIN PASSWORD 'change-me-api'   NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
GRANT ca_app TO ca_api;

-- ca_owner builds the tables; nobody else may create objects in public
GRANT CREATE, USAGE ON SCHEMA public TO ca_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- safety nets applied to every API session
ALTER ROLE ca_api SET statement_timeout = '30s';
ALTER ROLE ca_api SET lock_timeout = '10s';
ALTER ROLE ca_api SET idle_in_transaction_session_timeout = '60s';

-- Environment:
--   DATABASE_URL=postgresql://ca_api:...@host/db?sslmode=require        (the API)
--   DATABASE_ADMIN_URL=postgresql://ca_owner:...@host/db?sslmode=require (alembic only)
--   DB_APP_ROLE=ca_app
