"""OI-30/31/33: job lifecycle and structured fields, job membership, job activity, notifications.

Idempotent like 0003/0004: startup create_all may already have created these tables and columns.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261127_0005"
down_revision = "20261127_0004"
branch_labels = None
depends_on = None

JOB_COLUMNS = (
    ("status", lambda: sa.Column("status", sa.String(16), nullable=False, server_default="active")),
    ("employment_type", lambda: sa.Column("employment_type", sa.String(64), nullable=True)),
    ("experience_range", lambda: sa.Column("experience_range", sa.String(64), nullable=True)),
    ("hiring_manager", lambda: sa.Column("hiring_manager", sa.String(255), nullable=True)),
    ("updated_at", lambda: sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True)),
)


def upgrade():
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    existing = {column["name"] for column in inspector.get_columns("jobs")}
    missing = [build() for name, build in JOB_COLUMNS if name not in existing]
    if missing:
        with op.batch_alter_table("jobs") as batch:
            for column in missing:
                batch.add_column(column)
    if "ix_jobs_status" not in {index["name"] for index in inspector.get_indexes("jobs")}:
        op.create_index("ix_jobs_status", "jobs", ["status"])

    if "job_applications" not in tables:
        op.create_table("job_applications",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("job_id", sa.String(64), nullable=False),
            sa.Column("candidate_id", sa.String(64), nullable=False),
            sa.Column("workspace_id", sa.String(64), nullable=True),
            sa.Column("source", sa.String(16), nullable=False),
            sa.Column("added_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("added_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("job_id", "candidate_id", name="uq_job_applications_job_candidate"))
        for column in ("job_id", "candidate_id", "workspace_id"):
            op.create_index(f"ix_job_applications_{column}", "job_applications", [column])

    if "job_events" not in tables:
        op.create_table("job_events",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("job_id", sa.String(64), nullable=False),
            sa.Column("workspace_id", sa.String(64), nullable=True),
            sa.Column("kind", sa.String(32), nullable=False),
            sa.Column("actor_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("actor_name", sa.String(255), nullable=False),
            sa.Column("candidate_id", sa.String(64), nullable=True),
            sa.Column("detail", sa.JSON(), nullable=False),
            sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False))
        for column in ("job_id", "workspace_id", "candidate_id", "occurred_at"):
            op.create_index(f"ix_job_events_{column}", "job_events", [column])

    if "notifications" not in tables:
        op.create_table("notifications",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("workspace_id", sa.String(64), nullable=True),
            sa.Column("kind", sa.String(32), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("candidate_id", sa.String(64), nullable=True),
            sa.Column("job_id", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("read_at", sa.DateTime(timezone=True), nullable=True))
        for column in ("user_id", "workspace_id", "candidate_id", "created_at"):
            op.create_index(f"ix_notifications_{column}", "notifications", [column])


def downgrade():
    op.drop_table("notifications")
    op.drop_table("job_events")
    op.drop_table("job_applications")
    op.drop_index("ix_jobs_status", table_name="jobs")
    with op.batch_alter_table("jobs") as batch:
        for name, _ in reversed(JOB_COLUMNS):
            batch.drop_column(name)
