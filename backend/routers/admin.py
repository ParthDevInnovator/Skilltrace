"""Explicitly key-protected prototype seed rebuild; disabled without a key."""
import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.config import settings
from backend.core.database import get_db
from backend.core.dependencies import require_role
from backend.core.roles import Role
from backend.models.db import (ApplicationHistory, AuditLog, Candidate, ChatHistory,
    EvidenceRecord, InterviewFeedback, MatchResult, ResumeClaim, User)
from backend.routers.ingest import get_context_builder
from backend.services.context_builder import ContextBuilder
from backend.services.signal_fetchers import default_cache

router = APIRouter(tags=["Administration"])


def get_signal_cache():
    return default_cache()


@router.post("/seed/rebuild")
async def rebuild_seed(x_admin_key: str | None = Header(default=None),
                       service: ContextBuilder = Depends(get_context_builder),
                       cache=Depends(get_signal_cache),
                       user: User = Depends(require_role(Role.hr_admin))):
    configured = settings.ADMIN_KEY.get_secret_value() if settings.ADMIN_KEY else ""
    if not configured:
        raise HTTPException(403, "Seed rebuild is disabled until ADMIN_KEY is configured.")
    if not x_admin_key or not secrets.compare_digest(x_admin_key.encode(), configured.encode()):
        raise HTTPException(401, "Invalid or missing admin key.")
    try:
        return await service.rebuild(cache)
    except Exception:
        raise HTTPException(503, "Seed rebuild failed. Check server configuration and retry.") from None


@router.get("/api/v1/admin/audit-logs")
async def audit_logs(user_id: str | None = None, candidate_id: str | None = None,
                     action_type: str | None = None, date_from: datetime | None = None,
                     date_to: datetime | None = None, page: int = Query(1, ge=1),
                     page_size: int = Query(50, ge=1, le=200),
                     db: AsyncSession = Depends(get_db),
                     user: User = Depends(require_role(Role.hr_admin))):
    query = select(AuditLog)
    if user_id: query = query.where(AuditLog.user_id == user_id)
    if candidate_id: query = query.where(AuditLog.candidate_id == candidate_id)
    if action_type: query = query.where(AuditLog.action_type == action_type)
    if date_from: query = query.where(AuditLog.occurred_at >= date_from)
    if date_to: query = query.where(AuditLog.occurred_at <= date_to)
    rows = (await db.scalars(query.order_by(AuditLog.occurred_at.desc()).offset((page-1)*page_size).limit(page_size))).all()
    return [{column.key: getattr(row, column.key) for column in row.__table__.columns} for row in rows]


async def _delete_candidate(candidate_id: str, db: AsyncSession, user: User):
    candidate = await db.get(Candidate, candidate_id)
    if candidate is None: raise HTTPException(404, "Candidate not found")
    # Durable audit record is deliberately independent of the deletion transaction.
    db.add(AuditLog(user_id=user.id, role_snapshot=",".join(user.roles), endpoint=f"/candidates/{candidate_id}",
                    method="DELETE", candidate_id=None, action_type="DELETE"))
    await db.commit()
    try:
        async with db.begin():
            for model in (ChatHistory, InterviewFeedback, ApplicationHistory, EvidenceRecord, ResumeClaim, MatchResult, AuditLog):
                await db.execute(delete(model).where(model.candidate_id == candidate_id))
            await db.delete(candidate)
    except Exception:
        await db.rollback()
        raise HTTPException(500, "Deletion failed; no data was removed.") from None
    # Keep the legacy read-through adapter coherent while Phase 2-4 services
    # finish moving to SQL repositories.
    from backend.services.seed_loader import seed_loader
    with seed_loader.candidate_lock:
        seed_loader._candidates.pop(candidate_id, None)
    return Response(status_code=204)


@router.delete("/api/v1/candidates/{candidate_id}", status_code=204)
@router.delete("/candidates/{candidate_id}", status_code=204)
async def delete_candidate(candidate_id: str, db: AsyncSession = Depends(get_db),
                           user: User = Depends(require_role(Role.hr_admin))):
    return await _delete_candidate(candidate_id, db, user)
