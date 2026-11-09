"""Row-level security, least privilege and append-only audit, proven on a real PostgreSQL.

Skipped unless TEST_POSTGRES_URL points at a throw-away PostgreSQL superuser/owner connection. The
test DESTROYS the data in every table (alembic downgrade base, then upgrade head), so it also requires TEST_POSTGRES_WIPE=yes:

    TEST_POSTGRES_URL=postgresql://postgres:pw@localhost:5432/ca_test TEST_POSTGRES_WIPE=yes pytest tests/test_postgres_rls.py

PostgreSQL 15+ is expected (also verified on PGlite 0.5 / PostgreSQL 18, which allows one connection at
a time; every helper below therefore opens and closes its connection).
"""
import os
import socket
import subprocess
import sys
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

import base64
import hashlib

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError, ProgrammingError

URL = os.getenv("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(
    not URL or os.getenv("TEST_POSTGRES_WIPE") != "yes",
    reason="set TEST_POSTGRES_URL and TEST_POSTGRES_WIPE=yes to run against a throw-away PostgreSQL",
)

BACKEND = Path(__file__).resolve().parents[1]
FIRM_A = uuid.UUID("aaaaaaaa-0000-0000-0000-00000000000a")
FIRM_B = uuid.UUID("bbbbbbbb-0000-0000-0000-00000000000b")
USER_A = uuid.UUID("aaaaaaaa-0000-0000-0000-0000000000a1")
USER_B = uuid.UUID("bbbbbbbb-0000-0000-0000-0000000000b1")
APP_ROLE = "ca_app"


@contextmanager
def owner():
    engine = create_engine(URL)
    try:
        with engine.begin() as conn:
            conn.execute(text("RESET ROLE"))  # PGlite shares one backend session across connections
            yield conn
    finally:
        engine.dispose()


@contextmanager
def app(monkeypatch=None, tenant=None, system=False, commit=False):
    """A connection exactly as the API opens one: restricted role, tenant pinned per transaction."""
    from app.core import database
    from app.core.config import settings

    previous = settings.DB_APP_ROLE
    settings.DB_APP_ROLE = APP_ROLE
    try:
        engine = database._build_engine(URL, restricted=True)
    finally:
        settings.DB_APP_ROLE = previous
    conn = engine.connect()
    trans = conn.begin()
    try:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :t, true), set_config('app.system', :s, true)"),
            {"t": str(tenant) if tenant else "", "s": "on" if system else "off"},
        )
        yield conn
        if commit:
            trans.commit()
    finally:
        if trans.is_active:
            trans.rollback()
        conn.close()
        engine.dispose()


@pytest.fixture(scope="module", autouse=True)
def database():
    env = {**os.environ, "DATABASE_URL": URL, "DATABASE_ADMIN_URL": "", "DB_APP_ROLE": ""}
    # Reset through the migrations themselves (downgrade, then upgrade): works for a schema owner that does not
    # own the `public` schema (Supabase) and leaves roles and schema grants untouched.
    for args in (["downgrade", "base"], ["upgrade", "head"]):
        result = subprocess.run(
            [sys.executable, "-m", "alembic", *args], cwd=BACKEND, env=env, capture_output=True, text=True
        )
        assert result.returncode == 0, result.stderr[-2000:]
    with owner() as conn:
        for fid, name, code in ((FIRM_A, "Firm A", "firm-a"), (FIRM_B, "Firm B", "firm-b")):
            conn.execute(
                text("INSERT INTO firms (id, firm_code, firm_name) VALUES (:i, :c, :n)"),
                {"i": fid, "c": code, "n": name},
            )
        for uid, fid, email in ((USER_A, FIRM_A, "a@firm-a.in"), (USER_B, FIRM_B, "b@firm-b.in")):
            conn.execute(
                text(
                    "INSERT INTO users (id, firm_id, email, full_name, role, hashed_password, is_active) "
                    "VALUES (:i, :f, :e, 'Partner', 'PARTNER', 'x', true)"
                ),
                {"i": uid, "f": fid, "e": email},
            )
        for fid, pan in ((FIRM_A, "AAAPA0001A"), (FIRM_B, "BBBPB0002B")):
            conn.execute(
                text(
                    "INSERT INTO clients (id, tenant_id, created_at, updated_at, client_name, pan, client_type, status, "
                    "erp_type, risk_tier, financial_year_start, financial_year_end, is_deleted) "
                    "VALUES (gen_random_uuid(), :t, now(), now(), :n, :p, 'COMPANY', 'ACTIVE', 'MANUAL', 'LOW', "
                    "'2026-04-01', '2027-03-31', false)"
                ),
                {"t": fid, "n": f"Client of {pan}", "p": pan},
            )
        for fid in (FIRM_A, FIRM_B):
            conn.execute(
                text(
                    "INSERT INTO audit_blocks (id, firm_id, sequence, prev_hash, block_hash, actor_id, actor_role, "
                    "action, entity_type, entity_id, payload_json, timestamp) VALUES (gen_random_uuid(), :f, 1, "
                    "'0', :h, 'u', 'PARTNER', 'TEST', 'T', '1', '{}', now())"
                ),
                {"f": fid, "h": uuid.uuid4().hex},
            )
    yield


