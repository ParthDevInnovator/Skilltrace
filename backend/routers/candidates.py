from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from backend.routers.ingest import get_context_builder
from backend.services.context_builder import ContextBuilder
from backend.services.resume_parser import parse_resume

from backend.models import CandidateDetail, CandidateFilterParams, CandidateSummary
from backend.services.seed_loader import seed_loader

router = APIRouter(tags=["Candidates"])


@router.get(
    "",
    response_model=List[CandidateSummary],
    summary="List candidate summaries",
    description="Retrieve all seeded candidate summaries with optional search and skill filtering.",
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
) -> List[CandidateSummary]:
    """Retrieve seeded candidate summaries with optional filtering."""
    params = CandidateFilterParams(search=search, skill=skill)
    return seed_loader.get_candidates(params=params)


@router.get("/resolve", response_model=List[CandidateSummary])
async def resolve_candidates(name: str | None = None, email: str | None = None,
                             service: ContextBuilder = Depends(get_context_builder)):
    name = name.strip().casefold() if name else ""
    email = email.strip().casefold() if email else ""
    if not name and not email:
        raise HTTPException(422, "Provide a non-empty name or email.")
    return [candidate for candidate in service.repository.all_candidate_details()
            if (not name or name in candidate.full_name.casefold())
            and (not email or email == str(candidate.email).strip().casefold())]


def find_candidate(service, candidate_id):
    candidate = service.repository.get_candidate(candidate_id)
    if candidate is None:
        raise HTTPException(404, "Candidate not found.")
    return candidate


@router.get("/{candidate_id}/context")
async def candidate_context(candidate_id: str, service: ContextBuilder = Depends(get_context_builder)):
    candidate = find_candidate(service, candidate_id)
    entry = service.registry.get(candidate.id)
    if entry is None:
        revision = service.reserve(candidate.id)
        service.launch(candidate.id, revision)
        entry = service.registry.get(candidate.id)
    if entry.status == "building":
        return JSONResponse(status_code=202, content={"candidate_id": candidate.id, "status": "building"}, headers={"Retry-After": "3"})
    if entry.status == "failed":
        raise HTTPException(503, entry.error or "Candidate context build failed.")
    return entry.context


@router.get("/{candidate_id}/resume")
async def candidate_resume(candidate_id: str, service: ContextBuilder = Depends(get_context_builder)):
    candidate = find_candidate(service, candidate_id)
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
    response_model=CandidateDetail,
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
async def get_candidate(candidate_id: str) -> CandidateDetail:
    """Retrieve a single candidate's complete profile by unique ID."""
    candidate = seed_loader.get_candidate(candidate_id)
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate with ID '{candidate_id}' not found",
        )
    return candidate
