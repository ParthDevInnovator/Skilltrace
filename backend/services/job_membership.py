"""Job membership (OI-30) and job activity (OI-31).

A candidate profile is reusable across jobs; a JobApplication records that the candidate is being
considered for one job. Per-job counts and job-scoped rankings come from these rows, not from the
whole workspace pool.
"""
from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.workspace import default_workspace_id
from backend.models.db import JobApplication, JobEvent
from backend.models.job import JobCandidateCounts


def _workspace_clause(column, workspace: str):
    if workspace == default_workspace_id():
        return or_(column == workspace, column.is_(None))
    return column == workspace


def actor_of(user) -> tuple[uuid.UUID | None, str]:
    raw = getattr(user, "id", None)
    try:
        actor_id = raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw)) if raw else None
    except ValueError:
        actor_id = None
    return actor_id, (getattr(user, "full_name", None) or getattr(user, "email", None) or "Unknown user")[:255]


def record_event(db: AsyncSession, job_id: str, workspace: str, user, kind: str, *,
                 candidate_id: str | None = None, detail: dict | None = None) -> None:
    """Adds the event to the session; the caller commits it with the change it describes."""
    actor_id, actor_name = actor_of(user)
    db.add(JobEvent(job_id=job_id, workspace_id=workspace, kind=kind, actor_id=actor_id, actor_name=actor_name,
                    candidate_id=candidate_id, detail=detail or {}))


async def add_application(db: AsyncSession, job_id: str, candidate_id: str, workspace: str, user,
                          source: str = "upload") -> bool:
    """Add a candidate to a job and record it. Returns False when they were already on the job."""
    existing = await db.scalar(select(JobApplication).where(JobApplication.job_id == job_id,
                                                            JobApplication.candidate_id == candidate_id))
    if existing is not None:
        return False
    actor_id, _ = actor_of(user)
    db.add(JobApplication(job_id=job_id, candidate_id=candidate_id, workspace_id=workspace, source=source,
                          added_by=actor_id))
    record_event(db, job_id, workspace, user, "candidate_added", candidate_id=candidate_id, detail={"source": source})
    try:
        await db.commit()
    except IntegrityError:  # a concurrent request added the same candidate
        await db.rollback()
        return False
    return True


async def remove_application(db: AsyncSession, job_id: str, candidate_id: str, workspace: str, user) -> bool:
    result = await db.execute(delete(JobApplication).where(
        JobApplication.job_id == job_id, JobApplication.candidate_id == candidate_id,
        _workspace_clause(JobApplication.workspace_id, workspace)))
    if not result.rowcount:
        await db.rollback()
        return False
    record_event(db, job_id, workspace, user, "candidate_removed", candidate_id=candidate_id)
    await db.commit()
    return True


async def applicants(db: AsyncSession, job_ids: list[str], workspace: str) -> dict[str, list[JobApplication]]:
    if not job_ids:
        return {}
    rows = (await db.scalars(select(JobApplication).where(
        JobApplication.job_id.in_(job_ids), _workspace_clause(JobApplication.workspace_id, workspace))
        .order_by(JobApplication.added_at))).all()
    grouped: dict[str, list[JobApplication]] = defaultdict(list)
    for row in rows:
        grouped[row.job_id].append(row)
    return grouped


def counts_for(rows: list[JobApplication], repository, registry) -> JobCandidateCounts:
    counts = JobCandidateCounts()
    for row in rows:
        if repository.get_candidate(row.candidate_id) is None:
            continue  # erased or not restored; never counted as known
        counts.total += 1
        entry = registry.get(row.candidate_id)
        status = entry.status if entry else None
        if status == "ready":
            counts.analyzed += 1
        elif status == "failed":
            counts.failed += 1
        else:
            counts.processing += 1
    return counts


async def job_events(db: AsyncSession, job_id: str, workspace: str, limit: int = 100) -> list[JobEvent]:
    return (await db.scalars(select(JobEvent).where(
        JobEvent.job_id == job_id, _workspace_clause(JobEvent.workspace_id, workspace))
        .order_by(JobEvent.occurred_at.desc()).limit(limit))).all()
