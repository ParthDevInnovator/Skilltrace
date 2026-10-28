from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.models import Job, JobFilterParams
from backend.services.seed_loader import seed_loader

router = APIRouter(tags=["Jobs"])


@router.get(
    "",
    response_model=List[Job],
    summary="List available jobs",
    description="Retrieve all seeded jobs with optional filtering by search keyword, department, or location.",
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
) -> List[Job]:
    """Retrieve filtered list of jobs."""
    params = JobFilterParams(search=search, department=department, location=location)
    return seed_loader.get_jobs(params=params)


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
async def get_job(job_id: str) -> Job:
    """Retrieve a single job by its unique identifier."""
    job = seed_loader.get_job(job_id)
    if not job:
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
def create_job(body: JobCreate, service=Depends(get_context_builder)):
    id = f'CUSTOM-{uuid4()}'
    requirements = body.requirements or extract_requirements(body.description_raw,id)
    job = Job(id=id,**body.model_dump(exclude={'requirements'}),requirements=[{'id':r.id,'requirement_text':r.requirement_text,'category':r.category,'is_mandatory':r.is_mandatory} for r in requirements],requirements_preview=[r.requirement_text for r in requirements[:4]])
    return service.repository.add_job(job)
