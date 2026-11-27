import base64
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.core.database import get_db
from backend.core.dependencies import get_current_user, optional_oauth2_scheme
from backend.core.rate_limit import SlidingWindowLimiter, enforce
from backend.core.roles import is_pending
from backend.core.security import TokenExpiredError, TokenInvalidError, decode_token, hash_password, hash_secret, verify_password
from backend.models.db import OAuthState, User, Workspace
from backend.services.admission import (EMAIL_VERIFICATION, OAUTH_LINK, admit, consume_token, issue_token,
    send_verification_email)
from backend.services.audit import audit_user_action
from backend.services.sessions import SessionError, issue_pair, revoke_access_token, revoke_family, rotate
from backend.models.db import RefreshSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])
register_limiter = SlidingWindowLimiter(settings.REGISTER_RATE_LIMIT_PER_HOUR, 3600)
OAUTH_BINDING_COOKIE = "oauth_binding"
_OAUTH = {
    "google": {
        "authorize": "https://accounts.google.com/o/oauth2/v2/auth",
        "token": "https://oauth2.googleapis.com/token",
        "userinfo": "https://openidconnect.googleapis.com/v1/userinfo",
        "scope": "openid email profile",
    },
    "github": {
        "authorize": "https://github.com/login/oauth/authorize",
        "token": "https://github.com/login/oauth/access_token",
        "userinfo": "https://api.github.com/user",
        "scope": "read:user user:email",
    },
}


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
class LoginRequest(BaseModel): email: EmailStr; password: str
class RefreshRequest(BaseModel): refresh_token: str | None = None
class LogoutRequest(BaseModel): refresh_token: str | None = None
class TokenRequest(BaseModel): token: str = Field(min_length=10, max_length=200)
class LinkRequest(BaseModel): link_token: str = Field(min_length=10, max_length=200)


def _production() -> bool:
    return settings.ENVIRONMENT.lower() in {"production", "prod"}


def _set_refresh_cookie(response: Response, refresh: str) -> None:
    response.set_cookie("refresh_token", refresh, httponly=True, secure=_production(), samesite="lax",
                        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)


def _token_body(access: str, refresh: str) -> dict:
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer",
            "expires_in": settings.JWT_EXPIRE_MINUTES * 60}


