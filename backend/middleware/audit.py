import asyncio
from backend.core.database import AsyncSessionLocal
from backend.core.security import decode_token
from backend.models.db import AuditLog

AUDITED = ("/candidates", "/context", "/evidence", "/brief", "/interview-questions", "/graph", "/export")

async def _write(payload: dict):
    try:
        async with AsyncSessionLocal() as db:
            db.add(AuditLog(**payload)); await db.commit()
    except Exception:
        pass

class AuditMiddleware:
    def __init__(self, app): self.app = app
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http": return await self.app(scope, receive, send)
        path = scope.get("path", "")
        await self.app(scope, receive, send)
        if not any(part in path for part in AUDITED): return
        headers = dict(scope.get("headers", [])); authorization = headers.get(b"authorization", b"").decode()
        if not authorization.startswith("Bearer "): return
        try: claims = decode_token(authorization[7:])
        except ValueError: return
        pieces = path.split("/"); candidate_id = next((x for x in pieces if x.startswith("CAND-")), None)
        asyncio.create_task(_write({"user_id": claims["sub"], "role_snapshot": ",".join(claims.get("roles", [])), "endpoint": path,
            "method": scope["method"], "candidate_id": candidate_id,
            "action_type": "DELETE" if scope["method"] == "DELETE" else "EXPORT" if "export" in path else "VIEW"}))
