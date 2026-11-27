"""Recruiter confirm/dismiss decisions on claim evidence links (OI-29).

An in-memory map is the cache read by context builds; SQL is the durable copy, written
before the cache changes. A store without a session factory (isolated tests) is memory-only.
"""
import logging
import uuid
from datetime import timezone
from threading import RLock

from sqlalchemy import delete, select

from backend.models.context import ClaimReview
from backend.models.db import ClaimReview as ClaimReviewRow

logger = logging.getLogger(__name__)


class ClaimReviewStore:
    def __init__(self, sessions=None):
        # Callable returning an async session factory, or None for memory-only.
        self._sessions = sessions
        self._reviews: dict[str, dict[str, ClaimReview]] = {}
        self._lock = RLock()

    def for_candidate(self, candidate_id: str) -> dict[str, ClaimReview]:
        with self._lock:
            return dict(self._reviews.get(candidate_id, {}))

    def forget(self, candidate_id: str) -> None:
        """Drop cached reviews; erasure deletes the SQL rows in its own transaction."""
        with self._lock:
            self._reviews.pop(candidate_id, None)

    async def load(self) -> int:
        if self._sessions is None:
            return 0
        loaded: dict[str, dict[str, ClaimReview]] = {}
        async with self._sessions()() as db:
            for row in (await db.scalars(select(ClaimReviewRow))).all():
                try:
                    loaded.setdefault(row.candidate_id, {})[row.claim_id] = ClaimReview(
                        decision=row.decision, reviewed_link=row.reviewed_link,
                        reviewed_by=row.reviewed_by,
                        # SQLite drops the offset; stored times are UTC.
                        reviewed_at=row.reviewed_at if row.reviewed_at.tzinfo else row.reviewed_at.replace(tzinfo=timezone.utc))
                except Exception:
                    logger.exception("Stored claim review skipped candidate=%s", row.candidate_id)
        with self._lock:
            self._reviews = loaded
        return sum(len(items) for items in loaded.values())

    async def save(self, candidate_id: str, claim_id: str, review: ClaimReview, *,
                   reviewer_id=None, workspace_id: str | None = None) -> None:
        if self._sessions is not None:
            async with self._sessions()() as db:
                row = await db.get(ClaimReviewRow, (candidate_id, claim_id))
                values = {"decision": review.decision.value, "reviewed_link": review.reviewed_link.value,
                          "reviewed_by": review.reviewed_by[:255], "reviewer_id": _uuid_or_none(reviewer_id),
                          "reviewed_at": review.reviewed_at, "workspace_id": workspace_id}
                if row is None:
                    db.add(ClaimReviewRow(candidate_id=candidate_id, claim_id=claim_id, **values))
                else:
                    for key, value in values.items():
                        setattr(row, key, value)
                await db.commit()
        with self._lock:
            self._reviews.setdefault(candidate_id, {})[claim_id] = review

    async def clear(self, candidate_id: str, claim_id: str) -> None:
        if self._sessions is not None:
            async with self._sessions()() as db:
                await db.execute(delete(ClaimReviewRow).where(ClaimReviewRow.candidate_id == candidate_id,
                                                              ClaimReviewRow.claim_id == claim_id))
                await db.commit()
        with self._lock:
            self._reviews.get(candidate_id, {}).pop(claim_id, None)


def _uuid_or_none(value):
    try:
        return value if isinstance(value, uuid.UUID) or value is None else uuid.UUID(str(value))
    except ValueError:
        return None
