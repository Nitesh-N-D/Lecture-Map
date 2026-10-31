"""add users.gemini_api_key_enc for bring-your-own Gemini keys

Revision ID: 004_user_gemini_key
Revises: 003_user_token_version
Create Date: 2026-10-31
"""

from alembic import op
import sqlalchemy as sa


revision = "004_user_gemini_key"
down_revision = "003_user_token_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # App startup (init_db) may already have added the column; stay idempotent.
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}
    if "gemini_api_key_enc" not in columns:
        op.add_column("users", sa.Column("gemini_api_key_enc", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("gemini_api_key_enc")
