from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status

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
