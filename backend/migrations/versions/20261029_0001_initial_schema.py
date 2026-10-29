"""Initial Phase 5 schema."""
from alembic import op
from backend.models.db import Base

revision = "20261029_0001"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    # Freeze the initial revision at its original shape; later model changes
    # belong to later revisions rather than silently changing migration history.
    jobs = Base.metadata.tables["jobs"]
    for name in ("department", "location"):
        if name in jobs.c:
            jobs._columns.remove(jobs.c[name])
    Base.metadata.create_all(bind=bind)

def downgrade():
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
