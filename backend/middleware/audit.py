"""Access audit for candidate-data routes, attributed to the already-verified principal.

Authentication dependencies (native JWT or Clerk) record the principal on the
request state; this middleware never re-decodes bearer tokens itself.
"""
from backend.services.audit import audit_writer

AUDITED = ("/candidates", "/context", "/evidence", "/brief", "/interview-questions", "/graph", "/export")
# Routes that write their own, more specific audit records.
SELF_AUDITED = ("/audit/", "/auth/", "/admin/")


def _candidate_id(path: str) -> str | None:
    parts = [part for part in path.split("/") if part]
    for index, part in enumerate(parts):
        if part == "candidates" and index + 1 < len(parts) and parts[index + 1] not in ("resolve",):
            return parts[index + 1]
    return None


class AuditMiddleware:
    def __init__(self, app): self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        status = {"code": None}

        async def capture(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            await send(message)

        await self.app(scope, receive, capture)
        if not any(part in path for part in AUDITED) or any(part in path for part in SELF_AUDITED):
            return
        principal = (scope.get("state") or {}).get("audit_principal")
        if not principal:
            return  # Unauthenticated requests are rejected before any data is read.
        method = scope["method"]
        code = status["code"] or 500
        if method == "DELETE" and code < 400:
            return  # Successful erasures are recorded by the deletion workflow itself.
        action = ("DENIED" if code in (401, 403) else "DELETE_FAILED" if method == "DELETE"
                  else "EXPORT" if "export" in path else "VIEW")
        await audit_writer.record(
            user_id=principal.get("user_id"), roles=principal.get("roles", []), endpoint=path, method=method,
            candidate_id=_candidate_id(path), workspace_id=principal.get("workspace_id"), status_code=code,
            action_type=action)