# --- coverage -----------------------------------------------------------------------------------

def test_every_table_is_row_level_secured():
    from app.core.database import Base
    from app import models  # noqa: F401

    with owner() as conn:
        secured = {r[0] for r in conn.execute(text(
            "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "WHERE n.nspname='public' AND relkind='r' AND relrowsecurity"
        ))}
    missing = set(Base.metadata.tables) - secured
    assert not missing, f"tables without RLS (add them to migration 0006 or a new migration): {sorted(missing)}"


def test_app_role_is_unprivileged():
    with owner() as conn:
        row = conn.execute(text(
            "SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin FROM pg_roles WHERE rolname=:r"
        ), {"r": APP_ROLE}).one()
        owned = conn.execute(text("SELECT count(*) FROM pg_tables WHERE tableowner=:r"), {"r": APP_ROLE}).scalar_one()
    assert tuple(row) == (False, False, False, False, False)
    assert owned == 0


def test_posture_check_distinguishes_owner_from_app_role():
    from app.core.db_security import rls_problems

    owner_engine = create_engine(URL)
    with owner_engine.begin() as conn:
        conn.execute(text("RESET ROLE"))
    try:
        assert rls_problems(owner_engine), "superuser/owner connection must be reported"
    finally:
        owner_engine.dispose()

    from app.core import database
    from app.core.config import settings

    settings.DB_APP_ROLE = APP_ROLE
    try:
        app_engine = database._build_engine(URL, restricted=True)
    finally:
        settings.DB_APP_ROLE = None
    try:
        # PGlite logs in as a superuser and only SET ROLEs down, which the check rightly calls out; a real
        # deployment connects as a dedicated login role (db/provision_roles.sql) and gets an empty list.
        problems = rls_problems(app_engine)
        assert all("session) user" in p for p in problems), problems
    finally:
        app_engine.dispose()


# --- tenant isolation ---------------------------------------------------------------------------

def test_tenant_sees_only_its_own_rows():
    with app(tenant=FIRM_A) as c:
        assert {r[0] for r in c.execute(text("SELECT tenant_id FROM clients"))} == {FIRM_A}
        assert c.execute(text("SELECT count(*) FROM audit_blocks")).scalar_one() == 1
        assert [r[0] for r in c.execute(text("SELECT id FROM firms"))] == [FIRM_A]
        assert [r[0] for r in c.execute(text("SELECT id FROM users"))] == [USER_A]
    with app(tenant=FIRM_B) as c:
        assert {r[0] for r in c.execute(text("SELECT tenant_id FROM clients"))} == {FIRM_B}


def test_no_tenant_context_means_no_rows():
    with app() as c:
        for table in ("clients", "users", "firms", "audit_blocks", "invoices", "signer_devices", "otp_records"):
            assert c.execute(text(f"SELECT count(*) FROM {table}")).scalar_one() == 0, table


