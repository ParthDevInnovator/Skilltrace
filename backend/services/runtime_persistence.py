"""Durable storage for runtime candidates, original resumes and context builds (OI-01).

SQL is the source of truth; SeedLoader, the ingestion store and the build
registry are caches that are refilled from here on startup.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import delete, select

from backend.core.database import session_factory
from backend.core.workspace import record_workspace
from backend.models import CandidateContext, CandidateDetail, Job
from backend.models.db import Candidate, CandidateResume, ContextBuildStatus, Job as DBJob, JobRequirement
from backend.services.resume_parser import ParsedResume

logger = logging.getLogger(__name__)


class PersistenceError(RuntimeError):
    pass


def _candidate_row_values(candidate: CandidateDetail) -> dict:
    return {"full_name": candidate.full_name, "headline": candidate.headline or "", "email": str(candidate.email),
            "location": candidate.location, "is_synthetic": False, "workspace_id": record_workspace(candidate),
            "profile_json": candidate.model_dump(mode="json")}


class RuntimePersistence:
    def __init__(self, factory=None):
        self._factory = factory

    def sessions(self):
        return self._factory or session_factory()

    async def save_ingest(self, candidate: CandidateDetail, *, revision: str, filename: str,
                          raw_bytes: bytes, parsed: ParsedResume) -> None:
        """Candidate identity, original document and a `building` status in one transaction."""
        now = datetime.now(timezone.utc)
        try:
            async with self.sessions()() as db:
                row = await db.get(Candidate, candidate.id)
                if row is None:
                    db.add(Candidate(id=candidate.id, **_candidate_row_values(candidate)))
                else:
                    for key, value in _candidate_row_values(candidate).items():
                        setattr(row, key, value)
                await db.flush()
                resume = await db.get(CandidateResume, candidate.id)
                values = {"workspace_id": record_workspace(candidate), "revision": revision, "filename": filename,
                          "content": raw_bytes, "parsed_json": parsed.model_dump(mode="json"), "uploaded_at": now}
                if resume is None:
                    db.add(CandidateResume(candidate_id=candidate.id, **values))
                else:
                    for key, value in values.items():
                        setattr(resume, key, value)
                status = await db.get(ContextBuildStatus, candidate.id)
                build = {"workspace_id": record_workspace(candidate), "revision": revision, "status": "building",
                         "started_at": now, "finished_at": None, "error_message": None, "context_json": None,
                         "unavailable_sources": []}
                if status is None:
                    db.add(ContextBuildStatus(candidate_id=candidate.id, **build))
                else:
                    for key, value in build.items():
                        setattr(status, key, value)
                await db.commit()
        except Exception as error:
            logger.exception("Runtime persistence failed candidate=%s", candidate.id)
            raise PersistenceError("Candidate could not be saved") from error

    async def save_build(self, candidate: CandidateDetail, revision: str, *, status: str,
                         context: CandidateContext | None = None, error: str | None = None,
                         unavailable_sources=()) -> bool:
        """Record a finished build unless a newer upload already replaced its revision."""
        try:
            async with self.sessions()() as db:
                row = await db.get(ContextBuildStatus, candidate.id)
                if row is None or row.revision != revision:
                    return False
                row.status = status
                row.finished_at = datetime.now(timezone.utc)
                row.error_message = error
                row.context_json = context.model_dump(mode="json") if context else None
                row.unavailable_sources = list(unavailable_sources)
                stored = await db.get(Candidate, candidate.id)
                if stored is not None and status == "ready":
                    for key, value in _candidate_row_values(candidate).items():
                        setattr(stored, key, value)
                await db.commit()
                return True
        except Exception:
            logger.exception("Context build persistence failed candidate=%s", candidate.id)
            return False

    async def delete_candidate(self, db, candidate_id: str) -> None:
        """Remove runtime rows inside the caller's transaction."""
        for model in (ContextBuildStatus, CandidateResume):
            await db.execute(delete(model).where(model.candidate_id == candidate_id))

    async def restore(self, builder, *, include_contexts: bool = True) -> dict:
        """Refill the caches: custom jobs, candidates, resumes and finished contexts."""
        from backend.services.deduplicator import PendingContextBuild
        counts = {"jobs": 0, "candidates": 0, "resumes": 0, "contexts": 0}
        async with self.sessions()() as db:
            for row in (await db.scalars(select(DBJob).where(DBJob.is_custom.is_(True)))).all():
                requirements = (await db.scalars(select(JobRequirement).where(JobRequirement.job_id == row.id)
                                                 .order_by(JobRequirement.id))).all()
                builder.repository.add_job(Job(
                    id=row.id, title=row.title, department=row.department, location=row.location,
                    description_raw=row.description_raw, created_at=row.created_at.isoformat(),
                    workspace_id=row.workspace_id or record_workspace(None),
                    requirements=[{"id": r.id, "requirement_text": r.skill, "is_mandatory": r.level == "required"}
                                  for r in requirements],
                    requirements_preview=[r.skill for r in requirements[:4]]))
                counts["jobs"] += 1
            candidates = (await db.scalars(select(Candidate).where(Candidate.profile_json.is_not(None)))).all()
            resumes = {r.candidate_id: r for r in (await db.scalars(select(CandidateResume))).all()}
            builds = {b.candidate_id: b for b in (await db.scalars(select(ContextBuildStatus))).all()}
        for row in candidates:
            try:
                candidate = CandidateDetail.model_validate({**row.profile_json, "workspace_id": row.workspace_id})
            except Exception:
                logger.exception("Stored candidate could not be restored candidate=%s", row.id)
                continue
            with builder.repository.candidate_lock:
                builder.repository.save_candidate(candidate)
                resume = resumes.get(row.id)
                if resume is not None:
                    builder.store.pending_builds[row.id] = PendingContextBuild(
                        resume.revision, resume.filename, resume.content, ParsedResume.model_validate(resume.parsed_json))
                    counts["resumes"] += 1
            counts["candidates"] += 1
            build = builds.get(row.id)
            if not include_contexts or build is None or resume is None or build.revision != resume.revision:
                continue  # No current result: start_all() rebuilds it.
            if build.status == "ready" and build.context_json:
                try:
                    context = CandidateContext.model_validate(build.context_json)
                except Exception:
                    logger.exception("Stored context could not be restored candidate=%s", row.id)
                    continue
                builder.registry.restore(row.id, build.revision, "ready", context=context,
                                         unavailable_sources=tuple(build.unavailable_sources or ()))
                pending = builder.store.pending_builds[row.id]
                pending.status = pending.stage = "ready"
                pending.claims = list(context.claims)
                counts["contexts"] += 1
            elif build.status == "failed":
                builder.registry.restore(row.id, build.revision, "failed", error=build.error_message,
                                         unavailable_sources=tuple(build.unavailable_sources or ()))
        logger.info("Restored runtime state %s", counts)
        return counts


runtime_persistence = RuntimePersistence()
