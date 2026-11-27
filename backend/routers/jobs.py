"""Jobs: listing, lifecycle and editing (OI-31), job membership (OI-30) and activity."""
import re
from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.dependencies import require_role
from backend.core.roles import Role
from backend.core.workspace import default_workspace_id, in_workspace, workspace_of
from backend.models import Job, JobCreate, JobFilterParams
from backend.models.db import Job as DBJob, JobRequirement as DBJobRequirement
from backend.models.job import OPEN_STATUSES, JobEvent, JobRequirement, JobStatus, JobUpdate
from backend.routers.ingest import get_context_builder
from backend.services.job_membership import (add_application, applicants, counts_for, job_events, record_event,
                                             remove_application)
from backend.services.match_store import match_store
from backend.services.notifications import add_notification
from backend.services.persisted_jobs import job_from_row, requirements_of
from backend.services.requirement_extractor import extract_requirements

router = APIRouter(tags=["Jobs"])
READERS = (Role.recruiter, Role.hiring_manager, Role.hr_admin)
EDITORS = (Role.recruiter, Role.hr_admin)


def _workspace_filter(workspace: str):
    # Rows written before workspaces existed belong to the default workspace.
    if workspace == default_workspace_id():
        return or_(DBJob.workspace_id == workspace, DBJob.workspace_id.is_(None))
    return DBJob.workspace_id == workspace


def _matches(job: Job, params: JobFilterParams) -> bool:
    """Search covers the job ID and requirement text as well as the visible fields (OI-31)."""
    if params.search:
        q = params.search.casefold().strip()
        haystack = " ".join([job.id, job.title, job.department, job.location, job.description_raw,
                             *job.requirements_preview, *(r.requirement_text for r in job.requirements)])
        if q not in haystack.casefold():
            return False
    if params.department and params.department.casefold().strip() not in job.department.casefold():
        return False
    if params.location and params.location.casefold().strip() not in job.location.casefold():
        return False
    return not params.status or job.status == params.status


async def _with_counts(jobs: list[Job], workspace: str, db: AsyncSession, service) -> list[Job]:
    grouped = await applicants(db, [job.id for job in jobs], workspace)
    return [job.model_copy(update={"candidate_counts": counts_for(grouped.get(job.id, []), service.repository,
                                                                   service.registry)}) for job in jobs]


async def load_job(job_id: str, workspace: str, db: AsyncSession, service) -> Job:
    """A visible job, or 404. Custom jobs are read from the database, the source of truth."""
    row = await db.get(DBJob, job_id)
    job = job_from_row(row, await requirements_of(db, row.id)) if row is not None and row.is_custom else None
    job = job or service.repository.get_job(job_id)
    if job is None or not in_workspace(job, workspace):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Job with ID '{job_id}' not found")
    return job


@router.get("", response_model=List[Job], summary="List available jobs",
            description="Jobs with optional search (ID, title, department, location, description, requirements), "
                        "department, location and lifecycle status filters, and per-job candidate counts.")
async def list_jobs(
    search: Optional[str] = Query(default=None, description="Filter by job ID, title, department, location, description, or requirements"),
    department: Optional[str] = Query(default=None, description="Filter by department name (case-insensitive)"),
    location: Optional[str] = Query(default=None, description="Filter by job location (case-insensitive)"),
    job_status: Optional[JobStatus] = Query(default=None, alias="status", description="Filter by lifecycle status"),
    user=Depends(require_role(*READERS)),
    db: AsyncSession = Depends(get_db),
    service=Depends(get_context_builder),
) -> List[Job]:
    params = JobFilterParams(search=search, department=department, location=location, status=job_status)
    workspace = workspace_of(user)
    rows = (await db.scalars(select(DBJob).where(DBJob.is_custom.is_(True), _workspace_filter(workspace))
                             .order_by(DBJob.created_at.desc()))).all()
    custom = [job_from_row(row, await requirements_of(db, row.id)) for row in rows]
    custom_ids = {job.id for job in custom}
    bundled = [job for job in service.repository.get_jobs()
               if job.id not in custom_ids and not job.is_custom and in_workspace(job, workspace)]
    jobs = [job for job in bundled + custom if _matches(job, params)]
    return await _with_counts(jobs, workspace, db, service)


@router.get("/{job_id}", response_model=Job, summary="Get job detail by ID",
            responses={status.HTTP_404_NOT_FOUND: {"description": "Job not found"}})
async def get_job(job_id: str, user=Depends(require_role(*READERS)), db: AsyncSession = Depends(get_db),
                  service=Depends(get_context_builder)) -> Job:
    workspace = workspace_of(user)
    job = await load_job(job_id, workspace, db, service)
    return (await _with_counts([job], workspace, db, service))[0]


