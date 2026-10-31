"""Track failed Gemini key identity without persisting the key itself.

Revision ID: 006_gemini_failure_key_digest
Revises: 005_review_logs
"""
from alembic import op
import sqlalchemy as sa

revision = "006_gemini_failure_key_digest"
down_revision = "005_review_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("lectures")}
    if "failure_key_digest" not in columns:
        op.add_column("lectures", sa.Column("failure_key_digest", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("lectures", "failure_key_digest")