def test_cannot_write_into_another_tenant():
    with app(tenant=FIRM_A) as c:
        with pytest.raises(DBAPIError, match="row-level security"):
            c.execute(text(
                "INSERT INTO clients (id, tenant_id, created_at, updated_at, client_name, pan, client_type, status, "
                "erp_type, risk_tier, financial_year_start, financial_year_end, is_deleted) VALUES "
                "(gen_random_uuid(), :t, now(), now(), 'x', 'XXXPX0000X', 'COMPANY', 'ACTIVE', 'MANUAL', 'LOW', "
                "'a', 'b', false)"
            ), {"t": FIRM_B})


def test_cannot_update_or_delete_another_tenants_rows():
    with app(tenant=FIRM_A) as c:
        assert c.execute(text("UPDATE clients SET client_name='pwned' WHERE tenant_id=:t"), {"t": FIRM_B}).rowcount == 0
        assert c.execute(text("DELETE FROM clients WHERE tenant_id=:t"), {"t": FIRM_B}).rowcount == 0
        # moving a row to another tenant is blocked too (the new row must still satisfy the policy)
        with pytest.raises(DBAPIError, match="row-level security"):
            c.execute(text("UPDATE clients SET tenant_id=:b WHERE tenant_id=:a"), {"a": FIRM_A, "b": FIRM_B})


def test_where_clause_free_query_cannot_leak():
    """The whole point of RLS: a handler that forgets its tenant filter still returns only its own data."""
    with app(tenant=FIRM_B) as c:
        names = [r[0] for r in c.execute(text("SELECT client_name FROM clients"))]
    assert names == ["Client of BBBPB0002B"]


def test_tenant_setting_does_not_outlive_its_transaction():
    from app.core import database
    from app.core.config import settings

    settings.DB_APP_ROLE = APP_ROLE
    try:
        engine = database._build_engine(URL, restricted=True)
    finally:
        settings.DB_APP_ROLE = None
    try:
        with engine.connect() as conn:
            with conn.begin():
                conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": str(FIRM_A)})
                assert conn.execute(text("SELECT count(*) FROM clients")).scalar_one() == 1
            # next transaction on the same pooled connection: context is gone
            assert conn.execute(text("SELECT count(*) FROM clients")).scalar_one() == 0
    finally:
        engine.dispose()


# --- system scope -------------------------------------------------------------------------------

def test_system_scope_opens_identity_tables_only():
    with app(system=True) as c:
        assert c.execute(text("SELECT count(*) FROM users")).scalar_one() == 2
        assert c.execute(text("SELECT count(*) FROM firms")).scalar_one() == 2
        assert c.execute(text("SELECT count(*) FROM otp_records")).scalar_one() == 0  # reachable, just empty
        for table in ("clients", "audit_blocks", "invoices", "gst_returns", "firm_obligations", "dsc_certificates"):
            assert c.execute(text(f"SELECT count(*) FROM {table}")).scalar_one() == 0, table


def test_system_scope_cannot_write_business_data():
    with app(system=True) as c:
        with pytest.raises(DBAPIError, match="row-level security"):
            c.execute(text(
                "INSERT INTO clients (id, tenant_id, created_at, updated_at, client_name, pan, client_type, status, "
                "erp_type, risk_tier, financial_year_start, financial_year_end, is_deleted) VALUES "
                "(gen_random_uuid(), :t, now(), now(), 'x', 'XXXPX0000X', 'COMPANY', 'ACTIVE', 'MANUAL', 'LOW', "
                "'a', 'b', false)"
            ), {"t": FIRM_A})


# --- append-only audit --------------------------------------------------------------------------

@pytest.mark.parametrize("statement", [
    "UPDATE audit_blocks SET action='FORGED'",
    "DELETE FROM audit_blocks",
    "TRUNCATE audit_blocks",
])
def test_audit_chain_is_append_only_even_for_the_owner(statement):
    with pytest.raises(DBAPIError, match="append-only"):
        with owner() as conn:
            conn.execute(text(statement))


def test_audit_chain_is_append_only_for_the_app_role():
    with app(tenant=FIRM_A) as c:
        with pytest.raises(DBAPIError, match="permission denied|append-only"):
            c.execute(text("UPDATE audit_blocks SET action='FORGED'"))
    with app(tenant=FIRM_A) as c:
        with pytest.raises(DBAPIError, match="permission denied|append-only"):
            c.execute(text("DELETE FROM audit_blocks"))


