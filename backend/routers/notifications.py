"""The signed-in user's in-app notifications (OI-33). Every user sees only their own."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.dependencies import require_role
from backend.core.roles import Role
from backend.services.notifications import list_for, mark_read

router = APIRouter(prefix="/notifications", tags=["Notifications"])
MEMBERS = (Role.recruiter, Role.hiring_manager, Role.hr_admin)


class NotificationItem(BaseModel):
    id: str
    kind: str
    title: str
    body: str
    candidate_id: Optional[str] = None
    job_id: Optional[str] = None
    created_at: datetime
    read_at: Optional[datetime] = None


class NotificationList(BaseModel):
    items: list[NotificationItem]
    unread_count: int


@router.get("", response_model=NotificationList)
async def notifications(unread_only: bool = False, user=Depends(require_role(*MEMBERS)),
                        db: AsyncSession = Depends(get_db)):
    rows, unread = await list_for(db, getattr(user, "id", None), unread_only)
    return NotificationList(unread_count=unread, items=[NotificationItem(
        id=str(row.id), kind=row.kind, title=row.title, body=row.body, candidate_id=row.candidate_id,
        job_id=row.job_id, created_at=row.created_at, read_at=row.read_at) for row in rows])


@router.post("/{notification_id}/read", status_code=204)
async def read_one(notification_id: str, user=Depends(require_role(*MEMBERS)), db: AsyncSession = Depends(get_db)):
    if not await mark_read(db, getattr(user, "id", None), notification_id):
        raise HTTPException(404, "Notification not found or already read.")


@router.post("/read-all")
async def read_all(user=Depends(require_role(*MEMBERS)), db: AsyncSession = Depends(get_db)):
    return {"marked_read": await mark_read(db, getattr(user, "id", None))}
