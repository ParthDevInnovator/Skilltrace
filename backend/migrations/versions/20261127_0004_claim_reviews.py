"""OI-29: recruiter confirm/dismiss decisions on claim evidence links.

Idempotent like 0003: startup create_all may already have created the table.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261127_0004"
down_revision = "20261118_0003"
branch_labels = None
depends_on = None


def upgrade():
    if "claim_reviews" in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    op.create_table("claim_reviews",
        sa.Column("candidate_id", sa.String(64), primary_key=True),
        sa.Column("claim_id", sa.String(64), primary_key=True),
        sa.Column("decision", sa.String(16), nullable=False),
        sa.Column("reviewed_link", sa.String(32), nullable=False),
        sa.Column("reviewed_by", sa.String(255), nullable=False),
        sa.Column("reviewer_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("workspace_id", sa.String(64), nullable=True))
    op.create_index("ix_claim_reviews_workspace_id", "claim_reviews", ["workspace_id"])


def downgrade():
    op.drop_index("ix_claim_reviews_workspace_id", table_name="claim_reviews")
    op.drop_table("claim_reviews")
