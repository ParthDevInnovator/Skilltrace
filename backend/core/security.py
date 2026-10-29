import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from backend.config import settings


class TokenExpiredError(ValueError): pass
class TokenInvalidError(ValueError): pass


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except (ValueError, TypeError):
        return False


def _encode(payload: dict, lifetime: timedelta) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({**payload, "iat": now, "exp": now + lifetime, "jti": str(uuid.uuid4())},
                      settings.JWT_SECRET.get_secret_value(), algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: str, roles: list[str], expires_delta: timedelta | None = None) -> str:
    return _encode({"sub": user_id, "roles": roles, "type": "access"},
                   expires_delta or timedelta(minutes=settings.JWT_EXPIRE_MINUTES))


def create_refresh_token(user_id: str) -> str:
    return _encode({"sub": user_id, "type": "refresh"}, timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET.get_secret_value(), algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpiredError("Token expired") from exc
    except jwt.PyJWTError as exc:
        raise TokenInvalidError("Invalid token") from exc
    if not payload.get("sub") or not payload.get("jti"):
        raise TokenInvalidError("Token missing required claims")
    return payload


class TokenBlacklist:
    def __init__(self): self._jtis: set[str] = set()
    def blacklist_token(self, jti: str) -> None: self._jtis.add(jti)
    def is_blacklisted(self, jti: str) -> bool: return jti in self._jtis


token_blacklist = TokenBlacklist()
