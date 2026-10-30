"""store a portable graph snapshot for installations without Neo4j

Revision ID: 002_portable_graph_snapshot
Revises: 001
Create Date: 2026-08-23
"""

from alembic import op
import sqlalchemy as sa


revision = "002_portable_graph_snapshot"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lectures", sa.Column("graph_data", sa.Text(), nullable=True))
    op.add_column("lectures", sa.Column("visited_concept_ids", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("lectures", "visited_concept_ids")
    op.drop_column("lectures", "graph_data")
