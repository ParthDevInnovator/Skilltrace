"""Revision-safe, process-local candidate context builds and task lifecycle."""
import asyncio
import logging
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from threading import RLock
from typing import Literal
from uuid import uuid4

from backend.models import CandidateContext, CandidateDetail, EvidenceRecord
from backend.services.claim_extractor import extract_claims
from backend.services.deduplicator import ResumeIngestionStore, ingestion_store
from backend.services.resume_parser import parse_resume
from backend.services.scoring_engine import compute_recency_multiplier, score_evidence
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
            self._entries[candidate_id] = ContextBuildState(candidate_id, revision)
        return revision

    def get(self, candidate_id: str) -> ContextBuildState | None:
        with self._lock:
            entry = self._entries.get(candidate_id)
            return replace(entry, context=entry.context.model_copy(deep=True)) if entry and entry.context else entry

    def finish(self, candidate_id: str, revision: str, *, context=None, error=None, unavailable_sources=()) -> bool:
        if context is None and not error:
            raise ValueError("A completed build needs a context or an error")
        with self._lock:
            entry = self._entries.get(candidate_id)
            if entry is None or entry.revision != revision:
                return False
            self._entries[candidate_id] = replace(entry, status="failed" if error else "ready",
                context=context.model_copy(deep=True) if context else None,
                error=error, unavailable_sources=tuple(unavailable_sources))
            return True


class ContextBuilder:
    def __init__(self, store: ResumeIngestionStore, *, registry=None, fetchers=None,
                 clock=None, concurrency: int = 3):
        if concurrency < 1:
            raise ValueError("Context build concurrency must be positive")
        self.store = store
        self.repository = store.repository
        self.registry = registry if registry is not None else ContextBuildRegistry()
        self.fetchers = fetchers if fetchers is not None else {
            "github": fetch_github, "leetcode": fetch_leetcode, "linkedin": fetch_linkedin,
        }
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self._concurrency = concurrency
        self._semaphore = asyncio.Semaphore(concurrency)
        self._tasks: set[asyncio.Task] = set()
        self._task_keys: dict[asyncio.Task, tuple[str, str]] = {}
        self._startup_gate: asyncio.Event | None = None
        self._closing = False
        self._rebuild_lock = asyncio.Lock()

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
            self.start_all()
            return {"rebuilt_at": datetime.now(timezone.utc).isoformat(),
                    "candidate_count": self.repository.stats()["total_candidates"],
                    "job_count": self.repository.stats()["total_jobs"]}

    async def ingest_resume(self, identity, parsed, filename, raw_bytes):
        """Serialize candidate mutation with admin rebuilds."""
        async with self._rebuild_lock:
            candidate, updated, revision = await asyncio.to_thread(
                self.store.upsert, identity, parsed, filename, raw_bytes,
            )
            return candidate, updated, revision, self.reserve(candidate.id, revision)

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

    async def launch_background(self, candidate_id: str, revision: str | None) -> None:
        """FastAPI background callback: schedule on its event loop, not a worker thread."""
        self.launch(candidate_id, revision)

    def start_all(self, *, wait_for_requests: bool = False) -> None:
        self._closing = False
        self._semaphore = asyncio.Semaphore(self._concurrency)
        self._startup_gate = asyncio.Event() if wait_for_requests else None
        candidates = self.repository.all_candidate_details()
        # Publish every building state before scheduling even the first worker.
        reservations = [(candidate.id, self.reserve(candidate.id)) for candidate in candidates]
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
                claims = await asyncio.to_thread(extract_claims, parsed.raw_text, candidate_id)
                links = candidate.external_identifiers

                async def collect(source):
                    try:
                        profile = getattr(links, source, None) if links else None
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
                        return normalized
                    except Exception as error:
                        logger.warning("Context source unavailable candidate=%s source=%s error_type=%s",
                                       candidate_id, source, type(error).__name__)
                        return error

                sources = ("github", "leetcode", "linkedin")
                results = await asyncio.gather(*(collect(source) for source in sources))
                unavailable = [source for source, result in zip(sources, results) if isinstance(result, Exception)]
                # Expected network failures are already [] from adapters. Three
                # unexpected adapter failures indicate an unrecoverable build.
                if len(unavailable) == len(sources):
                    raise RuntimeError("All signal adapters failed unexpectedly")
                evidence = {}
                for result in results:
                    if not isinstance(result, Exception):
                        for record in result:
                            evidence.setdefault(record.id, record)
                records = list(evidence.values())
                score, label = score_evidence(records, reference_date)
                candidate = candidate.model_copy(update={"claims_preview": [claim.claim_text for claim in claims]})
                context = CandidateContext(candidate=candidate, claims=claims, evidence_records=records,
                    evidence_score=score, evidence_label=label, resume_text=parsed.raw_text,
                    parse_source=parsed.source, reference_date=reference_date, context_built_at=self.clock())
                with self.repository.candidate_lock:
                    current = self.store.pending_builds.get(candidate_id)
                    if current and current.revision != revision:
                        return None
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
                return context
        except asyncio.CancelledError:
            self._fail(candidate_id, revision, "Context build cancelled during shutdown.", unavailable)
            raise
        except Exception as error:
            logger.error("Context build failed candidate=%s error_type=%s", candidate_id, type(error).__name__)
            self._fail(candidate_id, revision, "Candidate context build failed. Retry the build.", unavailable)
            return None

    def _fail(self, candidate_id, revision, message, unavailable):
        with self.repository.candidate_lock:
            if self.registry.finish(candidate_id, revision, error=message, unavailable_sources=unavailable):
                pending = self.store.pending_builds.get(candidate_id)
                if pending and pending.revision == revision:
                    pending.status = "failed"
                    pending.stage = "failed"
                    pending.error = message


context_builder = ContextBuilder(ingestion_store)


async def build_context(candidate: CandidateDetail) -> CandidateContext | None:
    return await context_builder.build_context(candidate)