def _numbered(job_id: str, requirements: list[JobRequirement], start: int = 1) -> list[JobRequirement]:
    return [r.model_copy(update={"id": f"{job_id}-REQ-{i:03d}"}) for i, r in enumerate(requirements, start)]


def _key(text: str, mandatory: bool) -> tuple[str, bool]:
    return " ".join(text.casefold().split()), mandatory


def _dedupe(requirements: list[JobRequirement]) -> list[JobRequirement]:
    seen, result = set(), []
    for requirement in requirements:
        key = _key(requirement.requirement_text, True)[0]
        if key and key not in seen:
            seen.add(key)
            result.append(requirement.model_copy(update={"requirement_text": requirement.requirement_text.strip()}))
    return result


@router.post("", response_model=Job, status_code=201)
async def create_job(body: JobCreate, service=Depends(get_context_builder), user=Depends(require_role(*EDITORS)),
                     db: AsyncSession = Depends(get_db)):
    job_id = f"CUSTOM-{uuid4()}"
    if body.requirements is None:
        requirements = extract_requirements(body.description_raw, job_id)
    else:
        # The reviewed list is scored exactly as sent; an empty list is never silently re-extracted (OI-45).
        requirements = _dedupe(body.requirements)
        if not requirements:
            raise HTTPException(422, "Add at least one requirement to score, or omit requirements to extract them.")
    # Requirement IDs are primary keys, and must be unique across persisted jobs.
    requirements = _numbered(job_id, requirements)
    workspace = workspace_of(user)
    creator = getattr(user, "id", None)
    db.add(DBJob(id=job_id, title=body.title, department=body.department, location=body.location,
                 description_raw=body.description_raw, is_custom=True, workspace_id=workspace, status=body.status,
                 employment_type=body.employment_type, experience_range=body.experience_range,
                 hiring_manager=body.hiring_manager, created_by=creator if hasattr(creator, "hex") else None))
    db.add_all([DBJobRequirement(id=r.id, job_id=job_id, skill=r.requirement_text,
                                 level="required" if r.is_mandatory else "preferred", weight=1.0) for r in requirements])
    record_event(db, job_id, workspace, user, "created", detail={"status": body.status, "requirements": len(requirements)})
    await db.commit()
    job = await load_job(job_id, workspace, db, service)
    service.repository.add_job(job)
    return job.model_copy(update={"candidate_counts": counts_for([], service.repository, service.registry)})


async def _replace_requirements(db: AsyncSession, job_id: str, existing, wanted: list[JobRequirement]) -> bool:
    """Keep the IDs of unchanged requirements, so stored reviews and comparisons still line up."""
    wanted = _dedupe(wanted)
    if not wanted:
        raise HTTPException(422, "A job needs at least one requirement to score.")
    available = {}
    for row in existing:
        available.setdefault(_key(row.skill, row.level == "required"), []).append(row)
    numbers = [int(match.group(1)) for row in existing if (match := re.search(r"-REQ-(\d+)$", row.id))]
    next_number = max(numbers, default=0) + 1
    kept, added = set(), []
    for requirement in wanted:
        reusable = available.get(_key(requirement.requirement_text, requirement.is_mandatory))
        if reusable:
            kept.add(reusable.pop(0).id)
        else:
            added.append(requirement)
    removed = [row.id for row in existing if row.id not in kept]
    if not removed and not added:
        return False
    if removed:
        await db.execute(delete(DBJobRequirement).where(DBJobRequirement.id.in_(removed)))
    db.add_all([DBJobRequirement(id=r.id, job_id=job_id, skill=r.requirement_text,
                                 level="required" if r.is_mandatory else "preferred", weight=1.0)
                for r in _numbered(job_id, added, next_number)])
    return True


OPTIONAL_FIELDS = ("employment_type", "experience_range", "hiring_manager")


def _clean(name: str, value):
    if isinstance(value, str):
        value = value.strip()
    if name in OPTIONAL_FIELDS:
        return value or None
    if not value or (name != "description_raw" and len(value) < 2):
        raise HTTPException(422, f"{name.replace('_', ' ').capitalize()} cannot be empty.")
    return value


