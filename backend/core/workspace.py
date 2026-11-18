"""Workspace (organization) boundaries for every candidate, job and user.

Records created before workspaces existed belong to the default workspace.
Cross-workspace lookups behave exactly like missing records (404), so an
identifier never reveals that another organization holds it.
"""
from contextvars import ContextVar

from fastapi import HTTPException

from backend.config import settings

# Set for the duration of an agent request so read-only tools stay scoped.
current_workspace: ContextVar[str | None] = ContextVar("current_workspace", default=None)


def default_workspace_id() -> str:
    return settings.DEFAULT_WORKSPACE_ID


def workspace_of(user) -> str:
    """The workspace an authorized principal acts in.

    Only admitted users reach data routes (pending users fail role checks),
    and every admitted user has a workspace; legacy principals without the
    attribute belong to the default workspace.
    """
    return getattr(user, "workspace_id", None) or default_workspace_id()


def record_workspace(record) -> str:
    return getattr(record, "workspace_id", None) or default_workspace_id()


def in_workspace(record, workspace_id: str) -> bool:
    return record is not None and record_workspace(record) == workspace_id


def require_in_workspace(record, workspace_id: str, label: str = "Record"):
    if not in_workspace(record, workspace_id):
        raise HTTPException(404, f"{label} not found.")
    return record
