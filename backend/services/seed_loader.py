import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

from backend.config import settings
from backend.models import (
    Job,
    JobFilterParams,
    CandidateSummary,
    CandidateDetail,
    CandidateFilterParams,
)

logger = logging.getLogger("mosaic.services.seed_loader")


class SeedLoader:
    """In-memory seed data repository and search provider."""

    def __init__(self, data_dir: Optional[Path] = None):
        self.data_dir = data_dir or settings.DATA_DIR
        self._jobs: Dict[str, Job] = {}
        self._candidates: Dict[str, CandidateDetail] = {}
        self._is_loaded: bool = False

    def load_all(self, force_reload: bool = False) -> None:
        """Loads all seed jobs and candidates from disk into memory."""
        if self._is_loaded and not force_reload:
            return

        self._jobs.clear()
        self._candidates.clear()

        # Load Jobs
        jobs_dir = self.data_dir / "jobs"
        if jobs_dir.exists():
            for job_file in sorted(jobs_dir.glob("*.json")):
                try:
                    with open(job_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    job = Job.model_validate(data)
                    self._jobs[job.id] = job
                except Exception as e:
                    logger.error(f"Failed to load job from {job_file}: {e}")
        else:
            logger.warning(f"Jobs directory does not exist: {jobs_dir}")

        # Load Candidates
        candidates_dir = self.data_dir / "candidates"
        if candidates_dir.exists():
            for cand_file in sorted(candidates_dir.glob("*.json")):
                try:
                    with open(cand_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    cand = CandidateDetail.model_validate(data)
                    self._candidates[cand.id] = cand
                except Exception as e:
                    logger.error(f"Failed to load candidate from {cand_file}: {e}")
        else:
            logger.warning(f"Candidates directory does not exist: {candidates_dir}")

        self._is_loaded = True
        logger.info(
            f"SeedLoader loaded {len(self._jobs)} jobs and {len(self._candidates)} candidates."
        )

    def ensure_loaded(self) -> None:
        """Ensures data is loaded before executing queries."""
        if not self._is_loaded:
            self.load_all()

    def get_jobs(self, params: Optional[JobFilterParams] = None) -> List[Job]:
        """Retrieves and filters jobs according to query parameters."""
        self.ensure_loaded()
        jobs = list(self._jobs.values())

        if not params:
            return jobs

        filtered = jobs

        if params.search:
            q = params.search.lower().strip()
            filtered = [
                j for j in filtered
                if q in j.title.lower()
                or q in j.department.lower()
                or q in j.location.lower()
                or q in j.description_raw.lower()
                or any(q in r.lower() for r in j.requirements_preview)
            ]

        if params.department:
            dept = params.department.lower().strip()
            filtered = [j for j in filtered if dept in j.department.lower()]

        if params.location:
            loc = params.location.lower().strip()
            filtered = [j for j in filtered if loc in j.location.lower()]

        return filtered

    def get_job(self, job_id: str) -> Optional[Job]:
        """Retrieves a single job by its ID, supporting case-insensitive lookup and whitespace trimming."""
        self.ensure_loaded()
        clean_id = job_id.strip()
        if clean_id in self._jobs:
            return self._jobs[clean_id]
        clean_upper = clean_id.upper()
        if clean_upper in self._jobs:
            return self._jobs[clean_upper]
        return None

    def add_job(self, job: Job) -> Job:
        """Stores a newly created or custom job into the in-memory registry."""
        self.ensure_loaded()
        self._jobs[job.id] = job
        return job

    def get_candidates(
        self,
        params: Optional[CandidateFilterParams] = None,
        search: Optional[str] = None,
        skill: Optional[str] = None,
    ) -> List[CandidateSummary]:
        """Retrieves candidate summaries, with optional search and skill filtering."""
        self.ensure_loaded()
        summaries: List[CandidateSummary] = [
            CandidateSummary(
                id=c.id,
                full_name=c.full_name,
                email=c.email,
                headline=c.headline,
                location=c.location,
                top_skills=c.top_skills,
                resume_path=c.resume_path,
                match_preview=c.match_preview,
            )
            for c in self._candidates.values()
        ]

        query_str = params.search if params and params.search else search
        skill_str = params.skill if params and params.skill else skill

        if query_str and query_str.strip():
            q = query_str.lower().strip()
            summaries = [
                c for c in summaries
                if q in c.id.lower()
                or q in c.full_name.lower()
                or q in c.email.lower()
                or q in c.headline.lower()
                or q in c.location.lower()
                or any(q in s.lower() for s in c.top_skills)
            ]

        if skill_str and skill_str.strip():
            skills = [s.strip().lower() for s in skill_str.split(",") if s.strip()]
            for target_skill in skills:
                summaries = [
                    c for c in summaries
                    if any(target_skill in skill_item.lower() for skill_item in c.top_skills)
                ]

        return summaries

    def get_candidate(self, candidate_id: str) -> Optional[CandidateDetail]:
        """Retrieves full candidate detail by ID, supporting case-insensitive lookup and whitespace trimming."""
        self.ensure_loaded()
        clean_id = candidate_id.strip()
        if clean_id in self._candidates:
            return self._candidates[clean_id]
        clean_upper = clean_id.upper()
        if clean_upper in self._candidates:
            return self._candidates[clean_upper]
        return None

    def stats(self) -> Dict[str, int]:
        """Returns statistical counts for monitoring and health endpoints."""
        self.ensure_loaded()
        return {
            "total_jobs": len(self._jobs),
            "total_candidates": len(self._candidates),
        }

    def reload(self) -> None:
        """Forces cache rebuild from disk."""
        self.load_all(force_reload=True)


# Global singleton seed loader instance
seed_loader = SeedLoader()
