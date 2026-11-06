from collections.abc import Callable
from uuid import UUID
from uuid import NAMESPACE_URL, uuid5

from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.roles import ROLE_HIERARCHY, Role
from backend.core.security import TokenExpiredError, TokenInvalidError, decode_token, token_blacklist
from backend.models.db import User
from backend.config import settings
from clerk_backend_api import AuthenticateRequestOptions, authenticate_request

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(request: Request, token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    if settings.CLERK_SECRET_KEY:
        state = authenticate_request(request, AuthenticateRequestOptions(
            secret_key=settings.CLERK_SECRET_KEY.get_secret_value(),
            authorized_parties=settings.CLERK_AUTHORIZED_PARTIES,
            accepts_token=["session_token"],
        ))
        if not state.is_signed_in or not state.payload:
            raise HTTPException(401, "Invalid or expired Clerk session", headers={"WWW-Authenticate": "Bearer"})
        clerk_id = state.payload["sub"]
        user_id = uuid5(NAMESPACE_URL, f"clerk:{clerk_id}")
        user = await db.get(User, user_id)
        if user is None:
            user = User(
                id=user_id,
                email=f"{clerk_id}@clerk.local",
                full_name="Clerk user",
                hashed_password="managed-by-clerk",
                roles=["recruiter"],
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        if not user.is_active:
            raise HTTPException(401, "Inactive user")
        return user
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
