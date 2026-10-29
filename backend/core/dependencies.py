from collections.abc import Callable
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.roles import ROLE_HIERARCHY, Role
from backend.core.security import TokenExpiredError, TokenInvalidError, decode_token, token_blacklist
from backend.models.db import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    try:
        payload = decode_token(token)
        if payload.get("type") != "access" or token_blacklist.is_blacklisted(payload["jti"]):
            raise TokenInvalidError()
        user = await db.get(User, UUID(payload["sub"]))
    except (TokenExpiredError, TokenInvalidError, ValueError):
        raise HTTPException(401, "Invalid or expired authentication token", headers={"WWW-Authenticate": "Bearer"}) from None
    if user is None or not user.is_active:
        raise HTTPException(401, "Inactive or unknown user")
    return user


def require_role(*roles: Role) -> Callable:
    async def dependency(user: User = Depends(get_current_user)) -> User:
        effective = set()
        for value in user.roles:
            try: effective.update(ROLE_HIERARCHY[Role(value)])
            except ValueError: continue
        if not effective.intersection(roles):
            raise HTTPException(403, "Insufficient permissions")
        return user
    return dependency
