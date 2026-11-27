"""One erasure workflow covering every store that can hold a candidate (OI-03)."""
import logging

from fastapi import HTTPException
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.workspace import in_workspace
from backend.models.db import (ApplicationHistory, AuditLog, Candidate, CandidateResume, ChatHistory,
    ClaimReview, ContextBuildStatus, EvidenceRecord, InterviewFeedback, MatchResult, ResumeClaim)
from backend.services.audit import audit_user_action

logger = logging.getLogger(__name__)

SQL_MODELS = (ChatHistory, InterviewFeedback, ApplicationHistory, EvidenceRecord, ResumeClaim, ClaimReview, MatchResult,
              ContextBuildStatus, CandidateResume, AuditLog)


async def delete_candidate_everywhere(candidate_id: str, workspace_id: str, user, db: AsyncSession, builder,
                                      graph_client=None, signal_cache=None) -> dict:
    runtime = builder.repository.get_candidate(candidate_id)
    stored = await db.get(Candidate, candidate_id)
    visible = [record for record in (runtime, stored) if record is not None]
    if not visible or not all(in_workspace(record, workspace_id) for record in visible):
        raise HTTPException(404, "Candidate not found")
    candidate_id = (runtime or stored).id
    handles = []
    if runtime is not None and runtime.external_identifiers:
        # Profile URLs and bare usernames both reduce to the username used in cache keys.
        handles = [str(value).rstrip("/").rsplit("/", 1)[-1] for value in
                   runtime.external_identifiers.model_dump().values() if value]

    # 1. Graph first: if it fails nothing else is removed, so the request can be retried.
    graph_status = "disabled"
    if graph_client is not None and graph_client.enabled:
        if not await graph_client.delete_candidate(candidate_id):
            raise HTTPException(503, "Knowledge graph is unavailable; no data was removed. Retry the deletion.")
        graph_status = "deleted"

    # 2. Durable rows, in one transaction.
    try:
        for model in SQL_MODELS:
            await db.execute(delete(model).where(model.candidate_id == candidate_id))
        await db.execute(delete(Candidate).where(Candidate.id == candidate_id))
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("Candidate deletion failed candidate=%s", candidate_id)
        raise HTTPException(500, "Deletion failed; database records were not removed. Retry the deletion.") from None

    # 3. Runtime caches and in-flight work (cancelled builds cannot write back).
    await builder.forget(candidate_id)

    # 4. Cached public-profile responses fetched for this candidate.
    removed_signals = 0
    if signal_cache is not None and handles:
        try:
            removed_signals = signal_cache.delete_matching(handles)
        except Exception:
            logger.warning("Signal cache cleanup failed candidate=%s", candidate_id)

    await audit_user_action(user, endpoint=f"/candidates/{candidate_id}", method="DELETE", action_type="DELETE",
                            candidate_id=candidate_id, status_code=204,
                            detail={"erased": True, "graph": graph_status, "signal_cache_entries": removed_signals}, db=db)
    return {"candidate_id": candidate_id, "graph": graph_status}
