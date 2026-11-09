"""pin search_path on the RLS helper functions

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-09 09:00:00+00:00

A function with a mutable search_path can be hijacked by a same-named object in a schema the caller controls.
The helpers only use pg_catalog built-ins, so pin the path to it (Supabase linter 0011).
"""
from typing import Sequence, Union

from alembic import op

revision: str = '0008'
down_revision: Union[str, None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FUNCTIONS = ("app_tenant_id()", "app_is_system()", "app_forbid_change()")


def _postgres() -> bool:
    return op.get_context().dialect.name == "postgresql"


def upgrade() -> None:
    if not _postgres():
        return
    for fn in FUNCTIONS:
        op.execute(f"ALTER FUNCTION {fn} SET search_path = pg_catalog, pg_temp")


def downgrade() -> None:
    if not _postgres():
        return
    for fn in FUNCTIONS:
        op.execute(f"ALTER FUNCTION {fn} RESET search_path")
