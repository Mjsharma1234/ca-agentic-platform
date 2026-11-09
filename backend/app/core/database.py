import re
from typing import Generator

from fastapi import Depends
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker, declarative_base

from .config import settings

_ROLE_NAME = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


def _normalise_url(url: str) -> str:
    """Migrations and the API both run on synchronous drivers."""
    for old, new in (
        ("sqlite+aiosqlite:///", "sqlite:///"),
        ("postgresql+asyncpg:", "postgresql+psycopg2:"),
        ("postgres://", "postgresql+psycopg2://"),
    ):
        if url.startswith(old):
            return url.replace(old, new, 1)
    return url


def _build_engine(url: str, *, restricted: bool) -> Engine:
    """restricted=True is the request engine: SET ROLE to the RLS-bound role and bounded timeouts.
    restricted=False is the schema owner's engine, used only for DDL and the dev seed."""
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False}, echo=False)

    options = [f"-c lock_timeout={int(settings.DB_LOCK_TIMEOUT_MS)}", "-c application_name=ca-platform"]
    if restricted:
        options += [
            f"-c statement_timeout={int(settings.DB_STATEMENT_TIMEOUT_MS)}",
            f"-c idle_in_transaction_session_timeout={int(settings.DB_IDLE_IN_TX_TIMEOUT_MS)}",
        ]
    engine = create_engine(
        url,
        connect_args={"options": " ".join(options)},
        pool_size=settings.DB_POOL_SIZE if restricted else 2,
        max_overflow=settings.DB_MAX_OVERFLOW if restricted else 0,
        pool_recycle=settings.DB_POOL_RECYCLE_SECONDS,
        pool_pre_ping=True,
        echo=False,
    )
    role = settings.DB_APP_ROLE
    if restricted and role:
        if not _ROLE_NAME.match(role):
            raise ValueError("DB_APP_ROLE must be a lower-case PostgreSQL identifier.")

        @event.listens_for(engine, "connect")
        def _drop_to_app_role(dbapi_conn, _record):
            cur = dbapi_conn.cursor()
            cur.execute(f'SET ROLE "{role}"')
            cur.close()
            dbapi_conn.commit()

    return engine


db_url = _normalise_url(settings.DATABASE_URL)
engine = _build_engine(db_url, restricted=True)
# Schema-owner engine. Identical to `engine` unless a restricted role is configured.
admin_engine = (
    _build_engine(_normalise_url(settings.DATABASE_ADMIN_URL), restricted=False)
    if settings.DATABASE_ADMIN_URL
    else (_build_engine(db_url, restricted=False) if settings.DB_APP_ROLE else engine)
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
AdminSessionLocal = sessionmaker(bind=admin_engine, autocommit=False, autoflush=False)

Base = declarative_base()


def create_tables():
    """Synchronously creates all tables."""
    try:
        # Import models so they are registered with Base.metadata
        from .. import models
        if not settings.auto_create_tables:
            print("[DB] Auto-create disabled; schema is managed by Alembic (alembic upgrade head).")
            return
        Base.metadata.create_all(bind=admin_engine)
        print("[DB] All database tables verified / created successfully.")
    except Exception as e:
        print(f"[WARN] Database initialization notice: {e}")


def get_db() -> Generator:
    """Dependency that provides a clean SQLAlchemy session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_system_db(db: Session = Depends(get_db)) -> Session:
    """get_db's session, opened to identity tables for the pre-login flows (OTP login, device grant) that
    run before any tenant is known. The endpoint calls enter_tenant() as soon as it has identified the caller."""
    from .tenant_context import open_system

    open_system(db)
    return db
