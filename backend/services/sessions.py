"""Durable native sessions: rotating refresh-token families and access revocation."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.security import (TokenExpiredError, TokenInvalidError, create_access_token,
    create_refresh_token, decode_token, token_blacklist, token_expiry)
from backend.models.db import RefreshSession, RevokedToken, User


class SessionError(ValueError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


async def issue_pair(db: AsyncSession, user: User, family_id: str | None = None) -> tuple[str, str]:
    """Create an access/refresh pair; the caller commits."""
    family_id = family_id or str(uuid.uuid4())
    jti = str(uuid.uuid4())
    refresh = create_refresh_token(str(user.id), family_id=family_id, jti=jti)
    db.add(RefreshSession(jti=jti, family_id=family_id, user_id=user.id,
                          expires_at=token_expiry(decode_token(refresh))))
    return create_access_token(str(user.id), user.roles, session_id=family_id), refresh


async def revoke_family(db: AsyncSession, family_id: str) -> None:
    await db.execute(update(RefreshSession).where(RefreshSession.family_id == family_id,
                     RefreshSession.revoked_at.is_(None)).values(revoked_at=_now()))


async def rotate(db: AsyncSession, token: str) -> tuple[User, str, str]:
    """Exchange a refresh token for a new pair. Reuse of a rotated token revokes its family."""
    try:
        payload = decode_token(token or "")
    except (TokenExpiredError, TokenInvalidError):
        raise SessionError("Invalid or expired refresh token") from None
    if payload.get("type") != "refresh" or token_blacklist.is_blacklisted(payload["jti"]):
        raise SessionError("Invalid or expired refresh token")
    row = await db.get(RefreshSession, payload["jti"])
    if row is None:
        raise SessionError("Unknown refresh token")
    if row.revoked_at is not None or row.replaced_by is not None:
        # A rotated or revoked token came back: treat the whole session as stolen.
        await revoke_family(db, row.family_id)
        await db.commit()
        raise SessionError("Refresh token reuse detected; session revoked")
    if _aware(row.expires_at) <= _now():
        raise SessionError("Invalid or expired refresh token")
    user = await db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise SessionError("Unknown user")
    access, refresh = await issue_pair(db, user, row.family_id)
    row.replaced_by = decode_token(refresh)["jti"]
    await db.commit()
    return user, access, refresh


async def revoke_access_token(db: AsyncSession, payload: dict) -> None:
    token_blacklist.blacklist_token(payload["jti"])
    if await db.get(RevokedToken, payload["jti"]) is None:
        db.add(RevokedToken(jti=payload["jti"], expires_at=token_expiry(payload)))


async def is_access_revoked(db: AsyncSession, payload: dict) -> bool:
    if token_blacklist.is_blacklisted(payload["jti"]):
        return True
    if await db.get(RevokedToken, payload["jti"]) is not None:
        token_blacklist.blacklist_token(payload["jti"])
        return True
    family = payload.get("sid")
    if family:
        # Logging out revokes the family; access tokens of that session die with it.
        active = await db.scalar(select(RefreshSession.jti).where(
            RefreshSession.family_id == family, RefreshSession.revoked_at.is_(None)).limit(1))
        if active is None:
            return True
    return False


async def purge_expired(db: AsyncSession) -> None:
    now = _now()
    await db.execute(delete(RevokedToken).where(RevokedToken.expires_at < now))
    await db.execute(delete(RefreshSession).where(RefreshSession.expires_at < now))
    await db.commit()