def test_app_can_still_append_to_its_own_chain():
    with app(tenant=FIRM_A, commit=True) as c:
        c.execute(text(
            "INSERT INTO audit_blocks (id, firm_id, sequence, prev_hash, block_hash, actor_id, actor_role, action, "
            "entity_type, entity_id, payload_json, timestamp) VALUES (gen_random_uuid(), :f, 2, '1', :h, 'u', "
            "'PARTNER', 'TEST2', 'T', '1', '{}', now())"
        ), {"f": FIRM_A, "h": uuid.uuid4().hex})
    with app(tenant=FIRM_A) as c:
        assert c.execute(text("SELECT count(*) FROM audit_blocks")).scalar_one() == 2
    with app(tenant=FIRM_B) as c:
        assert c.execute(text("SELECT count(*) FROM audit_blocks")).scalar_one() == 1


def test_app_role_cannot_change_schema_or_role():
    with app(tenant=FIRM_A) as c:
        with pytest.raises(DBAPIError, match="permission denied|must be owner"):
            c.execute(text("ALTER TABLE clients DISABLE ROW LEVEL SECURITY"))
    with app(tenant=FIRM_A) as c:
        with pytest.raises(DBAPIError, match="permission denied"):
            c.execute(text("SELECT * FROM alembic_version"))


# --- performance --------------------------------------------------------------------------------

def test_tenant_queries_use_tenant_leading_indexes():
    with owner() as conn:
        names = {r[0] for r in conn.execute(text("SELECT indexname FROM pg_indexes WHERE schemaname='public'"))}
    for expected in (
        "ix_invoices_tenant_client_date", "ix_firm_obligations_tenant_due", "ix_signing_requests_tenant_status",
        "ix_clients_tenant_name_live", "brin_audit_ledger_created", "ix_users_phone",
    ):
        assert expected in names


def test_rls_policy_is_planned_as_an_index_condition():
    """RLS must not force sequential scans: with data present the tenant predicate hits an index."""
    with owner() as conn:
        conn.execute(text("""
            INSERT INTO clients (id, tenant_id, created_at, updated_at, client_name, pan, client_type, status,
                erp_type, risk_tier, financial_year_start, financial_year_end, is_deleted)
            SELECT gen_random_uuid(), :t, now(), now(), 'bulk ' || g, 'BULKP' || lpad(g::text, 4, '0') || 'Z',
                'COMPANY', 'ACTIVE', 'MANUAL', 'LOW', 'a', 'b', false FROM generate_series(1, 3000) g
        """), {"t": FIRM_B})
        conn.execute(text("ANALYZE clients"))
    with app(tenant=FIRM_A) as c:
        plan = "\n".join(r[0] for r in c.execute(text("EXPLAIN SELECT * FROM clients WHERE is_deleted = false ORDER BY client_name")))
    assert "Index" in plan, plan
    with owner() as conn:
        conn.execute(text("DELETE FROM clients WHERE client_name LIKE 'bulk %'"))


# --- the real API on a real PostgreSQL ----------------------------------------------------------

