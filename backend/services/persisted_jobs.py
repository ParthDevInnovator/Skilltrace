"""Restore persisted custom requisitions into the runtime matching repository."""
from sqlalchemy import select
from backend.models import Job
from backend.models.db import Job as DBJob, JobRequirement


async def restore_custom_jobs(db, repository):
    rows = (await db.scalars(select(DBJob).where(DBJob.is_custom.is_(True)))).all()
    for row in rows:
        requirements = (await db.scalars(select(JobRequirement).where(JobRequirement.job_id == row.id))).all()
        repository.add_job(Job(
            id=row.id, title=row.title, department=row.department, location=row.location,
            description_raw=row.description_raw, created_at=row.created_at.isoformat(),
            requirements=[{"id": r.id, "requirement_text": r.skill, "is_mandatory": r.level == "required"} for r in requirements],
            requirements_preview=[r.skill for r in requirements[:4]],
        ))
