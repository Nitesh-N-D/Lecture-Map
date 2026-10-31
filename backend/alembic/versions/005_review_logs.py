"""add review_logs for flashcard review history

Revision ID: 005_review_logs
Revises: 004_user_gemini_key
Create Date: 2026-10-31
"""

from alembic import op
import sqlalchemy as sa


revision = "005_review_logs"
down_revision = "004_user_gemini_key"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # App startup (create_all) may already have created the table; stay idempotent.
    if sa.inspect(op.get_bind()).has_table("review_logs"):
        return
    op.create_table(
        "review_logs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lecture_id", sa.String(), sa.ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False),
        sa.Column("card_id", sa.String(), nullable=False),
        sa.Column("concept_id", sa.String(), nullable=False),
        sa.Column("quality", sa.Integer(), nullable=False),
        sa.Column("interval_days", sa.Integer(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_review_logs_user_id", "review_logs", ["user_id"])
    op.create_index("ix_review_logs_lecture_id", "review_logs", ["lecture_id"])
    op.create_index("ix_review_logs_card_id", "review_logs", ["card_id"])
    op.create_index("ix_review_logs_reviewed_at", "review_logs", ["reviewed_at"])


def downgrade() -> None:
    op.drop_table("review_logs")
