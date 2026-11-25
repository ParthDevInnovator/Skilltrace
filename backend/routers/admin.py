"""HR administration endpoints: seeds, audit, erasure, admission and workspace settings."""
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, Header
from pydantic import BaseModel, Field
import secrets
from backend.config import settings
from backend.routers.ingest import get_context_builder
from backend.services.signal_fetchers import default_cache
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.core.database import get_db
from backend.core.dependencies import require_role
from backend.core.roles import PENDING_ROLE, Role
from backend.core.workspace import default_workspace_id, workspace_of
from backend.models.db import AuditLog, MembershipRequest, User, Workspace
from backend.services.admission import normalize_domains
from backend.services.audit import audit_user_action
from backend.services.candidate_deletion import delete_candidate_everywhere

router = APIRouter(tags=["Administration"])


def get_signal_cache():
    return default_cache()


def get_graph():
    from backend.services.graph.neo4j_client import get_graph_client
    return get_graph_client()


@router.post("/seed/rebuild")
async def rebuild_seed(x_admin_key: str | None = Header(default=None),
                       service=Depends(get_context_builder), cache=Depends(get_signal_cache),
                       user: User = Depends(require_role(Role.hr_admin))):
    configured = settings.ADMIN_KEY.get_secret_value() if settings.ADMIN_KEY else ""
    if not configured:
        raise HTTPException(403, "Seed rebuild is disabled until ADMIN_KEY is configured.")
    if not x_admin_key or not secrets.compare_digest(x_admin_key.encode(), configured.encode()):
        raise HTTPException(401, "Invalid or missing admin key.")
    try:
        return await service.rebuild(cache)
    except Exception:
        raise HTTPException(503, "Seed rebuild failed. Check server configuration and retry.") from None


def _workspace_clause(column, workspace: str):
    if workspace == default_workspace_id():
        return or_(column == workspace, column.is_(None))
    return column == workspace


@router.get("/api/v1/admin/audit-logs")
async def audit_logs(user_id: str | None = None, candidate_id: str | None = None,
                     action_type: str | None = None, date_from: datetime | None = None,
                     date_to: datetime | None = None, page: int = Query(1, ge=1),
                     page_size: int = Query(50, ge=1, le=200),
                     db: AsyncSession = Depends(get_db),
                     user: User = Depends(require_role(Role.hr_admin))):
    query = select(AuditLog).where(_workspace_clause(AuditLog.workspace_id, workspace_of(user)))
    if user_id: query = query.where(AuditLog.user_id == user_id)
    if candidate_id: query = query.where(AuditLog.candidate_id == candidate_id)
    if action_type: query = query.where(AuditLog.action_type == action_type)
    if date_from: query = query.where(AuditLog.occurred_at >= date_from)
    if date_to: query = query.where(AuditLog.occurred_at <= date_to)
    rows = (await db.scalars(query.order_by(AuditLog.occurred_at.desc()).offset((page-1)*page_size).limit(page_size))).all()
    return [{column.key: getattr(row, column.key) for column in row.__table__.columns} for row in rows]


@router.delete("/api/v1/candidates/{candidate_id}", status_code=204)
@router.delete("/candidates/{candidate_id}", status_code=204, include_in_schema=False)
async def delete_candidate(candidate_id: str, db: AsyncSession = Depends(get_db),
                           user: User = Depends(require_role(Role.hr_admin)),
                           service=Depends(get_context_builder), cache=Depends(get_signal_cache),
                           graph=Depends(get_graph)):
    await delete_candidate_everywhere(candidate_id, workspace_of(user), user, db, service,
                                      graph_client=graph, signal_cache=cache)
    return Response(status_code=204)


# --- Workspace admission (OI-05) -------------------------------------------------

class ApproveRequest(BaseModel):
    role: Literal["recruiter", "hiring_manager", "hr_admin"] = "recruiter"


class DomainsRequest(BaseModel):
    allowed_domains: list[str] = Field(default_factory=list, max_length=50)


def _visible_requests(workspace: str):
    # Requests no workspace claimed are triaged by the default (operator) workspace only.
    if workspace == default_workspace_id():
        return or_(MembershipRequest.workspace_id == workspace, MembershipRequest.workspace_id.is_(None))
    return MembershipRequest.workspace_id == workspace


@router.get("/api/v1/admin/membership-requests")
async def membership_requests(status: Literal["pending", "approved", "rejected"] = "pending",
                              db: AsyncSession = Depends(get_db), user: User = Depends(require_role(Role.hr_admin))):
    rows = (await db.execute(select(MembershipRequest, User).join(User, User.id == MembershipRequest.user_id)
            .where(MembershipRequest.status == status, _visible_requests(workspace_of(user)))
            .order_by(MembershipRequest.created_at))).all()
    return [{"id": str(request.id), "user_id": str(member.id), "email": member.email, "full_name": member.full_name,
             "email_verified": member.email_verified, "auth_provider": member.auth_provider, "status": request.status,
             "requested_at": request.created_at, "decided_at": request.decided_at} for request, member in rows]


