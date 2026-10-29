from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.db import Job, JobRequirement


class JobRepository:
    def __init__(self, db: AsyncSession): self.db = db
    async def get(self, job_id: str): return await self.db.get(Job, job_id)
    async def list(self): return list((await self.db.scalars(select(Job).order_by(Job.created_at.desc()))).all())
    async def add(self, job: Job, requirements: list[JobRequirement] | None = None):
        self.db.add(job); self.db.add_all(requirements or []); await self.db.flush(); return job

