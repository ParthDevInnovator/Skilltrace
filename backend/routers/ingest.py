"""Session-only resume ingestion with bounded multipart document reads."""
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ValidationError
from starlette.concurrency import run_in_threadpool

from backend.services.deduplicator import MissingIdentityError, ResumeIngestionStore, ingestion_store
from backend.services.identity_extractor import ExtractedIdentity, extract_identity
from backend.services.resume_parser import MAX_UPLOAD_BYTES, SUPPORTED_EXTENSIONS, parse_resume
from backend.services.context_builder import ContextBuilder, context_builder
from backend.core.dependencies import require_role
from backend.core.roles import Role
from backend.core.workspace import workspace_of
from backend.services.runtime_persistence import PersistenceError
from backend.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["Resume ingestion"])


class IngestResponse(BaseModel):
    candidate_id: str
    status: Literal["building"] = "building"
    updated_existing: bool
    parse_source: Literal["pdf", "docx", "txt"]
    context_revision: str
    enrichment_pending: bool = True
    job_id: str | None = None
    added_to_job: bool = False


def _reject(status: int, code: str, message: str, field: str | None = None) -> HTTPException:
    """Upload errors carry a machine-readable code (and the field to correct), so a batch can tell
    rejected input from a retryable failure and ask for a missing identity (OI-26)."""
    detail = {"code": code, "message": message}
    if field:
        detail["field"] = field
    return HTTPException(status, detail)


def get_ingestion_store() -> ResumeIngestionStore:
    return ingestion_store


def get_context_builder() -> ContextBuilder:
    return context_builder


@router.post("/resume", response_model=IngestResponse, status_code=202)
async def ingest_resume(
    background_tasks: BackgroundTasks,
    file: Annotated[UploadFile, File()],
    store: Annotated[ResumeIngestionStore, Depends(get_ingestion_store)],
    builder: Annotated[ContextBuilder, Depends(get_context_builder)],
    user=Depends(require_role(Role.recruiter, Role.hr_admin)),
    full_name: Annotated[str | None, Form(max_length=150)] = None,
    email: Annotated[str | None, Form(max_length=254)] = None,
    headline: Annotated[str | None, Form(max_length=500)] = None,
    location: Annotated[str | None, Form(max_length=300)] = None,
    job_id: Annotated[str | None, Form(max_length=64)] = None,
    db: AsyncSession = Depends(get_db),
):
    workspace = workspace_of(user)
    job = None
    if job_id:
        # The job the upload is for (OI-30): checked first, so a closed or unknown job rejects
        # the upload before anything is stored.
        from backend.routers.jobs import load_job
        try:
            job = await load_job(job_id, workspace, db, builder)
        except HTTPException:
            await file.close()
            raise _reject(404, "job_not_found", "The job for this upload was not found.") from None
        if job.status not in ("draft", "active"):
            await file.close()
            raise _reject(409, "job_closed", f"This job is {job.status}; reopen it to add candidates.")
    try:
        filename = file.filename or ""
        if Path(filename).suffix.lower() not in SUPPORTED_EXTENSIONS:
            raise _reject(422, "unsupported_format", "Supported resume formats are PDF, DOCX and TXT.")
        data = bytearray()
        while chunk := await file.read(64 * 1024):
            data.extend(chunk)
            if len(data) > MAX_UPLOAD_BYTES:
                raise _reject(413, "too_large", "Resume files must be 5 MB or smaller.")
    finally:
        await file.close()
    if not data:
        raise _reject(422, "empty_file", "The resume file is empty.")
    parsed = await run_in_threadpool(parse_resume, raw_bytes=bytes(data), filename=filename)
    if parsed.source == "empty":
        raise _reject(422, "unreadable", "Could not read resume text. Check the file or upload a text resume.")
    if parsed.source == "pdf" and parsed.char_count < 50:
        raise _reject(422, "unreadable", "PDF has fewer than 50 readable characters. Scanned PDFs require OCR or a text resume.")
    identity = extract_identity(parsed.raw_text).model_dump()
    overrides = {"full_name": full_name, "email": email, "headline": headline, "location": location}
    identity.update({key: value.strip() for key, value in overrides.items() if value and value.strip()})
    try:
        extracted = ExtractedIdentity.model_validate(identity)
        if builder.store is not store:
            raise _reject(503, "service_unavailable", "Resume service configuration is inconsistent.")
        candidate, updated, revision, reserved = await builder.ingest_resume(extracted, parsed, filename, bytes(data),
                                                                             workspace)
    except ValidationError:
        raise _reject(422, "invalid_identity", "Candidate identity is invalid. Check the name, email, headline and location fields.") from None
    except MissingIdentityError as exc:
        raise _reject(422, "missing_identity", str(exc), exc.field) from None
    except PersistenceError:
        raise _reject(503, "persistence_failed", "The resume could not be saved. Nothing was changed; retry the upload.") from None
    from backend.services.notifications import build_watches
    build_watches.watch(candidate.id, getattr(user, "id", None), workspace, job.id if job else None)
    added = False
    if job is not None:
        from backend.services.job_membership import add_application
        added = await add_application(db, job.id, candidate.id, workspace, user, source="upload")
    background_tasks.add_task(builder.launch_background, candidate.id, reserved)
    return IngestResponse(candidate_id=candidate.id, updated_existing=updated, parse_source=parsed.source,
                          context_revision=revision, job_id=job.id if job else None, added_to_job=added)
