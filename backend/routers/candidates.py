from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from backend.routers.ingest import get_context_builder
from backend.routers.jd import JobRequest, candidate_match
from backend.services.context_builder import ContextBuilder
from backend.services.resume_parser import parse_resume

from backend.models import CandidateFilterParams
from backend.services.seed_loader import seed_loader
from backend.core.dependencies import require_role
from backend.core.masking import is_restricted, role_for, serialize_candidate
from backend.core.roles import Role
from backend.core.workspace import in_workspace, workspace_of
from backend.models.db import User
from backend.core.synthetic import may_include_synthetic

router = APIRouter(tags=["Candidates"])


@router.get(
    "",
    summary="List candidate summaries",
    description="Retrieve all candidate summaries with optional search and skill filtering.",
)
async def list_candidates(
    search: Optional[str] = Query(
        default=None,
        description="Filter by candidate ID, full name, email, headline, location, or skills",
    ),
    skill: Optional[str] = Query(
        default=None,
        description="Filter candidates possessing specific skill(s) (supports comma-separated values)",
    ),
    user: User = Depends(require_role(Role.recruiter, Role.hiring_manager, Role.hr_admin)),
    include_synthetic: bool = Query(False),
    response: Response = None,
):
    """Retrieve candidate summaries with optional filtering."""
    params = CandidateFilterParams(search=search, skill=skill)
    workspace = workspace_of(user)
    candidates = [c for c in seed_loader.get_candidates(params=params) if in_workspace(c, workspace)]
    if is_restricted(role_for(user)) and search:
        # Managers cannot discover masked contact details by searching for them.
        needle = search.strip().casefold()
        candidates = [c for c in candidates if needle in c.id.casefold() or needle in c.full_name.casefold()
                      or needle in c.headline.casefold() or any(needle in s.casefold() for s in c.top_skills)]
    if may_include_synthetic(user.roles, include_synthetic) and response is not None:
        response.headers["X-Synthetic-Data"] = "true"
    return [serialize_candidate(candidate, user) for candidate in candidates]


@router.get("/resolve")
async def resolve_candidates(name: str | None = None, email: str | None = None,
                             user=Depends(require_role(Role.recruiter, Role.hiring_manager, Role.hr_admin)),
                             service: ContextBuilder = Depends(get_context_builder)):
    name = name.strip().casefold() if name else ""
    email = email.strip().casefold() if email else ""
    if not name and not email:
        raise HTTPException(422, "Provide a non-empty name or email.")
    if email and is_restricted(role_for(user)):
        # Matching on an email would confirm a value the manager is not allowed to see.
        raise HTTPException(403, "Insufficient permissions")
    workspace = workspace_of(user)
    return [serialize_candidate(candidate, user) for candidate in service.repository.all_candidate_details()
            if in_workspace(candidate, workspace)
            and (not name or name in candidate.full_name.casefold())
            and (not email or email == str(candidate.email).strip().casefold())]


def find_candidate(service, candidate_id, workspace_id: str | None = None):
    candidate = service.repository.get_candidate(candidate_id)
    if candidate is None or (workspace_id is not None and not in_workspace(candidate, workspace_id)):
        raise HTTPException(404, "Candidate not found.")
    return candidate


@router.get("/{candidate_id}/context")
async def candidate_context(candidate_id: str, service: ContextBuilder = Depends(get_context_builder), user=Depends(require_role(Role.recruiter, Role.hr_admin))):
    candidate = find_candidate(service, candidate_id, workspace_of(user))
    entry = service.registry.get(candidate.id)
    if entry is None:
        revision = service.reserve(candidate.id)
        service.launch(candidate.id, revision)
        entry = service.registry.get(candidate.id)
    if entry.status == "building":
        # Stages are measured as the build runs, so the pipeline view shows real progress (OI-28).
        stages = [stage.model_dump(mode="json") for stage in entry.stages]
        return JSONResponse(status_code=202, content={"candidate_id": candidate.id, "status": "building", "stages": stages},
                            headers={"Retry-After": "3"})
    if entry.status == "failed":
        raise HTTPException(503, entry.error or "Candidate context build failed.")
    return entry.context


@router.post("/{candidate_id}/context/rebuild", status_code=202,
             summary="Retry a failed context build",
             responses={409: {"description": "The build has not failed (it is building or ready)."}})
async def rebuild_candidate_context(candidate_id: str, service: ContextBuilder = Depends(get_context_builder),
                                    user=Depends(require_role(Role.recruiter, Role.hr_admin))):
    """Restart a failed build from the stored resume (OI-27). Only a failed build can be retried."""
    candidate = find_candidate(service, candidate_id, workspace_of(user))
    state = service.retry_failed(candidate.id)
    if state == "missing":
        raise HTTPException(404, "Candidate not found")
    if state != "building":
        raise HTTPException(409, f"The context build is {state}; only a failed build can be retried.")
    return JSONResponse(status_code=202, content={"candidate_id": candidate.id, "status": "building"},
                        headers={"Retry-After": "3"})


@router.get("/{candidate_id}/resume")
async def candidate_resume(candidate_id: str, service: ContextBuilder = Depends(get_context_builder), user=Depends(require_role(Role.recruiter, Role.hr_admin))):
    # Raw resume text carries unmasked contact details; hiring managers are excluded.
    candidate = find_candidate(service, candidate_id, workspace_of(user))
    with service.repository.candidate_lock:
        pending = service.store.pending_builds.get(candidate.id)
        parsed = pending.parsed_resume.model_copy(deep=True) if pending else None
    if parsed is None:
        path = candidate.resume_path
        if path:
            from pathlib import Path
            path = Path(path)
            if not path.is_absolute():
                path = service.repository.data_dir.parent / path
        parsed = await run_in_threadpool(parse_resume, path, candidate.resume_text_stub)
    if parsed.source == "empty":
        return Response(status_code=204)
    return {"candidate_id": candidate.id, "raw_text": parsed.raw_text,
            "source": parsed.source, "char_count": parsed.char_count}


@router.get(
    "/{candidate_id}",
    summary="Get candidate details by ID",
    description="Retrieve full candidate details including experience, external identifiers, and claims.",
    responses={
        status.HTTP_404_NOT_FOUND: {
            "description": "Candidate not found",
            "content": {
                "application/json": {
                    "example": {"detail": "Candidate with ID 'CAND-999' not found"}
                }
            },
        }
    },
)
async def get_candidate(candidate_id: str, user: User = Depends(require_role(Role.recruiter, Role.hiring_manager, Role.hr_admin))):
    """Retrieve a single candidate's complete profile by unique ID."""
    candidate = seed_loader.get_candidate(candidate_id)
    if not candidate or not in_workspace(candidate, workspace_of(user)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate with ID '{candidate_id}' not found",
        )
    return serialize_candidate(candidate, user)

@router.post('/{candidate_id}/jd-match')
async def jd_match(candidate_id: str, body: JobRequest, service=Depends(get_context_builder), user=Depends(require_role(Role.recruiter, Role.hr_admin))):
    return await candidate_match(candidate_id, body, service, workspace_of(user))
