import asyncio
import json
from pathlib import Path
from backend.config import settings
from backend.core.database import AsyncSessionLocal, create_all_tables
from backend.models.db import Candidate, Job, JobRequirement

async def seed_database():
    await create_all_tables()
    inserted = {"candidates": 0, "jobs": 0, "evidence": 0}; skipped = dict(inserted)
    async with AsyncSessionLocal() as db:
        for path in sorted((settings.DATA_DIR / "candidates").glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            if await db.get(Candidate, data["id"]): skipped["candidates"] += 1; continue
            db.add(Candidate(id=data["id"], full_name=data["full_name"], headline=data.get("headline", ""),
                             email=data.get("email"), location=data.get("location"), is_synthetic=data.get("is_synthetic", True)))
            inserted["candidates"] += 1
        for path in sorted((settings.DATA_DIR / "jobs").glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            if await db.get(Job, data["id"]): skipped["jobs"] += 1; continue
            db.add(Job(id=data["id"], title=data["title"], department=data.get("department",""), location=data.get("location",""), description_raw=data["description_raw"], is_custom=False))
            for req in data.get("requirements", []):
                db.add(JobRequirement(id=req["id"], job_id=data["id"], skill=req["requirement_text"],
                                      level="required" if req.get("is_mandatory", True) else "preferred", weight=1.0))
            inserted["jobs"] += 1
        await db.commit()
    print(f"Seed complete: {inserted['candidates']} candidates, {inserted['jobs']} jobs, {inserted['evidence']} evidence inserted; "
          f"{skipped['candidates']} candidates, {skipped['jobs']} jobs, {skipped['evidence']} evidence skipped.")
    return inserted, skipped

if __name__ == "__main__": asyncio.run(seed_database())
