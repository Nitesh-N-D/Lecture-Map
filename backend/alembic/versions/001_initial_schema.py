"""Initial schema

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('hashed_password', sa.String(), nullable=True),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('avatar_url', sa.String(), nullable=True),
        sa.Column('google_id', sa.String(), nullable=True),
        sa.Column('role', sa.Enum('user', 'guest', 'admin', name='userrole'), nullable=False, server_default='user'),
        sa.Column('is_guest', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_google_id', 'users', ['google_id'], unique=True)

    # Lectures table
    op.create_table(
        'lectures',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('original_filename', sa.String(), nullable=True),
        sa.Column('storage_path', sa.String(), nullable=True),
        sa.Column('transcript', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', name='lecturestatus'), nullable=False, server_default='PENDING'),
        sa.Column('celery_task_id', sa.String(), nullable=True),
        sa.Column('progress_step', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('concept_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('edge_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('flashcard_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_lectures_user_id', 'lectures', ['user_id'])

    # Flashcards table
    op.create_table(
        'flashcards',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('lecture_id', sa.String(), nullable=False),
        sa.Column('concept_id', sa.String(), nullable=False),
        sa.Column('concept_name', sa.String(), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('answer', sa.Text(), nullable=False),
        sa.Column('easiness_factor', sa.Float(), nullable=False, server_default='2.5'),
        sa.Column('interval_days', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('repetitions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('next_review_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('last_reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('total_reviews', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['lecture_id'], ['lectures.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_flashcards_lecture_id', 'flashcards', ['lecture_id'])
    op.create_index('ix_flashcards_concept_id', 'flashcards', ['concept_id'])

    # Study sessions table
    op.create_table(
        'study_sessions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('lecture_id', sa.String(), nullable=True),
        sa.Column('cards_reviewed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('cards_correct', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_time_seconds', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('average_quality', sa.Float(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['lecture_id'], ['lectures.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_study_sessions_user_id', 'study_sessions', ['user_id'])
    op.create_index('ix_study_sessions_lecture_id', 'study_sessions', ['lecture_id'])


def downgrade() -> None:
    op.drop_table('study_sessions')
    op.drop_table('flashcards')
    op.drop_table('lectures')
    op.drop_table('users')
    op.execute("DROP TYPE IF EXISTS lecturestatus")
    op.execute("DROP TYPE IF EXISTS userrole")
