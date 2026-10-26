"""Process-local atomic candidate updates and revisioned resume inputs.

The context builder consumes these inputs asynchronously. This store never
calculates evidence scores or marks claims verified.
"""
import logging
from dataclasses import dataclass, field
from pathlib import Path
from uuid import uuid4

from backend.models import CandidateDetail, ResumeClaim
from backend.models.candidate import ExternalIdentifiers
from backend.services.claim_extractor import DEFAULT_SKILLS
from backend.services.identity_extractor import ExtractedIdentity
from backend.services.resume_parser import ParsedResume
from backend.services.seed_loader import SeedLoader, seed_loader
import re

logger = logging.getLogger(__name__)


class MissingIdentityError(ValueError):
    pass


@dataclass
class PendingContextBuild:
    revision: str
    filename: str
    original_bytes: bytes
    parsed_resume: ParsedResume
    status: str = "building"
    stage: str = "queued"
    claims: list[ResumeClaim] = field(default_factory=list)
    error: str | None = None


class ResumeIngestionStore:
    def __init__(self, repository: SeedLoader):
        self.repository = repository
        self.pending_builds: dict[str, PendingContextBuild] = {}

    def upsert(self, identity: ExtractedIdentity, parsed: ParsedResume,
               filename: str, raw_bytes: bytes) -> tuple[CandidateDetail, bool, str]:
        # Lock email lookup, sequential-ID allocation, write, and queue publication
        # together so parallel uploads cannot allocate the same ID or email twice.
        self.repository.ensure_loaded()
        with self.repository.candidate_lock:
            candidates = self.repository.all_candidate_details()
            email = str(identity.email).strip().casefold() if identity.email else None
            if not email:
                raise MissingIdentityError("An email is required. Supply the email form field if extraction missed it.")
            existing = next((candidate for candidate in candidates if str(candidate.email).strip().casefold() == email), None)
            if not existing and not identity.full_name:
                raise MissingIdentityError("A full name is required. Supply the full_name form field if extraction missed it.")
            skills = [skill for skill in DEFAULT_SKILLS if re.search(rf"(?<!\w){re.escape(skill)}(?!\w)", parsed.raw_text, re.I)]
            if existing:
                values = existing.model_dump()
                for key in ("full_name", "headline", "location", "experience_years"):
                    value = getattr(identity, key)
                    if value is not None:
                        values[key] = value
                links = existing.external_identifiers.model_dump() if existing.external_identifiers else {}
                links.update({key: getattr(identity, key) for key in ("github", "linkedin", "leetcode") if getattr(identity, key)})
                values.update(email=email, external_identifiers=links, top_skills=skills or existing.top_skills)
            else:
                number = max((int(c.id[5:]) for c in candidates if c.id.startswith("CAND-") and c.id[5:].isdigit()), default=0) + 1
                values = dict(id=f"CAND-{number:03d}", full_name=identity.full_name, email=email,
                              headline=identity.headline or "Not provided", location=identity.location or "Not provided",
                              experience_years=identity.experience_years, top_skills=skills,
                              external_identifiers=ExternalIdentifiers(**{key: getattr(identity, key) for key in ("github", "linkedin", "leetcode")}))
            # A replacement document invalidates old previews; the new document
            # never borrows a synthetic stub or a seeded fit/evidence result.
            values.update(resume_path=None, resume_text_stub=None, claims_preview=[], match_preview=None)
            candidate = CandidateDetail.model_validate(values)
            revision = str(uuid4())
            self.pending_builds[candidate.id] = PendingContextBuild(revision, Path(filename).name, raw_bytes, parsed)
            self.repository.save_candidate(candidate)
            logger.info("Resume ingestion candidate=%s decision=%s", candidate.id, "duplicate" if existing else "new")
            return candidate, existing is not None, revision



ingestion_store = ResumeIngestionStore(seed_loader)
