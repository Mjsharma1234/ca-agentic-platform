"""Database address cleaning. A plain postgresql:// address crashed a deploy on SQLAlchemy 2.1 (psycopg v3 is not installed)."""
import pytest

from app.core.database import _normalise_url
from app.core.db_url import normalise_url

SUPABASE = "postgresql://postgres.abcd:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"


@pytest.mark.parametrize("given, expected", [
    (SUPABASE, SUPABASE.replace("postgresql://", "postgresql+psycopg2://", 1)),                 # what Supabase's dashboard gives
    ("postgres://u:p@h:5432/db", "postgresql+psycopg2://u:p@h:5432/db"),                        # Heroku-style
    ("postgresql+asyncpg://u:p@h/db", "postgresql+psycopg2://u:p@h/db"),                        # async form, run synchronously
    ("sqlite+aiosqlite:///./x.db", "sqlite:///./x.db"),
    ("sqlite:///./x.db", "sqlite:///./x.db"),
    ("postgresql+psycopg2://u:p@h/db", "postgresql+psycopg2://u:p@h/db"),                       # already explicit: untouched
    ("postgresql+psycopg://u:p@h/db", "postgresql+psycopg://u:p@h/db"),                         # someone's deliberate choice: untouched
    ("postgresql://u:p@h/db?sslmode=require", "postgresql+psycopg2://u:p@h/db?sslmode=require"),
])
def test_addresses_are_rewritten_to_the_drivers_we_ship(given, expected):
    assert normalise_url(given) == expected
    assert _normalise_url(given) == expected                      # the app and the migrations share this one function


def test_a_password_that_looks_like_a_scheme_is_not_touched():
    url = "postgresql://u:postgres://x@h/db"
    assert normalise_url(url) == "postgresql+psycopg2://u:postgres://x@h/db"      # only the scheme prefix is rewritten


def test_the_rewritten_supabase_address_opens_with_psycopg2():
    pytest.importorskip("psycopg2")
    from sqlalchemy import create_engine
    engine = create_engine(normalise_url(SUPABASE))               # builds the engine without connecting
    assert engine.dialect.driver == "psycopg2"
