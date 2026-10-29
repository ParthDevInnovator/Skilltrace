from datetime import timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.config import settings
from backend.models.db import Candidate, EvidenceRecord, utcnow


class CandidateRepository:
    def __init__(self, db: AsyncSession): self.db = db

    async def get(self, candidate_id: str): return await self.db.get(Candidate, candidate_id)
    async def list(self, include_synthetic: bool = False):
        statement = select(Candidate).order_by(Candidate.id)
        if not include_synthetic: statement = statement.where(Candidate.is_synthetic.is_(False))
        return list((await self.db.scalars(statement)).all())
    async def add(self, candidate: Candidate): self.db.add(candidate); await self.db.flush(); return candidate
    async def delete(self, candidate: Candidate): await self.db.delete(candidate); await self.db.flush()
    async def add_evidence(self, evidence: EvidenceRecord):
        if evidence.expires_at is None:
            evidence.expires_at = evidence.fetched_at + timedelta(days=settings.SIGNAL_CACHE_TTL_DAYS)
        self.db.add(evidence); await self.db.flush(); return evidence

