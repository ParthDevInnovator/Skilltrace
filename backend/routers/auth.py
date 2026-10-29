from uuid import UUID
from urllib.parse import urlencode
import secrets
import time
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.core.database import get_db
from backend.core.dependencies import get_current_user, oauth2_scheme
from backend.core.security import (TokenExpiredError, TokenInvalidError, create_access_token,
    create_refresh_token, decode_token, hash_password, token_blacklist, verify_password)
from backend.models.db import AuditLog, User

router = APIRouter(prefix="/auth", tags=["Authentication"])
_oauth_states: dict[str, float] = {}
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

@router.post("/register", status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if await db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "Email is already registered")
    user = User(email=body.email.lower(), hashed_password=hash_password(body.password), full_name=body.full_name, roles=["recruiter"])
    db.add(user); await db.commit(); await db.refresh(user)
    return {"user_id": str(user.id), "email": user.email, "roles": user.roles}

@router.post("/login")
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not user.is_active or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Invalid email or password")
    access, refresh = create_access_token(str(user.id), user.roles), create_refresh_token(str(user.id))
    response.set_cookie("refresh_token", refresh, httponly=True, secure=settings.ENVIRONMENT == "production", samesite="lax", max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)
    db.add(AuditLog(user_id=user.id, role_snapshot=",".join(user.roles), endpoint="/auth/login", method="POST", action_type="LOGIN"))
    await db.commit()
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer", "expires_in": settings.JWT_EXPIRE_MINUTES * 60}

@router.post("/refresh")
async def refresh(body: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)):
    token = body.refresh_token or request.cookies.get("refresh_token")
    try:
        payload = decode_token(token or "")
        if payload.get("type") != "refresh" or token_blacklist.is_blacklisted(payload["jti"]): raise TokenInvalidError()
        user = await db.get(User, UUID(payload["sub"]))
    except (TokenExpiredError, TokenInvalidError, ValueError):
        raise HTTPException(401, "Invalid or expired refresh token") from None
    if not user or not user.is_active: raise HTTPException(401, "Unknown user")
    return {"access_token": create_access_token(str(user.id), user.roles), "token_type": "bearer", "expires_in": settings.JWT_EXPIRE_MINUTES * 60}

@router.post("/logout", status_code=204)
async def logout(token: str = Depends(oauth2_scheme), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    token_blacklist.blacklist_token(decode_token(token)["jti"])
    db.add(AuditLog(user_id=user.id, role_snapshot=",".join(user.roles), endpoint="/auth/logout", method="POST", action_type="LOGOUT")); await db.commit()
    return Response(status_code=204, headers={"Set-Cookie": "refresh_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"})

@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {"user_id": str(user.id), "email": user.email, "full_name": user.full_name, "roles": user.roles}

@router.get("/oauth/authorize")
async def oauth_authorize():
    if not settings.OAUTH_PROVIDER: raise HTTPException(404, "OAuth is not configured")
    if settings.OAUTH_PROVIDER == "clerk":
        raise HTTPException(501, "Clerk uses bearer-token verification rather than this authorization-code endpoint")
    if not settings.OAUTH_CLIENT_ID or not settings.OAUTH_REDIRECT_URI:
        raise HTTPException(503, "OAuth client configuration is incomplete")
    state=secrets.token_urlsafe(32);_oauth_states[state]=time.time()+600;provider=_OAUTH[settings.OAUTH_PROVIDER]
    query=urlencode({"client_id":settings.OAUTH_CLIENT_ID,"redirect_uri":settings.OAUTH_REDIRECT_URI,
                     "response_type":"code","scope":provider["scope"],"state":state})
    return RedirectResponse(f"{provider['authorize']}?{query}")


@router.get("/oauth/callback")
async def oauth_callback(code: str, state: str, response: Response, db: AsyncSession = Depends(get_db)):
    expires=_oauth_states.pop(state,None)
    if not expires or expires < time.time(): raise HTTPException(400,"Invalid or expired OAuth state")
    provider_name=settings.OAUTH_PROVIDER
    if provider_name not in _OAUTH or not settings.OAUTH_CLIENT_ID or not settings.OAUTH_CLIENT_SECRET or not settings.OAUTH_REDIRECT_URI:
        raise HTTPException(503,"OAuth provider is not fully configured")
    provider=_OAUTH[provider_name]
    form={"client_id":settings.OAUTH_CLIENT_ID,"client_secret":settings.OAUTH_CLIENT_SECRET.get_secret_value(),
          "code":code,"redirect_uri":settings.OAUTH_REDIRECT_URI,"grant_type":"authorization_code"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_response=await client.post(provider["token"],data=form,headers={"Accept":"application/json"});token_response.raise_for_status()
            provider_token=token_response.json().get("access_token")
            if not provider_token:raise ValueError("Missing provider access token")
            profile_response=await client.get(provider["userinfo"],headers={"Authorization":f"Bearer {provider_token}","Accept":"application/json"});profile_response.raise_for_status();profile=profile_response.json()
            email=profile.get("email")
            if provider_name=="github" and not email:
                emails=(await client.get("https://api.github.com/user/emails",headers={"Authorization":f"Bearer {provider_token}","Accept":"application/vnd.github+json"})).json()
                email=next((item.get("email") for item in emails if item.get("primary") and item.get("verified")),None)
    except (httpx.HTTPError,ValueError,KeyError,TypeError):
        raise HTTPException(401,"OAuth exchange failed") from None
    if not email:raise HTTPException(422,"OAuth provider did not return a verified email")
    user=await db.scalar(select(User).where(User.email==email.lower()))
    if user is None:
        user=User(email=email.lower(),full_name=profile.get("name") or profile.get("login") or email.split('@')[0],
                  hashed_password=hash_password(secrets.token_urlsafe(32)),roles=["recruiter"]);db.add(user);await db.flush()
    access,refresh=create_access_token(str(user.id),user.roles),create_refresh_token(str(user.id));await db.commit()
    response.set_cookie("refresh_token",refresh,httponly=True,secure=settings.ENVIRONMENT=="production",samesite="lax",max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS*86400)
    return {"access_token":access,"refresh_token":refresh,"token_type":"bearer","expires_in":settings.JWT_EXPIRE_MINUTES*60}

