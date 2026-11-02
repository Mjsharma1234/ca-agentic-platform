"""bind signer devices to a DPoP public key thumbprint

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-02 08:00:00+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("signer_devices") as batch:
        batch.add_column(sa.Column("dpop_jkt", sa.String(length=64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("signer_devices") as batch:
        batch.drop_column("dpop_jkt")
