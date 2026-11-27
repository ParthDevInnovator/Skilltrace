"""In-app notifications (OI-33).

Sources:
- analysis finished or failed, for the person who uploaded the resume;
- a new membership request, for HR admins of the default workspace;
- a status change on a job, for the job's creator when someone else made it.

Upload watches are kept in memory: after a restart, builds already running no longer notify.
The build state itself stays visible in the app.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from threading import Lock

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import session_factory
from backend.core.roles import Role
from backend.models.db import Notification, User

logger = logging.getLogger(__name__)
MAX_LISTED = 50


def _uuid(value) -> uuid.UUID | None:
    if value is None or isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


def add_notification(db: AsyncSession, user_id, workspace: str | None, kind: str, title: str, body: str = "", *,
                     candidate_id: str | None = None, job_id: str | None = None) -> bool:
    """Adds to the session; the caller commits. Principals without a stored user are skipped."""
    target = _uuid(user_id)
    if target is None:
        return False
    db.add(Notification(user_id=target, workspace_id=workspace, kind=kind, title=title[:255], body=body,
                        candidate_id=candidate_id, job_id=job_id))
    return True


async def notify_admins_of_request(db: AsyncSession, requester: User) -> None:
    """A membership request waits for HR admins of the default workspace (see admission)."""
    from backend.core.workspace import default_workspace_id
    workspace = default_workspace_id()
    admins = (await db.scalars(select(User).where(User.workspace_id == workspace, User.is_active.is_(True)))).all()
    for admin in admins:
        if Role.hr_admin.value in (admin.roles or []):
            add_notification(db, admin.id, workspace, "membership_request", "New access request",
                             f"{requester.full_name or requester.email} is waiting for workspace access.")


class BuildWatches:
    """Who to tell when a candidate's analysis finishes."""

    def __init__(self):
        self._lock = Lock()
        self._watches: dict[str, dict[uuid.UUID, tuple[str | None, str | None]]] = {}

    def watch(self, candidate_id: str, user_id, workspace: str | None, job_id: str | None = None) -> None:
        target = _uuid(user_id)
        if target is None:
            return
        with self._lock:
            self._watches.setdefault(candidate_id, {})[target] = (workspace, job_id)

    def take(self, candidate_id: str) -> dict:
        with self._lock:
            return self._watches.pop(candidate_id, {})

    def forget(self, candidate_id: str) -> None:
        self.take(candidate_id)

    def clear(self) -> None:
        with self._lock:
            self._watches.clear()


build_watches = BuildWatches()


async def on_build_finished(candidate, status: str) -> None:
    """ContextBuilder listener: one notification per watcher, then the watch ends."""
    watchers = build_watches.take(candidate.id)
    if not watchers:
        return
    name = getattr(candidate, "full_name", None) or "A candidate"
    if status == "ready":
        title, body = f"{name} is analyzed", "Evidence and job fit are ready to review."
    else:
        title, body = f"Analysis failed for {name}", "Open the candidate's pipeline to retry the analysis."
    try:
        async with session_factory()() as db:
            for user_id, (workspace, job_id) in watchers.items():
                add_notification(db, user_id, workspace, f"analysis_{status}", title, body,
                                 candidate_id=candidate.id, job_id=job_id)
            await db.commit()
    except Exception:
        logger.warning("Could not record analysis notifications candidate=%s", candidate.id)


async def list_for(db: AsyncSession, user_id, unread_only: bool = False) -> tuple[list[Notification], int]:
    target = _uuid(user_id)
    if target is None:
        return [], 0
    query = select(Notification).where(Notification.user_id == target)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    rows = (await db.scalars(query.order_by(Notification.created_at.desc()).limit(MAX_LISTED))).all()
    unread = await db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == target, Notification.read_at.is_(None)))
    return rows, int(unread or 0)


async def mark_read(db: AsyncSession, user_id, notification_id: str | None = None) -> int:
    target = _uuid(user_id)
    if target is None:
        return 0
    query = update(Notification).where(Notification.user_id == target, Notification.read_at.is_(None))
    if notification_id is not None:
        parsed = _uuid(notification_id)
        if parsed is None:
            return 0
        query = query.where(Notification.id == parsed)
    result = await db.execute(query.values(read_at=datetime.now(timezone.utc)))
    await db.commit()
    return result.rowcount or 0

