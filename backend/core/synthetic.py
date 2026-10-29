"""Central policy helpers that keep demo records separate from real PII."""
from backend.core.roles import Role


def may_include_synthetic(roles: list[str], requested: bool) -> bool:
    """Only an explicit HR administrator request may include demo records."""
    return requested and Role.hr_admin.value in roles


def is_synthetic_candidate(candidate) -> bool:
    """Database rows carry the flag; legacy seed fixtures are synthetic by definition."""
    return bool(getattr(candidate, "is_synthetic", True))


def filter_candidates(candidates, roles: list[str], requested: bool = False):
    if may_include_synthetic(roles, requested):
        return list(candidates)
    return [candidate for candidate in candidates if not is_synthetic_candidate(candidate)]
