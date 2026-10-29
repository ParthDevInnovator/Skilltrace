"""Persist custom-job department and location metadata."""
from alembic import op
import sqlalchemy as sa

revision="20261029_0002"
down_revision="20261029_0001"
branch_labels=None
depends_on=None

def upgrade():
    op.add_column("jobs",sa.Column("department",sa.String(length=255),nullable=False,server_default="Custom Requisition"))
    op.add_column("jobs",sa.Column("location",sa.String(length=255),nullable=False,server_default="Remote"))

def downgrade():
    op.drop_column("jobs","location")
    op.drop_column("jobs","department")
