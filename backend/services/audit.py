"""Observable audit delivery: failures are logged, counted and retried, never silently dropped."""
import asyncio
import logging
from collections import deque
from datetime import datetime, timezone

from backend.core.database import session_factory
from backend.models.db import AuditLog

logger = logging.getLogger("skitrace.audit")
MAX_BUFFERED = 1000
MAX_ATTEMPTS = 3


class AuditWriter:
    def __init__(self):
        self.written = 0
        self.failed = 0
        self.dropped = 0
        self._buffer: deque[list] = deque()  # [row, failed_attempts]
        self._lock = asyncio.Lock()

    def stats(self) -> dict:
        return {"written": self.written, "failed_attempts": self.failed,
                "buffered": len(self._buffer), "dropped": self.dropped}

    async def _insert(self, rows: list[dict]) -> None:
        async with session_factory()() as db:
            db.add_all([AuditLog(**row) for row in rows])
            await db.commit()

    async def record(self, *, user_id=None, roles=(), endpoint: str, method: str, action_type: str,
                     candidate_id: str | None = None, workspace_id: str | None = None,
                     status_code: int | None = None, detail: dict | None = None) -> bool:
        row = {"user_id": _uuid_or_none(user_id), "role_snapshot": ",".join(roles or ())[:500],
               "endpoint": endpoint[:500], "method": method[:16], "action_type": action_type[:32],
               "candidate_id": candidate_id, "workspace_id": workspace_id, "status_code": status_code,
               "detail": detail, "occurred_at": datetime.now(timezone.utc)}
        async with self._lock:
            self._buffer.append([row, 0])
            return await self._drain(row)

    async def _drain(self, newest: dict | None = None) -> bool:
        """Write buffered rows; a row that keeps failing on its own is eventually dropped (logged)."""
        rows = [entry[0] for entry in self._buffer]
        try:
            await self._insert(rows)
            self.written += len(rows)
            self._buffer.clear()
            return True
        except Exception:
            self.failed += 1
            logger.exception("Audit batch write failed; retrying rows individually buffered=%s", len(rows))
        survivors: deque = deque()
        newest_ok = False
        for entry in self._buffer:
            try:
                await self._insert([entry[0]])
                self.written += 1
                newest_ok = newest_ok or entry[0] is newest
            except Exception:
                entry[1] += 1
                if entry[1] >= MAX_ATTEMPTS:
                    self.dropped += 1
                    logger.error("Audit record dropped after %s attempts endpoint=%s action=%s",
                                 entry[1], entry[0]["endpoint"], entry[0]["action_type"])
                else:
                    survivors.append(entry)
        while len(survivors) > MAX_BUFFERED:
            survivors.popleft()
            self.dropped += 1
            logger.error("Audit buffer full; oldest record dropped")
        self._buffer = survivors
        return newest_ok

    async def flush(self) -> bool:
        async with self._lock:
            return True if not self._buffer else await self._drain()


def _uuid_or_none(value):
    import uuid
    if value is None or isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


audit_writer = AuditWriter()


async def audit_user_action(user, *, endpoint: str, method: str, action_type: str, candidate_id: str | None = None,
                            status_code: int | None = None, detail: dict | None = None, db=None) -> bool:
    """Prefer the request's own session (no second writer contending with it); fall back to the writer."""
    if db is not None:
        try:
            db.add(AuditLog(user_id=_uuid_or_none(getattr(user, "id", None)),
                            role_snapshot=",".join(getattr(user, "roles", []) or [])[:500], endpoint=endpoint[:500],
                            method=method[:16], action_type=action_type[:32], candidate_id=candidate_id,
                            workspace_id=getattr(user, "workspace_id", None), status_code=status_code, detail=detail,
                            occurred_at=datetime.now(timezone.utc)))
            await db.commit()
            audit_writer.written += 1
            return True
        except Exception:
            await db.rollback()
            audit_writer.failed += 1
            logger.exception("In-request audit write failed endpoint=%s; using the background writer", endpoint)
    return await audit_writer.record(user_id=getattr(user, "id", None), roles=list(getattr(user, "roles", []) or []),
                                     endpoint=endpoint, method=method, action_type=action_type, candidate_id=candidate_id,
                                     workspace_id=getattr(user, "workspace_id", None), status_code=status_code, detail=detail)
