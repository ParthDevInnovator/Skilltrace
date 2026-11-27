"""Workspace admission: verified allowed-domain emails join automatically; others wait for approval."""
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.core.roles import PENDING_ROLE, Role
from backend.core.security import hash_secret
from backend.models.db import MembershipRequest, OneTimeToken, User, Workspace

logger = logging.getLogger(__name__)

EMAIL_VERIFICATION = "email_verification"
OAUTH_LINK = "oauth_link"


def email_domain(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    return email.rsplit("@", 1)[1].strip().lower() or None


def normalize_domains(domains: list[str]) -> list[str]:
    cleaned = []
    for domain in domains:
        value = domain.strip().lower().lstrip("@")
        if not value or "." not in value or any(c.isspace() for c in value) or "@" in value:
            raise ValueError(f"Invalid domain: {domain!r}")
        if value not in cleaned:
            cleaned.append(value)
    return cleaned


async def ensure_default_workspace(db: AsyncSession) -> Workspace:
    workspace = await db.get(Workspace, settings.DEFAULT_WORKSPACE_ID)
    if workspace is None:
        workspace = Workspace(id=settings.DEFAULT_WORKSPACE_ID, name=settings.DEFAULT_WORKSPACE_NAME,
                              allowed_domains=normalize_domains(settings.DEFAULT_WORKSPACE_DOMAINS))
        db.add(workspace)
        await db.commit()
    return workspace


async def workspace_for_domain(db: AsyncSession, domain: str | None) -> Workspace | None:
    if not domain:
        return None
    matches = [w for w in (await db.scalars(select(Workspace))).all()
               if domain in [d.lower() for d in (w.allowed_domains or [])]]
    # A domain claimed by two workspaces is ambiguous; never guess.
    return matches[0] if len(matches) == 1 else None


async def admit(db: AsyncSession, user: User) -> str:
    """Apply the admission rule to a not-yet-admitted user. Caller commits.

    Returns "admitted" or "pending". Users already in a workspace are untouched.
    """
    if user.workspace_id and PENDING_ROLE not in (user.roles or []):
        return "admitted"
    workspace = await workspace_for_domain(db, email_domain(user.email)) if user.email_verified else None
    if workspace is not None:
        user.workspace_id = workspace.id
        user.roles = [Role.recruiter.value]
        for request in (await db.scalars(select(MembershipRequest).where(
                MembershipRequest.user_id == user.id, MembershipRequest.status == "pending"))).all():
            request.status = "approved"
            request.workspace_id = workspace.id
            request.decided_at = datetime.now(timezone.utc)
        return "admitted"
    user.workspace_id = None
    user.roles = [PENDING_ROLE]
    existing = await db.scalar(select(MembershipRequest).where(
        MembershipRequest.user_id == user.id, MembershipRequest.status == "pending"))
    if existing is None:
        db.add(MembershipRequest(user_id=user.id, workspace_id=None, status="pending"))
        from backend.services.notifications import notify_admins_of_request
        await notify_admins_of_request(db, user)
    return "pending"


async def issue_token(db: AsyncSession, user: User, purpose: str, lifetime: timedelta, payload: dict | None = None) -> str:
    token = secrets.token_urlsafe(32)
    db.add(OneTimeToken(token_hash=hash_secret(token), purpose=purpose, user_id=user.id, payload=payload or {},
                        expires_at=datetime.now(timezone.utc) + lifetime))
    return token


async def consume_token(db: AsyncSession, token: str, purpose: str) -> OneTimeToken | None:
    row = await db.get(OneTimeToken, hash_secret(token or ""))
    now = datetime.now(timezone.utc)
    if row is None or row.purpose != purpose or row.used_at is not None:
        return None
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)
    if expires <= now:
        return None
    row.used_at = now
    return row


def send_verification_email(email: str, token: str) -> bool:
    """Deliver the verification link. Returns False when no delivery is configured."""
    link = f"{settings.APP_BASE_URL.rstrip('/')}/verify-email?token={token}"
    if not settings.SMTP_HOST or not settings.SMTP_FROM:
        if settings.ENVIRONMENT.lower() in {"production", "prod"}:
            logger.warning("Email delivery is not configured; verification email for a new account was not sent")
        else:
            logger.warning("Email delivery is not configured; development verification link: %s", link)
        return False
    message = EmailMessage()
    message["Subject"] = "Verify your Skitrace email"
    message["From"] = settings.SMTP_FROM
    message["To"] = email
    message.set_content(f"Confirm your email address to finish signing up:\n\n{link}\n\n"
                        f"The link expires in {settings.EMAIL_VERIFICATION_TTL_HOURS} hours.")
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
            if settings.SMTP_STARTTLS:
                smtp.starttls()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD.get_secret_value())
            smtp.send_message(message)
        return True
    except (OSError, smtplib.SMTPException):
        logger.exception("Verification email delivery failed")
        return False
