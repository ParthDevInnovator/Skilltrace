from enum import Enum


class Role(str, Enum):
    """Recruiters rank and brief; hiring managers have masked read-only access;
    HR administrators manage records, audit data, configuration, and synthetic data.
    """
    recruiter = "recruiter"
    hiring_manager = "hiring_manager"
    hr_admin = "hr_admin"


ROLE_HIERARCHY: dict[Role, set[Role]] = {
    Role.recruiter: {Role.recruiter},
    Role.hiring_manager: {Role.hiring_manager},
    Role.hr_admin: {Role.hr_admin, Role.recruiter, Role.hiring_manager},
}
