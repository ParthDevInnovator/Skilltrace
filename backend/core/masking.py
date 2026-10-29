from sqlalchemy.inspection import inspect
from backend.core.roles import Role


def mask_candidate(candidate, role: Role) -> dict:
    if hasattr(candidate, "model_dump"):
        data = candidate.model_dump(mode="json")
    else:
        data = {column.key: getattr(candidate, column.key) for column in inspect(candidate).mapper.column_attrs}
    masked: list[str] = []
    if role == Role.hiring_manager:
        data.update(email="***@***.***", location="[Redacted]")
        masked = ["email", "location"]
    data["masked_fields"] = masked
    return data