@router.patch("/{job_id}", response_model=Job, summary="Edit a job or change its lifecycle status")
async def update_job(job_id: str, body: JobUpdate, service=Depends(get_context_builder),
                     user=Depends(require_role(*EDITORS)), db: AsyncSession = Depends(get_db)):
    workspace = workspace_of(user)
    current = await load_job(job_id, workspace, db, service)
    if not current.is_custom:
        raise HTTPException(409, {"code": "read_only", "message": "Bundled demo jobs cannot be edited."})
    row = await db.get(DBJob, job_id)
    changed = []
    for name, value in body.model_dump(exclude_unset=True, exclude={"requirements", "status"}).items():
        value = _clean(name, value)
        if value != getattr(row, name):
            setattr(row, name, value)
            changed.append(name)
    requirements_changed = False
    if body.requirements is not None:
        requirements_changed = await _replace_requirements(db, job_id, await requirements_of(db, job_id),
                                                           body.requirements)
        if requirements_changed:
            changed.append("requirements")
    previous_status = row.status or "active"
    status_changed = body.status is not None and body.status != previous_status
    if not changed and not status_changed:
        return await get_job(job_id, user, db, service)
    row.updated_at = datetime.now(timezone.utc)
    if changed:
        record_event(db, job_id, workspace, user, "updated", detail={"fields": changed})
    if status_changed:
        row.status = body.status
        record_event(db, job_id, workspace, user, "status_changed", detail={"from": previous_status, "to": body.status})
        actor = getattr(user, "id", None)
        if row.created_by is not None and str(row.created_by) != str(actor):
            add_notification(db, row.created_by, workspace, "job_status", f"{row.title} is now {body.status}",
                             f"{getattr(user, 'full_name', None) or 'A teammate'} changed the job status "
                             f"from {previous_status} to {body.status}.", job_id=job_id)
    await db.commit()
    job = await load_job(job_id, workspace, db, service)
    service.repository.add_job(job)
    if requirements_changed:
        match_store.clear_job(job_id)  # cached results were scored against the old requirements
    return (await _with_counts([job], workspace, db, service))[0]


@router.get("/{job_id}/activity", response_model=List[JobEvent], summary="Job activity, newest first")
async def job_activity(job_id: str, user=Depends(require_role(*READERS)), db: AsyncSession = Depends(get_db),
                       service=Depends(get_context_builder)):
    workspace = workspace_of(user)
    await load_job(job_id, workspace, db, service)
    return [JobEvent(id=str(event.id), job_id=event.job_id, kind=event.kind, actor_name=event.actor_name,
                     candidate_id=event.candidate_id, detail=event.detail or {}, occurred_at=event.occurred_at)
            for event in await job_events(db, job_id, workspace)]


class JobCandidate(BaseModel):
    """Membership only; names and profiles come from the candidate APIs, which apply role masking."""
    candidate_id: str
    added_at: datetime
    source: str
    context_status: Optional[str] = None


class AddCandidateRequest(BaseModel):
    candidate_id: str = Field(min_length=1, max_length=64)


@router.get("/{job_id}/candidates", response_model=List[JobCandidate], summary="Candidates added to a job")
async def job_candidates(job_id: str, user=Depends(require_role(*READERS)), db: AsyncSession = Depends(get_db),
                         service=Depends(get_context_builder)):
    workspace = workspace_of(user)
    await load_job(job_id, workspace, db, service)
    rows = (await applicants(db, [job_id], workspace)).get(job_id, [])
    result = []
    for row in rows:
        if service.repository.get_candidate(row.candidate_id) is None:
            continue
        entry = service.registry.get(row.candidate_id)
        result.append(JobCandidate(candidate_id=row.candidate_id, added_at=row.added_at, source=row.source,
                                   context_status=entry.status if entry else None))
    return result


def require_open(job: Job) -> None:
    if job.status not in OPEN_STATUSES:
        raise HTTPException(409, {"code": "job_closed", "message": f"This job is {job.status}; reopen it to add candidates."})


@router.post("/{job_id}/candidates", response_model=JobCandidate, status_code=201,
             summary="Add an existing candidate to a job")
async def add_job_candidate(job_id: str, body: AddCandidateRequest, response: Response,
                            user=Depends(require_role(*EDITORS)), db: AsyncSession = Depends(get_db),
                            service=Depends(get_context_builder)):
    workspace = workspace_of(user)
    job = await load_job(job_id, workspace, db, service)
    require_open(job)
    candidate = service.repository.get_candidate(body.candidate_id)
    if candidate is None or not in_workspace(candidate, workspace):
        raise HTTPException(404, "Candidate not found.")
    if not await add_application(db, job_id, candidate.id, workspace, user, source="manual"):
        response.status_code = 200
    row = (await applicants(db, [job_id], workspace))[job_id]
    added = next(item for item in row if item.candidate_id == candidate.id)
    entry = service.registry.get(candidate.id)
    return JobCandidate(candidate_id=candidate.id, added_at=added.added_at, source=added.source,
                        context_status=entry.status if entry else None)


@router.delete("/{job_id}/candidates/{candidate_id}", status_code=204, summary="Remove a candidate from a job")
async def remove_job_candidate(job_id: str, candidate_id: str, user=Depends(require_role(*EDITORS)),
                               db: AsyncSession = Depends(get_db), service=Depends(get_context_builder)):
    workspace = workspace_of(user)
    await load_job(job_id, workspace, db, service)
    if not await remove_application(db, job_id, candidate_id, workspace, user):
        raise HTTPException(404, "Candidate is not on this job.")
    return Response(status_code=204)
