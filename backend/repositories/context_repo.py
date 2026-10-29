from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.db import ContextBuildStatus


class ContextRepository:
    def __init__(self, db: AsyncSession): self.db = db
    async def get(self, candidate_id: str): return await self.db.get(ContextBuildStatus, candidate_id)
    async def set(self, candidate_id: str, **values):
        row = await self.get(candidate_id) or ContextBuildStatus(candidate_id=candidate_id)
        for key, value in values.items(): setattr(row, key, value)
        self.db.add(row); await self.db.flush(); return row

