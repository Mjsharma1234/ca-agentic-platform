"""Tally agent: tally_agents.sync_requested_at, so a manager can ask a PC to sync now.

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-20 10:00:00+00:00

A nullable column on an existing table that already has its row-level-security policies (0013), so nothing else changes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0015'
down_revision: Union[str, None] = '0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("tally_agents")}
    if "sync_requested_at" not in columns:
        with op.batch_alter_table("tally_agents") as batch:
            batch.add_column(sa.Column("sync_requested_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("tally_agents") as batch:
        batch.drop_column("sync_requested_at")
