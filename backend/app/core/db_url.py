"""Turns whatever database address an operator pastes into one SQLAlchemy can open with the drivers we ship.

The app and the migrations use synchronous drivers: sqlite3 and psycopg2 (psycopg2-binary is in requirements.txt).
A plain `postgresql://...` or `postgres://...` address, which is what Supabase and most hosts hand out, names no driver,
and SQLAlchemy 2.1 and later picks psycopg (version 3) for it. That package is not installed, so the service crashed on
startup with `No module named 'psycopg'`. Older SQLAlchemy picked psycopg2, which is why it only showed on a newer release.
Naming the driver explicitly makes the result the same on every SQLAlchemy version. An address that already names a driver
(`postgresql+psycopg2://`, `postgresql+psycopg://`) is left alone.
"""

_REWRITES = (
    ("sqlite+aiosqlite:", "sqlite:"),
    ("postgresql+asyncpg:", "postgresql+psycopg2:"),
    ("postgres://", "postgresql+psycopg2://"),
    ("postgresql://", "postgresql+psycopg2://"),
)


def normalise_url(url: str) -> str:
    for old, new in _REWRITES:
        if url.startswith(old):
            return url.replace(old, new, 1)
    return url
