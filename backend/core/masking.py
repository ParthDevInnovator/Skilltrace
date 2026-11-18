"""One role-aware serialization policy for candidate data leaving the backend.

Hiring managers see masked contact details and never receive raw resume text
or the raw candidate context, whichever route or assistant tool they use.
"""
from contextvars import ContextVar

from sqlalchemy.inspection import inspect

from backend.core.roles import Role, primary_role

MASKED_EMAIL = "***@***.***"
MASKED_LOCATION = "[Redacted]"

# Set for the duration of an agent request so tools apply the caller's policy.
current_role: ContextVar[Role | None] = ContextVar("current_role", default=None)


def mask_candidate(candidate, role: Role) -> dict:
    if hasattr(candidate, "model_dump"):
        data = candidate.model_dump(mode="json")
    else:
        data = {column.key: getattr(candidate, column.key) for column in inspect(candidate).mapper.column_attrs}
    masked: list[str] = []
    if role == Role.hiring_manager:
        data.update(email=MASKED_EMAIL, location=MASKED_LOCATION)
        masked = ["email", "location"]
        # Free-text fields can repeat contact details; managers get neither.
        for key in ("resume_text_stub", "resume_path"):
            if key in data and data[key] is not None:
                data[key] = None
                masked.append(key)
    data["masked_fields"] = masked
    return data


def role_for(user) -> Role:
    """Unknown or missing roles are treated as the most restricted reader."""
    return primary_role(list(getattr(user, "roles", []) or [])) or Role.hiring_manager


def is_restricted(role: Role | None) -> bool:
    return role == Role.hiring_manager


def serialize_candidate(candidate, user) -> dict:
    return mask_candidate(candidate, role_for(user))
