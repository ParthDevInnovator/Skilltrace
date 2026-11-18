import logging
from collections.abc import Callable
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.core.database import get_db
from backend.core.roles import Role, effective_roles
from backend.core.security import TokenExpiredError, TokenInvalidError, decode_token
from backend.models.db import User
from clerk_backend_api import AuthenticateRequestOptions, authenticate_request

logger = logging.getLogger(__name__)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def record_principal(request: Request | None, user) -> None:
    """Expose the verified principal to the audit middleware (OI-08)."""
    if request is None or user is None:
        return
    request.state.audit_principal = {
        "user_id": str(getattr(user, "id", "") or "") or None,
        "roles": list(getattr(user, "roles", []) or []),
        "workspace_id": getattr(user, "workspace_id", None),
    }


async def fetch_clerk_profile(clerk_id: str) -> dict:
    """Primary email, its verification state and display name from Clerk's backend API."""
    from clerk_backend_api import Clerk
    try:
        async with Clerk(bearer_auth=settings.CLERK_SECRET_KEY.get_secret_value()) as clerk:
            profile = await clerk.users.get_async(user_id=clerk_id)
    except Exception:
        logger.warning("Clerk profile lookup failed; the account will wait for approval")
        return {}
    primary = next((item for item in (getattr(profile, "email_addresses", None) or [])
                    if getattr(item, "id", None) == getattr(profile, "primary_email_address_id", None)), None)
    status = getattr(getattr(primary, "verification", None), "status", None)
    status = getattr(status, "value", status)
    name = " ".join(part for part in (getattr(profile, "first_name", None), getattr(profile, "last_name", None)) if part)
    return {"email": getattr(primary, "email_address", None), "email_verified": status == "verified",
            "full_name": name or getattr(profile, "username", None)}


async def _provision_clerk_user(db: AsyncSession, clerk_id: str) -> User:
    from backend.services.admission import admit
    legacy_id = uuid5(NAMESPACE_URL, f"clerk:{clerk_id}")
    user = await db.scalar(select(User).where(User.auth_provider == "clerk", User.provider_subject == clerk_id))
    if user is None:
        user = await db.get(User, legacy_id)
    if user is not None:
        return user
    profile = await fetch_clerk_profile(clerk_id)
    email = (profile.get("email") or "").strip().lower() or None
    if email and await db.scalar(select(User.id).where(User.email == email)):
        # Never attach a new identity to another account by email alone.
        logger.warning("Clerk sign-in uses an email that already belongs to another account; approval required")
        email, profile["email_verified"] = None, False
    user = User(id=legacy_id, email=email or f"{clerk_id}@clerk.local", full_name=profile.get("full_name") or "Clerk user",
                hashed_password="managed-by-clerk", auth_provider="clerk", provider_subject=clerk_id,
                email_verified=bool(email and profile.get("email_verified")), roles=["pending"])
    db.add(user)
    await db.flush()
    await admit(db, user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_current_user(request: Request, token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    if settings.CLERK_SECRET_KEY:
        state = authenticate_request(request, AuthenticateRequestOptions(
            secret_key=settings.CLERK_SECRET_KEY.get_secret_value(),
            authorized_parties=settings.CLERK_AUTHORIZED_PARTIES,
            accepts_token=["session_token"],
        ))
        if not state.is_signed_in or not state.payload:
            raise HTTPException(401, "Invalid or expired Clerk session", headers={"WWW-Authenticate": "Bearer"})
        user = await _provision_clerk_user(db, state.payload["sub"])
        if not user.is_active:
            raise HTTPException(401, "Inactive user")
        record_principal(request, user)
        return user
    from backend.services.sessions import is_access_revoked
    try:
        payload = decode_token(token)
        if payload.get("type") != "access" or await is_access_revoked(db, payload):
            raise TokenInvalidError()
        user = await db.get(User, UUID(payload["sub"]))
    except (TokenExpiredError, TokenInvalidError, ValueError):
        raise HTTPException(401, "Invalid or expired authentication token", headers={"WWW-Authenticate": "Bearer"}) from None
    if user is None or not user.is_active:
        raise HTTPException(401, "Inactive or unknown user")
    record_principal(request, user)
    return user


def require_role(*roles: Role) -> Callable:
    async def dependency(user: User = Depends(get_current_user), request: Request = None) -> User:
        if not effective_roles(list(getattr(user, "roles", []) or [])).intersection(roles):
            record_principal(request, user)
            raise HTTPException(403, "Insufficient permissions")
        record_principal(request, user)
        return user
    return dependency