async def _pending_request(db: AsyncSession, request_id: str, admin) -> tuple[MembershipRequest, User]:
    try:
        request = await db.get(MembershipRequest, UUID(request_id))
    except ValueError:
        request = None
    workspace = workspace_of(admin)
    visible = request is not None and (request.workspace_id == workspace or
                                       (request.workspace_id is None and workspace == default_workspace_id()))
    if not visible:
        raise HTTPException(404, "Membership request not found")
    if request.status != "pending":
        raise HTTPException(409, f"Request is already {request.status}")
    member = await db.get(User, request.user_id)
    if member is None:
        raise HTTPException(404, "Membership request not found")
    return request, member


@router.post("/api/v1/admin/membership-requests/{request_id}/approve")
async def approve_request(request_id: str, body: ApproveRequest | None = None, db: AsyncSession = Depends(get_db),
                          user: User = Depends(require_role(Role.hr_admin))):
    request, member = await _pending_request(db, request_id, user)
    role = (body or ApproveRequest()).role
    request.status, request.decided_by, request.decided_at = "approved", user.id, datetime.now(timezone.utc)
    request.workspace_id = workspace_of(user)
    member.workspace_id, member.roles = workspace_of(user), [role]
    await db.commit()
    await audit_user_action(user, endpoint=f"/admin/membership-requests/{request_id}/approve", method="POST",
                            action_type="APPROVE_MEMBER", detail={"member": str(member.id), "role": role}, db=db)
    return {"id": request_id, "status": "approved", "user_id": str(member.id), "roles": member.roles,
            "workspace_id": member.workspace_id}


@router.post("/api/v1/admin/membership-requests/{request_id}/reject")
async def reject_request(request_id: str, db: AsyncSession = Depends(get_db),
                         user: User = Depends(require_role(Role.hr_admin))):
    request, member = await _pending_request(db, request_id, user)
    request.status, request.decided_by, request.decided_at = "rejected", user.id, datetime.now(timezone.utc)
    member.roles, member.workspace_id = [PENDING_ROLE], None
    await db.commit()
    await audit_user_action(user, endpoint=f"/admin/membership-requests/{request_id}/reject", method="POST",
                            action_type="REJECT_MEMBER", detail={"member": str(member.id)}, db=db)
    return {"id": request_id, "status": "rejected", "user_id": str(member.id)}


def _workspace_body(workspace: Workspace) -> dict:
    return {"id": workspace.id, "name": workspace.name, "allowed_domains": workspace.allowed_domains or []}


@router.get("/api/v1/admin/workspace")
async def current_workspace(db: AsyncSession = Depends(get_db), user: User = Depends(require_role(Role.hr_admin))):
    workspace = await db.get(Workspace, workspace_of(user))
    if workspace is None:
        raise HTTPException(404, "Workspace not found")
    return _workspace_body(workspace)


@router.patch("/api/v1/admin/workspaces/{workspace_id}/domains")
async def update_domains(workspace_id: str, body: DomainsRequest, db: AsyncSession = Depends(get_db),
                         user: User = Depends(require_role(Role.hr_admin))):
    if workspace_id != workspace_of(user):
        raise HTTPException(404, "Workspace not found")
    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(404, "Workspace not found")
    try:
        domains = normalize_domains(body.allowed_domains)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    for other in (await db.scalars(select(Workspace).where(Workspace.id != workspace_id))).all():
        taken = set(domains) & {d.lower() for d in (other.allowed_domains or [])}
        if taken:
            raise HTTPException(409, f"Domain already belongs to another workspace: {', '.join(sorted(taken))}")
    workspace.allowed_domains = domains
    await db.commit()
    await audit_user_action(user, endpoint=f"/admin/workspaces/{workspace_id}/domains", method="PATCH",
                            action_type="UPDATE_DOMAINS", detail={"allowed_domains": domains}, db=db)
    return _workspace_body(workspace)


# --- Export auditing (OI-08) ---------------------------------------------------

class ExportEvent(BaseModel):
    kind: Literal["brief", "evidence", "questions"]
    candidate_id: str | None = Field(default=None, max_length=64)
    job_id: str | None = Field(default=None, max_length=128)
    item_count: int | None = Field(default=None, ge=0, le=100000)
    format: str | None = Field(default=None, max_length=16)


@router.post("/api/v1/audit/export", status_code=201)
async def record_export(body: ExportEvent,
                        user: User = Depends(require_role(Role.recruiter, Role.hiring_manager, Role.hr_admin))):
    recorded = await audit_user_action(user, endpoint=f"/export/{body.kind}", method="POST", action_type="EXPORT",
                                       candidate_id=body.candidate_id, status_code=201,
                                       detail=body.model_dump(exclude_none=True))
    if not recorded:
        raise HTTPException(503, "Export could not be recorded. Retry the export.")
    return {"recorded": True}
