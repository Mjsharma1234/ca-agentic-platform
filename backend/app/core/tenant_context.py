"""Per-transaction tenant context for PostgreSQL row-level security.

The policies in migration 0006 compare each row against two transaction-local settings:
  app.tenant_id  the tenant the authenticated caller belongs to
  app.system     'on' only for the pre-login flows (OTP login, device grant) that must find a user or
                 device before any tenant is known; it opens identity tables only, never business data

Settings are applied with set_config(..., is_local => true), so they die with the transaction and can
never leak to the next request that reuses the pooled connection. An `after_begin` hook re-applies
them to every new transaction the session starts (a commit ends one). No context set => zero rows.
On SQLite (dev) everything here is a no-op.
"""
import uuid
from contextlib import contextmanager
from typing import Iterator, Optional, Union

from sqlalchemy import event, text
from sqlalchemy.orm import Session

_TENANT = "rls.tenant_id"
_SYSTEM = "rls.system"

_APPLY = text("SELECT set_config('app.tenant_id', :tenant, true), set_config('app.system', :system, true)")


def _is_postgres(db: Session) -> bool:
    return db.get_bind().dialect.name == "postgresql"


def _params(info: dict) -> dict:
    return {"tenant": info.get(_TENANT) or "", "system": "on" if info.get(_SYSTEM) else "off"}


def _apply_now(db: Session) -> None:
    """Applies the context to the transaction that is already open (set mid-request, after auth)."""
    if _is_postgres(db):
        db.execute(_APPLY, _params(db.info))


def set_tenant(db: Session, tenant_id: Union[str, uuid.UUID]) -> None:
    db.info[_TENANT] = str(uuid.UUID(str(tenant_id)))
    _apply_now(db)


def enter_tenant(db: Session, tenant_id: Union[str, uuid.UUID]) -> None:
    """Switches from system scope to one tenant (used once a login has identified the user)."""
    db.info.pop(_SYSTEM, None)
    set_tenant(db, tenant_id)


def open_system(db: Session) -> None:
    """Keeps system scope on for the rest of this session (per-request dependency; see get_system_db)."""
    db.info[_SYSTEM] = True
    _apply_now(db)


def current_tenant(db: Session) -> Optional[str]:
    return db.info.get(_TENANT)


@contextmanager
def system_scope(db: Session) -> Iterator[Session]:
    """Opens identity tables for pre-login lookups. Keep the block as small as possible."""
    previous = db.info.get(_SYSTEM)
    db.info[_SYSTEM] = True
    _apply_now(db)
    try:
        yield db
    finally:
        if previous:
            db.info[_SYSTEM] = previous
        else:
            db.info.pop(_SYSTEM, None)
        if db.in_transaction():
            _apply_now(db)


@event.listens_for(Session, "after_begin")
def _apply_on_begin(session, transaction, connection) -> None:
    info = session.info
    if (_TENANT in info or _SYSTEM in info) and connection.dialect.name == "postgresql":
        connection.execute(_APPLY, _params(info))
