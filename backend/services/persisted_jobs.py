"""Custom requisitions: one row-to-model mapping, and restore into the runtime matching repository."""
from sqlalchemy import select

from backend.core.workspace import default_workspace_id
from backend.models import Job
from backend.models.db import Job as DBJob, JobRequirement


def job_from_row(row: DBJob, requirements) -> Job:
    return Job(
        id=row.id, title=row.title, department=row.department, location=row.location,
        description_raw=row.description_raw, created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
        workspace_id=row.workspace_id or default_workspace_id(),
        status=row.status or "active", is_custom=True,
        employment_type=row.employment_type, experience_range=row.experience_range,
        hiring_manager=row.hiring_manager,
        requirements=[{"id": r.id, "requirement_text": r.skill, "category": None, "is_mandatory": r.level == "required"}
                      for r in requirements],
        requirements_preview=[r.skill for r in requirements[:4]],
    )


async def requirements_of(db, job_id: str):
    return (await db.scalars(select(JobRequirement).where(JobRequirement.job_id == job_id)
                             .order_by(JobRequirement.id))).all()


async def restore_custom_jobs(db, repository) -> int:
    rows = (await db.scalars(select(DBJob).where(DBJob.is_custom.is_(True)))).all()
    for row in rows:
        repository.add_job(job_from_row(row, await requirements_of(db, row.id)))
    return len(rows)
