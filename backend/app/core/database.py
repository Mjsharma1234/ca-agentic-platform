import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from typing import Generator

from .config import settings

# Normalize database URL for standard engine
db_url = settings.DATABASE_URL
if db_url.startswith("sqlite+aiosqlite:///"):
    db_url = db_url.replace("sqlite+aiosqlite:///", "sqlite:///")

# Connect args for SQLite
connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}

engine = create_engine(
    db_url,
    connect_args=connect_args,
    echo=False
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()

def create_tables():
    """Synchronously creates all tables."""
    try:
        # Import models so they are registered with Base.metadata
        from .. import models
        Base.metadata.create_all(bind=engine)
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
