"""OpenAPI (Swagger) customisation for the Skitrace API.

FastAPI generates the schema; this module only changes how it is documented:

* Protected routes use a plain HTTP Bearer scheme. The runtime dependency is an
  ``OAuth2PasswordBearer``, but native login accepts JSON, so Swagger's password
  flow could never obtain a token. Bearer lets you paste a native access token or
  a Clerk session token into "Authorize".
* Tags carry descriptions so Swagger UI groups the routes meaningfully.
* Legacy unprefixed aliases (``/jd/*``, ``/candidates/*`` ...) are hidden in
  ``main.py`` with ``include_in_schema=False``; they still serve requests.
"""
from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

BEARER_SCHEME = "BearerAuth"

API_DESCRIPTION = """
**Skitrace — Beyond the Resume.** Evidence-based candidate intelligence: resume ingestion,
attributed public-signal evidence, deterministic requirement matching and ranking, and
optional AI briefs / knowledge-graph views.

### Authentication
Protected routes need `Authorization: Bearer <token>`. Click **Authorize** and paste the token.

* **Native mode** (no `CLERK_SECRET_KEY` on the backend): `POST /api/v1/auth/register`, then
  `POST /api/v1/auth/login` and use `access_token`. New accounts start as `pending` until an
  HR admin approves their membership request (unless their email domain is auto-admitted).
* **Clerk mode** (`CLERK_SECRET_KEY` set): only Clerk session tokens are accepted. Sign in
  through the web UI and copy the bearer token from any `/api/...` request in DevTools.
  Clerk session tokens are short-lived (about a minute), so copy a fresh one if you get 401.

### Roles
`recruiter` ranks and briefs, `hiring_manager` gets masked read-only access, `hr_admin`
inherits both and manages members, audit logs, deletion and rebuilds.

### Asynchronous contexts
After an upload, candidate context builds in the background. Context, JD-match and brief
routes answer **202** with `Retry-After` while building, **503** when the build failed.
"""

TAGS_METADATA: list[dict[str, str]] = [
    {"name": "Health", "description": "Liveness and runtime record counts. Public."},
    {"name": "Authentication", "description": "Native email/password accounts, sessions, email verification and OAuth."},
    {"name": "Jobs", "description": "Requisitions: list, search, detail and creation with structured requirements."},
    {"name": "Resume ingestion", "description": "Upload a PDF/DOCX/TXT resume (≤ 5 MB) to create or update a candidate."},
    {"name": "Candidates", "description": "Candidate search, detail, evidence context, resume text and per-job match."},
    {"name": "JD matching", "description": "Deterministic requirement extraction, ranking and similar-job lookup. No LLM involved."},
    {"name": "AI assistance", "description": "Chat, interview briefs and questions. Needs `GEMINI_API_KEY` and/or `GROQ_API_KEY`; 503 otherwise."},
    {"name": "Knowledge graph", "description": "Candidate skill graph. Needs `NEO4J_URI`/`NEO4J_USER`/`NEO4J_PASSWORD`; 503 otherwise."},
    {"name": "Administration", "description": "HR-admin routes: membership approval, workspace domains, audit logs, deletion, rebuild."},
    {"name": "Root", "description": "Welcome payload with links."},
]


def build_openapi_schema(app: FastAPI) -> dict[str, Any]:
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=API_DESCRIPTION,
        routes=app.routes,
        tags=TAGS_METADATA,
    )
    components = schema.setdefault("components", {})
    components["securitySchemes"] = {
        BEARER_SCHEME: {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Native access token from /api/v1/auth/login, or a Clerk session token.",
        }
    }
    for operations in schema.get("paths", {}).values():
        for operation in operations.values():
            if isinstance(operation, dict) and "security" in operation:
                operation["security"] = [{BEARER_SCHEME: []}]
    return schema


def install_openapi(app: FastAPI) -> None:
    """Replace ``app.openapi`` with the customised, cached schema builder."""

    def openapi() -> dict[str, Any]:
        if app.openapi_schema is None:
            app.openapi_schema = build_openapi_schema(app)
        return app.openapi_schema

    app.openapi = openapi  # type: ignore[method-assign]