def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_api_end_to_end_isolates_firms_on_postgres():
    port = _free_port()
    env = {
        **os.environ, "DATABASE_URL": URL, "DATABASE_ADMIN_URL": URL, "DB_APP_ROLE": APP_ROLE,
        "DEBUG": "true", "OTP_SANDBOX_MODE": "true", "AUTO_CREATE_TABLES": "false",
        "DB_POOL_SIZE": "1", "DB_MAX_OVERFLOW": "0", "SECRET_KEY": "x" * 48, "PYTHONUNBUFFERED": "1",
    }
    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(port), "--log-level", "warning"],
        cwd=BACKEND, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    base = f"http://127.0.0.1:{port}/api/v1"
    try:
        client = httpx.Client(base_url=base, timeout=30)
        deadline = time.time() + 60
        while True:
            try:
                if client.get("/health").status_code == 200:
                    break
            except httpx.TransportError:
                pass
            assert server.poll() is None, server.stdout.read()
            assert time.time() < deadline, "server did not start"
            time.sleep(0.5)

        def login(email: str) -> dict:
            sent = client.post("/auth/otp/send", json={"identifier": email, "channel": "EMAIL"})
            assert sent.status_code == 200, sent.text
            otp = sent.json().get("dev_otp")
            assert otp, sent.json()
            verified = client.post("/auth/otp/verify", json={"identifier": email, "otp": otp})
            assert verified.status_code == 200, verified.text
            return {"Authorization": f"Bearer {verified.json()['access_token']}"}

        head_a, head_b = login("a@firm-a.in"), login("b@firm-b.in")

        created = client.post("/clients/", headers=head_a, json={"name": "Only A Ltd", "pan": "AAAPA9999A"})
        assert created.status_code == 201, created.text
        client_id = created.json()["id"]

        names_a = {c["name"] for c in client.get("/clients/", headers=head_a).json()}
        names_b = {c["name"] for c in client.get("/clients/", headers=head_b).json()}
        assert "Only A Ltd" in names_a and "Client of AAAPA0001A" in names_a
        assert names_b == {"Client of BBBPB0002B"}
        assert client.get(f"/clients/{client_id}", headers=head_b).status_code == 404
        assert client.get("/clients/", headers={}).status_code == 401

        # Desktop-signer device grant: pre-login (system scope) -> approval -> DPoP-bound tokens -> signing API
        key = ec.generate_private_key(ec.SECP256R1())
        numbers = key.public_key().public_numbers()
        b64 = lambda raw: base64.urlsafe_b64encode(raw).rstrip(b"=").decode()  # noqa: E731
        jwk = {"kty": "EC", "crv": "P-256", "x": b64(numbers.x.to_bytes(32, "big")), "y": b64(numbers.y.to_bytes(32, "big"))}

        def proof(method: str, path: str, access: str = "") -> str:
            claims = {"jti": uuid.uuid4().hex, "htm": method, "htu": base + path, "iat": int(time.time())}
            if access:
                claims["ath"] = b64(hashlib.sha256(access.encode()).digest())
            return jwt.encode(claims, key, algorithm="ES256", headers={"typ": "dpop+jwt", "jwk": jwk})

        code = client.post("/signing/device/code", json={"device_name": "E2E signer 1.0"})
        assert code.status_code == 200, code.text
        approved = client.post(
            "/signing/device/approve", headers=head_a, json={"user_code": code.json()["user_code"], "approve": True}
        )
        assert approved.status_code == 200, approved.text
        token = client.post(
            "/signing/device/token", json={"device_code": code.json()["device_code"]},
            headers={"DPoP": proof("POST", "/signing/device/token")},
        )
        assert token.status_code == 200, token.text
        access, refresh = token.json()["access_token"], token.json()["refresh_token"]
        pending = client.get(
            "/signing/requests/pending",
            headers={"Authorization": f"Bearer {access}", "DPoP": proof("GET", "/signing/requests/pending", access)},
        )
        assert pending.status_code == 200, pending.text
        assert client.get("/signing/requests/pending", headers={"Authorization": f"Bearer {access}"}).status_code == 401
        rotated = client.post(
            "/signing/device/refresh", json={"refresh_token": refresh},
            headers={"DPoP": proof("POST", "/signing/device/refresh")},
        )
        assert rotated.status_code == 200, rotated.text
        assert len(client.get("/signing/devices", headers=head_a).json()) == 1
        assert client.get("/signing/devices", headers=head_b).json() == []
    finally:
        server.terminate()
        try:
            server.wait(timeout=15)
        except subprocess.TimeoutExpired:
            server.kill()

    # login wrote hash-chained audit blocks for each firm inside its own tenant context
    with owner() as conn:
        per_firm = dict(conn.execute(text(
            "SELECT firm_id, count(*) FROM audit_blocks WHERE action = 'LOGIN_OTP_VERIFIED' GROUP BY firm_id"
        )).all())
    assert per_firm.get(FIRM_A) == 1 and per_firm.get(FIRM_B) == 1
    with owner() as conn:
        enrolled = conn.execute(text(
            "SELECT count(*) FROM audit_blocks WHERE firm_id = :f AND action = 'SIGNER_DEVICE_ENROLLED'"
        ), {"f": FIRM_A}).scalar_one()
    assert enrolled == 1
