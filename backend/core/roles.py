from enum import Enum


class Role(str, Enum):
    """Recruiters rank and brief; hiring managers have masked read-only access;
    HR administrators manage records, audit data, configuration, and synthetic data.
    """
    recruiter = "recruiter"
    hiring_manager = "hiring_manager"
    hr_admin = "hr_admin"


# Signed-in but not admitted to a workspace. Deliberately not a Role member:
# require_role() ignores unknown values, so pending users can reach no data route.
PENDING_ROLE = "pending"


ROLE_HIERARCHY: dict[Role, set[Role]] = {
    Role.recruiter: {Role.recruiter},
    Role.hiring_manager: {Role.hiring_manager},
    Role.hr_admin: {Role.hr_admin, Role.recruiter, Role.hiring_manager},
}


def effective_roles(roles: list[str]) -> set[Role]:
    effective: set[Role] = set()
    for value in roles or []:
        try:
            effective.update(ROLE_HIERARCHY[Role(value)])
        except ValueError:
            continue
    return effective


def is_pending(roles: list[str]) -> bool:
    return not effective_roles(roles)


def primary_role(roles: list[str]) -> Role | None:
    """The single role used for data shaping; restrictive only when nothing broader is held."""
    held = effective_roles(roles)
    if Role.hr_admin in held:
        return Role.hr_admin
    if Role.recruiter in held:
        return Role.recruiter
    if Role.hiring_manager in held:
        return Role.hiring_manager
    return None
