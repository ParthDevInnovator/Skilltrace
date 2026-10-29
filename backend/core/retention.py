from datetime import datetime, timezone
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.db import EvidenceRecord


async def purge_expired_evidence(db: AsyncSession) -> int:
    result = await db.execute(delete(EvidenceRecord).where(EvidenceRecord.expires_at < datetime.now(timezone.utc)))
    await db.commit()
    return result.rowcount or 0
