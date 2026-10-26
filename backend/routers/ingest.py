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

router = APIRouter(tags=["Resume ingestion"])


class IngestResponse(BaseModel):
    candidate_id: str
    status: Literal["building"] = "building"
    updated_existing: bool
    parse_source: Literal["pdf", "docx", "txt"]
    context_revision: str
    enrichment_pending: bool = True


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
    full_name: Annotated[str | None, Form(max_length=150)] = None,
    email: Annotated[str | None, Form(max_length=254)] = None,
    headline: Annotated[str | None, Form(max_length=500)] = None,
    location: Annotated[str | None, Form(max_length=300)] = None,
):
    try:
        filename = file.filename or ""
        if Path(filename).suffix.lower() not in SUPPORTED_EXTENSIONS:
            raise HTTPException(422, "Supported resume formats are PDF, DOCX and TXT.")
        data = bytearray()
        while chunk := await file.read(64 * 1024):
            data.extend(chunk)
            if len(data) > MAX_UPLOAD_BYTES:
                raise HTTPException(413, "Resume files must be 5 MB or smaller.")
    finally:
        await file.close()
    if not data:
        raise HTTPException(422, "The resume file is empty.")
    parsed = await run_in_threadpool(parse_resume, raw_bytes=bytes(data), filename=filename)
    if parsed.source == "empty":
        raise HTTPException(422, "Could not read resume text. Check the file or upload a text resume.")
    if parsed.source == "pdf" and parsed.char_count < 50:
        raise HTTPException(422, "PDF has fewer than 50 readable characters. Scanned PDFs require OCR or a text resume.")
    identity = extract_identity(parsed.raw_text).model_dump()
    overrides = {"full_name": full_name, "email": email, "headline": headline, "location": location}
    identity.update({key: value.strip() for key, value in overrides.items() if value and value.strip()})
    try:
        extracted = ExtractedIdentity.model_validate(identity)
        if builder.store is not store:
            raise HTTPException(503, "Resume service configuration is inconsistent.")
        candidate, updated, revision, reserved = await builder.ingest_resume(extracted, parsed, filename, bytes(data))
    except ValidationError:
        raise HTTPException(422, "Candidate identity is invalid. Check the name, email, headline and location fields.") from None
    except MissingIdentityError as exc:
        raise HTTPException(422, str(exc)) from None
    background_tasks.add_task(builder.launch_background, candidate.id, reserved)
    return IngestResponse(candidate_id=candidate.id, updated_existing=updated,
                          parse_source=parsed.source, context_revision=revision)
