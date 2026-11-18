from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Job, JobFilterParams
from backend.services.seed_loader import seed_loader
from backend.core.dependencies import require_role
from backend.core.roles import Role
from backend.core.database import get_db
from backend.models.db import Job as DBJob, JobRequirement as DBJobRequirement
from backend.core.workspace import default_workspace_id, in_workspace, workspace_of
from sqlalchemy import or_


def _workspace_filter(workspace: str):
    # Rows written before workspaces existed belong to the default workspace.
    if workspace == default_workspace_id():
        return or_(DBJob.workspace_id == workspace, DBJob.workspace_id.is_(None))
    return DBJob.workspace_id == workspace


def _from_row(row, requirements) -> Job:
    return Job(id=row.id, title=row.title, department=row.department, location=row.location,
               description_raw=row.description_raw, workspace_id=row.workspace_id or default_workspace_id(),
               requirements=[{'id': item.id, 'requirement_text': item.skill, 'category': None,
                              'is_mandatory': item.level == 'required'} for item in requirements],
               requirements_preview=[item.skill for item in requirements[:4]], created_at=row.created_at.isoformat())

router = APIRouter(tags=["Jobs"])


@router.get(
    "",
    response_model=List[Job],
    summary="List available jobs",
    description="Retrieve all jobs with optional filtering by search keyword, department, or location.",
)
async def list_jobs(
    search: Optional[str] = Query(
        default=None,
        description="Filter by job ID, title, department, location, description, or requirements",
    ),
    department: Optional[str] = Query(
        default=None,
        description="Filter by department name (case-insensitive)",
    ),
    location: Optional[str] = Query(
        default=None,
        description="Filter by job location (case-insensitive)",
    ),
    user=Depends(require_role(Role.recruiter, Role.hiring_manager, Role.hr_admin)),
    db: AsyncSession = Depends(get_db),
) -> List[Job]:
    """Retrieve the filtered list of persisted jobs."""
    params = JobFilterParams(search=search, department=department, location=location)
    workspace = workspace_of(user)
    jobs=[job for job in seed_loader.get_jobs(params=params) if in_workspace(job, workspace)]
    custom=(await db.scalars(select(DBJob).where(DBJob.is_custom.is_(True), _workspace_filter(workspace)).order_by(DBJob.created_at.desc()))).all()
    for row in custom:
        if any(job.id==row.id for job in jobs):continue
        requirements=(await db.scalars(select(DBJobRequirement).where(DBJobRequirement.job_id==row.id).order_by(DBJobRequirement.id))).all()
        candidate=_from_row(row, requirements)
        if (not search or search.casefold() in str(candidate.model_dump()).casefold()) and (not department or department.casefold() in candidate.department.casefold()) and (not location or location.casefold() in candidate.location.casefold()):jobs.append(candidate)
    return jobs


@router.get(
    "/{job_id}",
    response_model=Job,
    summary="Get job detail by ID",
    description="Retrieve a single job's complete requirements, metadata, and description by ID.",
    responses={
        status.HTTP_404_NOT_FOUND: {
            "description": "Job not found",
            "content": {
                "application/json": {
                    "example": {"detail": "Job with ID 'JOB-999' not found"}
                }
            },
        }
    },
)
async def get_job(job_id: str, user=Depends(require_role(Role.recruiter, Role.hiring_manager, Role.hr_admin)), db: AsyncSession=Depends(get_db)) -> Job:
    """Retrieve a single job by its unique identifier."""
    job = seed_loader.get_job(job_id)
    if not job:
        row=await db.get(DBJob,job_id)
        if row:
            requirements=(await db.scalars(select(DBJobRequirement).where(DBJobRequirement.job_id==row.id).order_by(DBJobRequirement.id))).all()
            job=_from_row(row, requirements)
    if not job or not in_workspace(job, workspace_of(user)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job with ID '{job_id}' not found",
        )
    return job

from backend.routers.ingest import get_context_builder
from uuid import uuid4
from backend.models import JobCreate
from backend.services.requirement_extractor import extract_requirements
@router.post('', response_model=Job, status_code=201)
async def create_job(body: JobCreate, service=Depends(get_context_builder), user=Depends(require_role(Role.recruiter, Role.hr_admin)), db: AsyncSession=Depends(get_db)):
    id = f'CUSTOM-{uuid4()}'
    requirements = body.requirements or extract_requirements(body.description_raw,id)
    # Requirement IDs are primary keys, and must be unique across persisted jobs.
    requirements = [r.model_copy(update={"id": f"{id}-REQ-{i:03d}"}) for i, r in enumerate(requirements, 1)]
    workspace = workspace_of(user)
    job = Job(id=id,workspace_id=workspace,**body.model_dump(exclude={'requirements'}),requirements=[{'id':r.id,'requirement_text':r.requirement_text,'category':r.category,'is_mandatory':r.is_mandatory} for r in requirements],requirements_preview=[r.requirement_text for r in requirements[:4]])
    db.add(DBJob(id=id,title=body.title,department=body.department,location=body.location,description_raw=body.description_raw,is_custom=True,workspace_id=workspace,created_by=getattr(user,'id',None) if hasattr(getattr(user,'id',None),'hex') else None))
    db.add_all([DBJobRequirement(id=r.id,job_id=id,skill=r.requirement_text,level='required' if r.is_mandatory else 'preferred',weight=1.0) for r in requirements]);await db.commit()
    return service.repository.add_job(job)
