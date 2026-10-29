from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.db import ChatHistory
from backend.services.agent.models import ChatMessage


class ChatRepository:
    def __init__(self, db: AsyncSession): self.db = db
    async def get_session_history(self, session_id: str) -> list[ChatMessage]:
        rows = (await self.db.scalars(select(ChatHistory).where(ChatHistory.session_id == session_id).order_by(ChatHistory.created_at))).all()
        return [ChatMessage(role=row.role, content=row.content, tool_call_id=row.tool_call_id) for row in rows]
    async def append_message(self, session_id: str, message: ChatMessage):
        row = ChatHistory(session_id=session_id, role=message.role, content=message.content, tool_call_id=getattr(message, "tool_call_id", None))
        self.db.add(row); await self.db.flush(); return row