@router.post("/register", status_code=201)
async def register(body: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    if not settings.ALLOW_NATIVE_REGISTRATION:
        raise HTTPException(403, "Self-service registration is disabled.")
    enforce(register_limiter, request)
    email = body.email.lower()
    if await db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Email is already registered")
    user = User(email=email, hashed_password=hash_password(body.password), full_name=body.full_name,
                roles=["pending"], email_verified=False, auth_provider="native")
    db.add(user)
    await db.flush()
    await admit(db, user)  # Unverified: always pending until the email is confirmed.
    token = await issue_token(db, user, EMAIL_VERIFICATION, timedelta(hours=settings.EMAIL_VERIFICATION_TTL_HOURS))
    await db.commit()
    await db.refresh(user)
    delivered = send_verification_email(user.email, token)
    await audit_user_action(user, endpoint="/auth/register", method="POST", action_type="REGISTER", status_code=201, db=db)
    result = {"user_id": str(user.id), "email": user.email, "roles": user.roles, "status": "pending",
              "verification_required": True, "verification_sent": delivered}
    if not delivered and not _production():
        result["verification_token"] = token  # Development only: no mail server configured.
    return result


async def _verify(token: str, db: AsyncSession) -> dict:
    row = await consume_token(db, token, EMAIL_VERIFICATION)
    if row is None:
        raise HTTPException(400, "Invalid or expired verification link")
    user = await db.get(User, row.user_id)
    if user is None:
        raise HTTPException(400, "Invalid or expired verification link")
    user.email_verified = True
    status = await admit(db, user)
    await db.commit()
    await audit_user_action(user, endpoint="/auth/verify-email", method="POST", action_type="VERIFY_EMAIL",
                            detail={"admission": status}, db=db)
    return {"email_verified": True, "status": status, "roles": user.roles}


@router.post("/verify-email")
async def verify_email(body: TokenRequest, db: AsyncSession = Depends(get_db)):
    return await _verify(body.token, db)


@router.get("/verify-email")
async def verify_email_link(token: str, db: AsyncSession = Depends(get_db)):
    return await _verify(token, db)


@router.post("/login")
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not user.is_active or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Invalid email or password")
    access, refresh = await issue_pair(db, user)
    await db.commit()
    _set_refresh_cookie(response, refresh)
    await audit_user_action(user, endpoint="/auth/login", method="POST", action_type="LOGIN", status_code=200, db=db)
    return _token_body(access, refresh)


@router.post("/refresh")
async def refresh(body: RefreshRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    try:
        _, access, new_refresh = await rotate(db, body.refresh_token or request.cookies.get("refresh_token") or "")
    except SessionError as error:
        raise HTTPException(401, str(error)) from None
    _set_refresh_cookie(response, new_refresh)
    return _token_body(access, new_refresh)


@router.post("/logout", status_code=204)
async def logout(request: Request, body: LogoutRequest | None = None, token: str | None = Depends(optional_oauth2_scheme),
                 db: AsyncSession = Depends(get_db)):
    """Idempotent: revokes the access token and its whole refresh family, even if the access token expired."""
    user_id, families = None, set()
    if token:
        try:
            payload = decode_token(token, verify_exp=False)
            if payload.get("type") == "access":
                await revoke_access_token(db, payload)
                user_id = payload["sub"]
                if payload.get("sid"):
                    families.add(payload["sid"])
        except (TokenExpiredError, TokenInvalidError):
            pass
    refresh_token = (body.refresh_token if body else None) or request.cookies.get("refresh_token")
    if refresh_token:
        try:
            payload = decode_token(refresh_token, verify_exp=False)
            row = await db.get(RefreshSession, payload["jti"]) if payload.get("type") == "refresh" else None
            if row is not None:
                families.add(row.family_id)
                user_id = user_id or str(row.user_id)
        except (TokenExpiredError, TokenInvalidError):
            pass
    for family in families:
        await revoke_family(db, family)
    await db.commit()
    if user_id:
        try:
            user = await db.get(User, UUID(user_id))
        except ValueError:
            user = None
        if user is not None:
            await audit_user_action(user, endpoint="/auth/logout", method="POST", action_type="LOGOUT", status_code=204, db=db)
    return Response(status_code=204, headers={"Set-Cookie": "refresh_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"})


@router.get("/me")
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    workspace_id = getattr(user, "workspace_id", None)
    workspace = await db.get(Workspace, workspace_id) if workspace_id else None
    return {"user_id": str(user.id), "email": user.email, "full_name": user.full_name, "roles": user.roles,
            "status": "pending" if is_pending(user.roles) else "active",
            "email_verified": bool(getattr(user, "email_verified", False)),
            "auth_provider": getattr(user, "auth_provider", None),
            "workspace": {"id": workspace.id, "name": workspace.name} if workspace else None}


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)


@router.patch("/me")
async def update_me(body: ProfileUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Self-service profile (OI-33). Clerk accounts are managed in Clerk, so their name is read-only here."""
    if getattr(user, "auth_provider", "native") == "clerk":
        raise HTTPException(409, "Your profile is managed by your organization's sign-in provider.")
    name = " ".join(body.full_name.split())
    if not name:
        raise HTTPException(422, "Full name cannot be empty.")
    stored = await db.get(User, user.id)
    if stored is None:
        raise HTTPException(404, "Account not found.")
    stored.full_name = name
    await db.commit()
    await audit_user_action(stored, endpoint="/auth/me", method="PATCH", action_type="UPDATE_PROFILE",
                            detail={"fields": ["full_name"]}, db=db)
    return await me(stored, db)


def _pkce_challenge(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()


@router.get("/oauth/authorize")
async def oauth_authorize(db: AsyncSession = Depends(get_db)):
    if not settings.OAUTH_PROVIDER: raise HTTPException(404, "OAuth is not configured")
    if settings.OAUTH_PROVIDER == "clerk":
        raise HTTPException(501, "Clerk uses bearer-token verification rather than this authorization-code endpoint")
    if not settings.OAUTH_CLIENT_ID or not settings.OAUTH_REDIRECT_URI:
        raise HTTPException(503, "OAuth client configuration is incomplete")
    now = datetime.now(timezone.utc)
    await db.execute(delete(OAuthState).where(OAuthState.expires_at < now))
    state, binding, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    db.add(OAuthState(state_hash=hash_secret(state), binding_hash=hash_secret(binding), code_verifier=verifier,
                      provider=settings.OAUTH_PROVIDER, expires_at=now + timedelta(seconds=settings.OAUTH_STATE_TTL_SECONDS)))
    await db.commit()
    provider = _OAUTH[settings.OAUTH_PROVIDER]
    query = urlencode({"client_id": settings.OAUTH_CLIENT_ID, "redirect_uri": settings.OAUTH_REDIRECT_URI,
                       "response_type": "code", "scope": provider["scope"], "state": state,
                       "code_challenge": _pkce_challenge(verifier), "code_challenge_method": "S256"})
    response = RedirectResponse(f"{provider['authorize']}?{query}")
    # The state only completes in the browser that started the flow.
    response.set_cookie(OAUTH_BINDING_COOKIE, binding, httponly=True, secure=_production(), samesite="lax",
                        max_age=settings.OAUTH_STATE_TTL_SECONDS, path="/")
    return response


async def _provider_identity(provider_name: str, code: str, verifier: str) -> tuple[str, str, str]:
    """Return (subject, verified email, display name); raises HTTPException for unverified identities."""
    provider = _OAUTH[provider_name]
    form = {"client_id": settings.OAUTH_CLIENT_ID, "client_secret": settings.OAUTH_CLIENT_SECRET.get_secret_value(),
            "code": code, "redirect_uri": settings.OAUTH_REDIRECT_URI, "grant_type": "authorization_code",
            "code_verifier": verifier}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_response = await client.post(provider["token"], data=form, headers={"Accept": "application/json"})
            token_response.raise_for_status()
            provider_token = token_response.json().get("access_token")
            if not provider_token:
                raise ValueError("Missing provider access token")
            headers = {"Authorization": f"Bearer {provider_token}", "Accept": "application/json"}
            profile_response = await client.get(provider["userinfo"], headers=headers)
            profile_response.raise_for_status()
            profile = profile_response.json()
            if provider_name == "google":
                subject = profile.get("sub")
                email = profile.get("email") if profile.get("email_verified") is True else None
            else:
                subject = str(profile.get("id") or "")
                emails = (await client.get("https://api.github.com/user/emails",
                          headers={**headers, "Accept": "application/vnd.github+json"})).json()
                email = next((item.get("email") for item in emails if isinstance(item, dict)
                              and item.get("primary") and item.get("verified")), None)
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        raise HTTPException(401, "OAuth exchange failed") from None
    if not subject:
        raise HTTPException(401, "OAuth provider did not return an account identifier")
    if not email:
        raise HTTPException(422, "OAuth provider did not return a verified email")
    return subject, email.lower(), profile.get("name") or profile.get("login") or email.split("@")[0]


@router.get("/oauth/callback")
async def oauth_callback(code: str, state: str, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    row = await db.get(OAuthState, hash_secret(state))
    binding = request.cookies.get(OAUTH_BINDING_COOKIE)
    now = datetime.now(timezone.utc)
    expires = row.expires_at if row and row.expires_at.tzinfo else (row.expires_at.replace(tzinfo=timezone.utc) if row else None)
    if (row is None or row.used_at is not None or expires <= now or not binding
            or not secrets.compare_digest(row.binding_hash, hash_secret(binding))):
        raise HTTPException(400, "Invalid or expired OAuth state")
    row.used_at = now  # Single use, even if the exchange below fails.
    await db.commit()
    provider_name = row.provider
    if provider_name not in _OAUTH or not settings.OAUTH_CLIENT_ID or not settings.OAUTH_CLIENT_SECRET or not settings.OAUTH_REDIRECT_URI:
        raise HTTPException(503, "OAuth provider is not fully configured")
    subject, email, name = await _provider_identity(provider_name, code, row.code_verifier)
    user = await db.scalar(select(User).where(User.auth_provider == provider_name, User.provider_subject == subject))
    if user is None:
        existing = await db.scalar(select(User).where(User.email == email))
        if existing is not None:
            # Never link by email alone: the existing account holder must confirm.
            link_token = await issue_token(db, existing, OAUTH_LINK, timedelta(minutes=settings.OAUTH_LINK_TTL_MINUTES),
                                           {"provider": provider_name, "subject": subject})
            await db.commit()
            return JSONResponse(status_code=409, content={
                "detail": "An account with this email already exists. Sign in to it and confirm linking.",
                "link_token": link_token})
        user = User(email=email, full_name=name, hashed_password=hash_password(secrets.token_urlsafe(32)),
                    auth_provider=provider_name, provider_subject=subject, email_verified=True, roles=["pending"])
        db.add(user)
        await db.flush()
        await admit(db, user)
    if not user.is_active:
        raise HTTPException(401, "Inactive user")
    access, refresh_token = await issue_pair(db, user)
    await db.commit()
    _set_refresh_cookie(response, refresh_token)
    response.delete_cookie(OAUTH_BINDING_COOKIE, path="/")
    await audit_user_action(user, endpoint="/auth/oauth/callback", method="GET", action_type="LOGIN", status_code=200,
                            detail={"provider": provider_name}, db=db)
    return _token_body(access, refresh_token)


@router.post("/oauth/link")
async def oauth_link(body: LinkRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = await consume_token(db, body.link_token, OAUTH_LINK)
    if row is None or row.user_id != user.id:
        raise HTTPException(400, "Invalid or expired link request")
    provider, subject = row.payload.get("provider"), row.payload.get("subject")
    if await db.scalar(select(User.id).where(User.auth_provider == provider, User.provider_subject == subject)):
        raise HTTPException(409, "That provider account is already linked")
    user.auth_provider, user.provider_subject = provider, subject
    await db.commit()
    await audit_user_action(user, endpoint="/auth/oauth/link", method="POST", action_type="LINK_IDENTITY",
                            detail={"provider": provider}, db=db)
    return {"linked": provider}
