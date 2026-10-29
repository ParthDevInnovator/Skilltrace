from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.db import MatchResult


class MatchRepository:
    def __init__(self, db: AsyncSession): self.db = db
    async def add(self, result: MatchResult): self.db.add(result); await self.db.flush(); return result
    async def get(self, candidate_id: str, job_id: str):
        return await self.db.scalar(select(MatchResult).where(MatchResult.candidate_id == candidate_id, MatchResult.job_id == job_id).order_by(MatchResult.computed_at.desc()))

