from backend.core.roles import Role

ROUTE_PERMISSIONS: dict[str, list[Role]] = {
    "GET /candidates*": [Role.recruiter, Role.hr_admin],
    "POST /candidates/*/context": [Role.recruiter, Role.hr_admin],
    "POST /jd/match*": [Role.recruiter, Role.hr_admin],
    "POST /candidates/*/rank": [Role.recruiter, Role.hr_admin],
    "POST /candidates/*/brief": [Role.recruiter, Role.hr_admin],
    "POST /agent/chat": [Role.recruiter, Role.hiring_manager, Role.hr_admin],
    "GET /candidates/*/evidence*": list(Role),
    "POST /candidates/*/interview-questions": list(Role),
    "GET /candidates/*/graph": list(Role),
    "POST /candidates/*/graph-evidence": list(Role),
    "DELETE /candidates/*": [Role.hr_admin],
    "GET /admin/audit-logs": [Role.hr_admin],
    "POST /admin/*": [Role.hr_admin],
}
