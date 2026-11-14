"""Startup check that PostgreSQL row-level security is actually in force for the API's connection.

RLS is silently skipped for superusers, BYPASSRLS roles and table owners, so a misconfigured
DATABASE_URL (e.g. the managed-database admin user, with DB_APP_ROLE unset) would leave tenant
isolation to application WHERE clauses alone. In production that is a refusal to boot.
"""
import logging
from typing import List

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_ROLE = text("SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
_SESSION = text(
    "SELECT session_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = session_user AND session_user <> current_user"
)
_OWNED = text("SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user")
# The login (session) role that only SET ROLE'd down to the app role: if it owns the tables, injected SQL can
# RESET ROLE straight back to an owner that bypasses RLS (e.g. DATABASE_URL pointed at the migration owner).
_SESSION_OWNED = text(
    "SELECT session_user, count(*) FROM pg_tables WHERE schemaname = 'public' AND tableowner = session_user "
    "AND session_user <> current_user GROUP BY session_user"
)
_NO_RLS = text(
    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
    "WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity AND c.relname <> 'alembic_version' "
    "ORDER BY c.relname"
)


def rls_problems(engine: Engine) -> List[str]:
    if engine.dialect.name != "postgresql":
        return []
    problems: List[str] = []
    with engine.connect() as conn:
        user, superuser, bypass = conn.execute(_ROLE).one()
        if superuser:
            problems.append(f"connected as superuser {user!r}, which bypasses row-level security")
        if bypass:
            problems.append(f"role {user!r} has BYPASSRLS")
        escalated = conn.execute(_SESSION).first()
        if escalated and (escalated[1] or escalated[2]):
            problems.append(
                f"the login (session) user {escalated[0]!r} is a superuser/BYPASSRLS role that only did SET ROLE; "
                "injected SQL could RESET ROLE. Connect as a dedicated login role that is a member of ca_app "
                "(see db/provision_roles.sql)"
            )
        session_owner = conn.execute(_SESSION_OWNED).first()
        if session_owner:
            problems.append(
                f"the login (session) user {session_owner[0]!r} owns {session_owner[1]} table(s) and the API only did SET ROLE; "
                "injected SQL could RESET ROLE to an owner that bypasses row-level security. Use the dedicated "
                "`ca_api` login in DATABASE_URL and keep the owner only in DATABASE_ADMIN_URL"
            )
        owned = conn.execute(_OWNED).scalar_one()
        if owned:
            problems.append(f"role {user!r} owns {owned} table(s); owners bypass row-level security")
        unprotected = [r[0] for r in conn.execute(_NO_RLS)]
        if unprotected:
            problems.append(f"row-level security is not enabled on: {', '.join(unprotected)} (run alembic upgrade head)")
        conn.rollback()
    return problems


def enforce_rls_posture(engine: Engine, *, production: bool) -> None:
    problems = rls_problems(engine)
    if not problems:
        return
    message = "PostgreSQL row-level security is not in force: " + "; ".join(problems)
    if production:
        raise RuntimeError(message)
    logger.warning(message)
