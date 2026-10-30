"""add users.token_version for server-side session revocation

Revision ID: 003_user_token_version
Revises: 002_portable_graph_snapshot
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa


revision = "003_user_token_version"
down_revision = "002_portable_graph_snapshot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("token_version")
