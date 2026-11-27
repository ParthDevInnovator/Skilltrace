"""Revision-safe, process-local candidate context builds and task lifecycle."""
import asyncio
import logging
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from threading import RLock
from typing import Literal
from uuid import uuid4

from backend.models import CandidateContext, CandidateDetail, EvidenceRecord
from backend.models.context import BUILD_STAGE_NAMES, BuildStage
from backend.services.claim_assessor import REVIEWABLE_LINKS, apply_review, apply_reviews, assess_claims
from backend.services.claim_extractor import extract_claims
from backend.services.claim_reviews import ClaimReviewStore
from backend.services.deduplicator import ResumeIngestionStore, ingestion_store
from backend.services.resume_parser import parse_resume
from backend.services.scoring_engine import compute_recency_multiplier, score_evidence
from backend.services.signal_fetchers.common import SourceUnavailable
from backend.services.signal_fetchers.github import fetch_github
from backend.services.signal_fetchers.leetcode import fetch_leetcode
from backend.services.signal_fetchers.linkedin import fetch_linkedin

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ContextBuildState:
    candidate_id: str
    revision: str
    status: Literal["building", "ready", "failed"] = "building"
    context: CandidateContext | None = None
    error: str | None = None
    unavailable_sources: tuple[str, ...] = ()
    stages: tuple[BuildStage, ...] = ()


def _pending_stages() -> tuple[BuildStage, ...]:
    return tuple(BuildStage(name=name) for name in BUILD_STAGE_NAMES)


class ContextBuildRegistry:
    def __init__(self):
        self._entries: dict[str, ContextBuildState] = {}
        self._lock = RLock()

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def begin(self, candidate_id: str, revision: str | None = None) -> str:
        revision = revision or str(uuid4())
        with self._lock:
            self._entries[candidate_id] = ContextBuildState(candidate_id, revision, stages=_pending_stages())
        return revision

    def stage(self, candidate_id: str, revision: str, name: str, state: str, at: datetime,
              item_count: int | None = None) -> None:
        """Record one measured build step (OI-28); ignored for a superseded revision."""
        with self._lock:
            entry = self._entries.get(candidate_id)
            if entry is None or entry.revision != revision:
                return
            stages = []
            for stage in entry.stages or _pending_stages():
                if stage.name == name:
                    update = {"state": state, "item_count": item_count}
                    if state == "running":
                        update.update(started_at=at, finished_at=None)
                    else:
                        update.update(started_at=stage.started_at or at, finished_at=at)
                    stage = stage.model_copy(update=update)
                stages.append(stage)
            self._entries[candidate_id] = replace(entry, stages=tuple(stages))

    def is_current(self, candidate_id: str, revision: str) -> bool:
        with self._lock:
            entry = self._entries.get(candidate_id)
            return entry is not None and entry.revision == revision

    def get(self, candidate_id: str) -> ContextBuildState | None:
        with self._lock:
            entry = self._entries.get(candidate_id)
            return replace(entry, context=entry.context.model_copy(deep=True)) if entry and entry.context else entry

    def restore(self, candidate_id: str, revision: str, status: str, *, context=None, error=None,
                unavailable_sources=()) -> None:
        """Reinstate a durable build result after a restart."""
        with self._lock:
            self._entries[candidate_id] = ContextBuildState(candidate_id, revision, status,
                context.model_copy(deep=True) if context else None, error, tuple(unavailable_sources))

    def update_context(self, candidate_id: str, change) -> ContextBuildState | None:
        """Replace a ready context in place (same revision); returns the new state."""
        with self._lock:
            entry = self._entries.get(candidate_id)
            if entry is None or entry.status != "ready" or entry.context is None:
                return None
            entry = replace(entry, context=change(entry.context.model_copy(deep=True)))
            self._entries[candidate_id] = entry
            return replace(entry, context=entry.context.model_copy(deep=True))

    def remove(self, candidate_id: str) -> None:
        with self._lock:
            self._entries.pop(candidate_id, None)

    def finish(self, candidate_id: str, revision: str, *, context=None, error=None, unavailable_sources=()) -> bool:
        if context is None and not error:
            raise ValueError("A completed build needs a context or an error")
        with self._lock:
            entry = self._entries.get(candidate_id)
            if entry is None or entry.revision != revision:
                return False
            stages = entry.stages
            if error:
                stages = tuple(stage.model_copy(update={"state": "failed"}) if stage.state == "running" else stage
                               for stage in stages)
            self._entries[candidate_id] = replace(entry, status="failed" if error else "ready", stages=stages,
                context=context.model_copy(deep=True) if context else None,
                error=error, unavailable_sources=tuple(unavailable_sources))
            return True


class ClaimReviewError(Exception):
    """`code` is one of: not_ready, claim_missing, not_reviewable."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class ContextBuilder:
    def __init__(self, store: ResumeIngestionStore, *, registry=None, fetchers=None,
                 clock=None, concurrency: int = 3, persistence=None, reviews: ClaimReviewStore | None = None):
        if concurrency < 1:
            raise ValueError("Context build concurrency must be positive")
        self.store = store
        # Optional durable store (RuntimePersistence). Isolated tests run without one.
        self.persistence = persistence
        # Recruiter decisions on claim evidence links (OI-29); durable when persistence is.
        self.reviews = reviews if reviews is not None else ClaimReviewStore(
            persistence.sessions if persistence is not None else None)
        self.repository = store.repository
        self.registry = registry if registry is not None else ContextBuildRegistry()
        self.fetchers = fetchers if fetchers is not None else {
            "github": fetch_github, "leetcode": fetch_leetcode, "linkedin": fetch_linkedin,
        }
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self._concurrency = concurrency
        self._semaphore = asyncio.Semaphore(concurrency)
        self._tasks: set[asyncio.Task] = set()
        self._graph_tasks: set[asyncio.Task] = set()
        self._graph_locks: dict[str, asyncio.Lock] = {}
        self._task_keys: dict[asyncio.Task, tuple[str, str]] = {}
        self._startup_gate: asyncio.Event | None = None
        self._closing = False
        self._rebuild_lock = asyncio.Lock()
        # Async callables (candidate, status) run after a build is ready or failed, e.g.
        # in-app notifications (OI-33). A failing listener never affects the build.
        self.finish_listeners: list = []

    async def rebuild(self, cache) -> dict:
        """Serialize rebuilds; stop obsolete workers before replacing seed data."""
        async with self._rebuild_lock:
            await self.shutdown()
            try:
                await asyncio.to_thread(cache.clear)
            except Exception:
                self._closing = False
                raise
            with self.repository.candidate_lock:
                self.repository.reload()
                self.store.pending_builds.clear()
                self.registry.clear()
            if self.persistence is not None:
                # Reload empties the cache; durable jobs and candidates come back (OI-47).
                await self.persistence.restore(self, include_contexts=False)
            self.start_all()
            return {"rebuilt_at": datetime.now(timezone.utc).isoformat(),
                    "candidate_count": self.repository.stats()["total_candidates"],
                    "job_count": self.repository.stats()["total_jobs"]}

    async def ingest_resume(self, identity, parsed, filename, raw_bytes, workspace_id=None):
        """Serialize candidate mutation with admin rebuilds; durable before it is reported."""
        async with self._rebuild_lock:
            candidate, updated, revision = await asyncio.to_thread(
                self.store.upsert, identity, parsed, filename, raw_bytes, workspace_id,
            )
            if self.persistence is not None:
                try:
                    pending = self.store.pending_builds[candidate.id]
                    await self.persistence.save_ingest(candidate, revision=revision, filename=pending.filename,
                                                       raw_bytes=raw_bytes, parsed=parsed)
                except Exception:
                    self.store.undo(candidate.id)
                    raise
            self.store.previous_versions.pop(candidate.id, None)
            return candidate, updated, revision, self.reserve(candidate.id, revision)

    async def forget(self, candidate_id: str) -> None:
        """Stop work for a deleted candidate and drop every cached copy of it."""
        tasks = [task for task, key in self._task_keys.items() if key[0] == candidate_id]
        with self.repository.candidate_lock:
            # Remove the registry entry first: a task finishing late fails its revision check.
            self.registry.remove(candidate_id)
            self.store.forget(candidate_id)
            self.repository.delete_candidate(candidate_id)
            self.reviews.forget(candidate_id)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        from backend.services.match_store import match_store
        match_store.clear_candidate(candidate_id)

    def reserve(self, candidate_id: str, revision: str | None = None) -> str | None:
        with self.repository.candidate_lock:
            if self.repository.get_candidate(candidate_id) is None:
                return None
            pending = self.store.pending_builds.get(candidate_id)
            if revision is not None and pending is not None and pending.revision != revision:
                return None
            return self.registry.begin(candidate_id, revision or (pending.revision if pending else None))

    def launch(self, candidate_id: str, revision: str | None) -> None:
        if revision is None or self._closing:
            return
        entry = self.registry.get(candidate_id)
        if entry is None or entry.revision != revision:
            return
        if (candidate_id, revision) in self._task_keys.values():
            return
        task = asyncio.create_task(self._build(candidate_id, revision), name=f"context-{candidate_id}")
        self._tasks.add(task)
        self._task_keys[task] = (candidate_id, revision)
        def done(completed):
            self._tasks.discard(completed)
            self._task_keys.pop(completed, None)
        task.add_done_callback(done)

    def retry_failed(self, candidate_id: str) -> str:
        """Restart a build that ended in `failed` (OI-27). Returns the new state: `building` when a
        retry started, otherwise the unchanged status. Only failed builds restart, so repeated
        clicks cannot pile up work, and a running build is never duplicated."""
        with self.repository.candidate_lock:
            entry = self.registry.get(candidate_id)
            if entry is None or entry.status != "failed":
                return entry.status if entry else "missing"
            revision = self.reserve(candidate_id)
            if revision is None:
                return "missing"
            pending = self.store.pending_builds.get(candidate_id)
            if pending and pending.revision == revision:
                pending.status, pending.stage, pending.error = "building", "queued", None
        self.launch(candidate_id, revision)
        return "building"

    async def launch_background(self, candidate_id: str, revision: str | None) -> None:
        """FastAPI background callback: schedule on its event loop, not a worker thread."""
        self.launch(candidate_id, revision)

    def start_all(self, *, wait_for_requests: bool = False) -> None:
        self._closing = False
        self._semaphore = asyncio.Semaphore(self._concurrency)
        self._startup_gate = asyncio.Event() if wait_for_requests else None
        candidates = self.repository.all_candidate_details()
        # Results restored from durable storage are current; do not rebuild them.
        current = {c.id for c in candidates if (entry := self.registry.get(c.id)) is not None
                   and entry.status in ("ready", "failed")}
        # Publish every building state before scheduling even the first worker.
        reservations = [(candidate.id, self.reserve(candidate.id)) for candidate in candidates if candidate.id not in current]
        for candidate_id, revision in reservations:
            self.launch(candidate_id, revision)

    def release_startup(self) -> None:
        if self._startup_gate is not None:
            self._startup_gate.set()

    async def drain(self) -> None:
        while self._tasks:
            await asyncio.gather(*tuple(self._tasks), return_exceptions=True)

    async def shutdown(self) -> None:
        self._closing = True
        for task in self._graph_tasks:
            task.cancel()
        await asyncio.gather(*tuple(self._graph_tasks), return_exceptions=True)
        self._graph_tasks.clear()
        tasks = tuple(self._tasks)
        for task in tasks:
            if not task.done():
                candidate_id, revision = self._task_keys[task]
                self._fail(candidate_id, revision, "Context build cancelled during shutdown.", ())
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self._tasks.clear()
        self._task_keys.clear()
        self._startup_gate = None

    async def build_context(self, candidate: CandidateDetail) -> CandidateContext | None:
        revision = self.reserve(candidate.id)
        if revision is None:
            raise ValueError("Candidate is not in the repository")
        return await self._build(candidate.id, revision)

    async def _build(self, candidate_id: str, revision: str) -> CandidateContext | None:
        unavailable = []
        try:
            if self._startup_gate is not None:
                await self._startup_gate.wait()
            async with self._semaphore:
                entry = self.registry.get(candidate_id)
                if entry is None or entry.revision != revision:
                    return None
                started = self.clock()
                if started.tzinfo is None:
                    raise ValueError("Build clock must return an aware timestamp")
                reference_date = started.astimezone(timezone.utc).date()

                def mark(name, state, count=None):
                    self.registry.stage(candidate_id, revision, name, state, datetime.now(timezone.utc), count)

                mark("resume_parse", "running")
                with self.repository.candidate_lock:
                    candidate = self.repository.get_candidate(candidate_id)
                    if candidate is None:
                        raise ValueError("Candidate no longer exists")
                    candidate = candidate.model_copy(deep=True)
                    pending = self.store.pending_builds.get(candidate_id)
                    if pending is not None and pending.revision != revision:
                        return None
                    parsed = pending.parsed_resume.model_copy(deep=True) if pending else None
                if parsed is None:
                    path = candidate.resume_path
                    if path:
                        from pathlib import Path
                        path = Path(path)
                        if not path.is_absolute():
                            path = self.repository.data_dir.parent / path
                    parsed = await asyncio.to_thread(parse_resume, path, candidate.resume_text_stub)
                mark("resume_parse", "complete", parsed.char_count)
                mark("claim_extraction", "running")
                claims = await asyncio.to_thread(extract_claims, parsed.raw_text, candidate_id)
                mark("claim_extraction", "complete", len(claims))
                links = candidate.external_identifiers

                async def collect(source):
                    profile = getattr(links, source, None) if links else None
                    mark(source, "running")
                    try:
                        kwargs = {"candidate_id": candidate_id, "reference_date": reference_date}
                        records = await self.fetchers[source](profile or "", **kwargs)
                        normalized = []
                        for record in records:
                            record = EvidenceRecord.model_validate(record)
                            if record.candidate_id != candidate_id:
                                raise ValueError("Evidence belongs to another candidate")
                            multiplier = compute_recency_multiplier(record.observation_date, reference_date)
                            normalized.append(EvidenceRecord.model_validate({**record.model_dump(),
                                "reference_date": reference_date, "recency_multiplier": multiplier,
                                "computed_weight": record.base_weight * multiplier}))
                        # No profile link and nothing found: nothing was looked up, not an empty result.
                        mark(source, "complete" if profile or normalized else "skipped", len(normalized))
                        return normalized
                    except Exception as error:
                        mark(source, "unavailable")
                        logger.warning("Context source unavailable candidate=%s source=%s error_type=%s",
                                       candidate_id, source, type(error).__name__)
                        return error

                sources = ("github", "leetcode", "linkedin")
                results = await asyncio.gather(*(collect(source) for source in sources))
                unavailable = [source for source, result in zip(sources, results) if isinstance(result, Exception)]
                # Source outages are reported on the context. Only when every adapter fails
                # with an unexpected error is the build itself treated as broken.
                if len(unavailable) == len(sources) and not any(isinstance(r, SourceUnavailable) for r in results):
                    raise RuntimeError("All signal adapters failed unexpectedly")
                evidence = {}
                for result in results:
                    if not isinstance(result, Exception):
                        for record in result:
                            evidence.setdefault(record.id, record)
                records = list(evidence.values())
                mark("scoring", "running")
                score, label = score_evidence(records, reference_date)
                mark("scoring", "complete", len(records))
                # Suggest claim-evidence links for a recruiter to review; nothing is verified here (OI-29).
                claims = assess_claims(claims, records)
                candidate = candidate.model_copy(update={"claims_preview": [claim.claim_text for claim in claims]})
                context = CandidateContext(candidate=candidate, claims=claims, evidence_records=records,
                    evidence_score=score, evidence_label=label, resume_text=parsed.raw_text,
                    parse_source=parsed.source, reference_date=reference_date, context_built_at=self.clock(),
                    unavailable_sources=unavailable, claim_assessment="assessed",
                    build_stages=list((self.registry.get(candidate_id) or ContextBuildState(candidate_id, revision)).stages))
                with self.repository.candidate_lock:
                    current = self.store.pending_builds.get(candidate_id)
                    if current and current.revision != revision:
                        return None
                    # Earlier recruiter decisions carry over by stable claim ID.
                    context = context.model_copy(update={
                        "claims": apply_reviews(context.claims, self.reviews.for_candidate(candidate_id))})
                    claims = context.claims
                    if not self.registry.finish(candidate_id, revision, context=context, unavailable_sources=unavailable):
                        return None
                    self.repository.save_candidate(candidate)
                    current = self.store.pending_builds.get(candidate_id)
                    if current and current.revision == revision:
                        current.claims = claims
                        current.status = "ready"
                        current.stage = "ready"
                        current.error = None
                logger.info("Context ready candidate=%s unavailable_sources=%s", candidate_id, unavailable)
                await self._persist(candidate, revision, "ready", context=context, unavailable=unavailable)
                from backend.config import settings
                if settings.GRAPH_SEEDING_ENABLED:
                    task = asyncio.create_task(self._seed_graph(candidate_id, revision, context))
                    self._graph_tasks.add(task)
                    task.add_done_callback(self._graph_tasks.discard)
                await self._announce(candidate, "ready")
                return context
        except asyncio.CancelledError:
            self._fail(candidate_id, revision, "Context build cancelled during shutdown.", unavailable)
            raise
        except Exception as error:
            logger.error("Context build failed candidate=%s error_type=%s", candidate_id, type(error).__name__)
            message = "Candidate context build failed. Retry the build."
            self._fail(candidate_id, revision, message, unavailable)
            candidate = self.repository.get_candidate(candidate_id)
            if candidate is not None:
                await self._persist(candidate, revision, "failed", error=message, unavailable=unavailable)
                await self._announce(candidate, "failed")
            return None

    async def _announce(self, candidate, status: str) -> None:
        for listener in list(self.finish_listeners):
            try:
                await listener(candidate, status)
            except Exception:
                logger.warning("Build finish listener failed candidate=%s", candidate.id)

    async def review_claim(self, candidate_id: str, claim_id: str, decision, *, reviewer: str,
                           reviewer_id=None, workspace_id: str | None = None):
        """Record (or with decision=None, clear) a recruiter's decision on a claim's evidence link.

        Only a ready context's claims with a supported/contradiction link can be reviewed. The
        decision is durable before the served context changes. Returns the updated claim.
        """
        from backend.models.context import ClaimReview
        entry = self.registry.get(candidate_id)
        if entry is None or entry.status != "ready" or entry.context is None:
            raise ClaimReviewError("not_ready", "The candidate context is not ready; claims cannot be reviewed yet.")
        claim = next((c for c in entry.context.claims if c.id == claim_id), None)
        if claim is None:
            raise ClaimReviewError("claim_missing", "Claim not found in the current context.")
        if decision is None:
            await self.reviews.clear(candidate_id, claim_id)
        else:
            if claim.evidence_link not in REVIEWABLE_LINKS:
                raise ClaimReviewError("not_reviewable",
                                       "Only claims linked to evidence or flagged as a possible contradiction can be reviewed.")
            review = ClaimReview(decision=decision, reviewed_link=claim.evidence_link, reviewed_by=reviewer,
                                 reviewed_at=datetime.now(timezone.utc))
            await self.reviews.save(candidate_id, claim_id, review, reviewer_id=reviewer_id, workspace_id=workspace_id)
        reviews = self.reviews.for_candidate(candidate_id)

        def change(context):
            return context.model_copy(update={"claims": [apply_review(c, reviews.get(c.id)) if c.id == claim_id else c
                                                         for c in context.claims]})
        with self.repository.candidate_lock:
            updated = self.registry.update_context(candidate_id, change)
            pending = self.store.pending_builds.get(candidate_id)
            if updated is not None and pending is not None and pending.revision == updated.revision:
                pending.claims = list(updated.context.claims)
        from backend.services.match_store import match_store
        match_store.clear_candidate(candidate_id)  # Confirmed contradictions change matching.
        if updated is None:
            # A rebuild started meanwhile; it applies the stored decision when it finishes.
            raise ClaimReviewError("not_ready", "The candidate context is rebuilding; the decision was saved and applies when it finishes.")
        candidate = self.repository.get_candidate(candidate_id)
        if candidate is not None:
            await self._persist(candidate, updated.revision, "ready", context=updated.context,
                                unavailable=updated.unavailable_sources)
        claim = next((c for c in updated.context.claims if c.id == claim_id), None)
        if claim is None:
            raise ClaimReviewError("claim_missing", "Claim not found in the current context.")
        return claim

    async def _persist(self, candidate, revision, status, *, context=None, error=None, unavailable=()):
        # Only uploaded candidates are durable; bundled fixtures are rebuilt from disk.
        if self.persistence is None or candidate.id not in self.store.pending_builds:
            return
        await self.persistence.save_build(candidate, revision, status=status, context=context,
                                          error=error, unavailable_sources=unavailable)

    async def _seed_graph(self, candidate_id, revision, context):
        # One seed per candidate at a time, and only for the revision that is still
        # current, so an older build cannot overwrite a newer graph (OI-20). The
        # seeder also rejects older contexts inside its transaction.
        try:
            from backend.services.graph.seeder import seed_candidate_graph
            async with self._graph_locks.setdefault(candidate_id, asyncio.Lock()):
                if not self.registry.is_current(candidate_id, revision):
                    return
                await seed_candidate_graph(candidate_id, context, revision=revision)
        except Exception:
            logger.warning('Graph background seeding failed candidate=%s', candidate_id)

    def _fail(self, candidate_id, revision, message, unavailable):
        with self.repository.candidate_lock:
            if self.registry.finish(candidate_id, revision, error=message, unavailable_sources=unavailable):
                pending = self.store.pending_builds.get(candidate_id)
                if pending and pending.revision == revision:
                    pending.status = "failed"
                    pending.stage = "failed"
                    pending.error = message


from backend.services.runtime_persistence import runtime_persistence  # noqa: E402

context_builder = ContextBuilder(ingestion_store, persistence=runtime_persistence)
from backend.services.notifications import on_build_finished  # noqa: E402

context_builder.finish_listeners.append(on_build_finished)


async def build_context(candidate: CandidateDetail) -> CandidateContext | None:
    return await context_builder.build_context(candidate)
