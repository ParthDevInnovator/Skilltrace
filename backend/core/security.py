import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from backend.config import settings

# bcrypt only reads the first 72 bytes and the library rejects longer input.
BCRYPT_MAX_BYTES = 72


class TokenExpiredError(ValueError): pass
class TokenInvalidError(ValueError): pass


def _password_bytes(plain: str) -> bytes:
    raw = plain.encode()
    # Pre-hash long passwords so every byte counts and hashing never fails.
    return hashlib.sha256(raw).hexdigest().encode() if len(raw) > BCRYPT_MAX_BYTES else raw


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_password_bytes(plain), bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_password_bytes(plain), hashed.encode())
    except (ValueError, TypeError):
        return False


def _encode(payload: dict, lifetime: timedelta, jti: str | None = None) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({**payload, "iat": now, "exp": now + lifetime, "jti": jti or str(uuid.uuid4())},
                      settings.JWT_SECRET.get_secret_value(), algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: str, roles: list[str], expires_delta: timedelta | None = None,
                        *, session_id: str | None = None) -> str:
    payload = {"sub": user_id, "roles": roles, "type": "access"}
    if session_id:
        payload["sid"] = session_id
    return _encode(payload, expires_delta or timedelta(minutes=settings.JWT_EXPIRE_MINUTES))


def create_refresh_token(user_id: str, *, family_id: str | None = None, jti: str | None = None) -> str:
    payload = {"sub": user_id, "type": "refresh"}
    if family_id:
        payload["fam"] = family_id
    return _encode(payload, timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS), jti)


def decode_token(token: str, *, verify_exp: bool = True) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET.get_secret_value(), algorithms=[settings.JWT_ALGORITHM],
                             options={"verify_exp": verify_exp})
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpiredError("Token expired") from exc
    except jwt.PyJWTError as exc:
        raise TokenInvalidError("Invalid token") from exc
    if not payload.get("sub") or not payload.get("jti"):
        raise TokenInvalidError("Token missing required claims")
    return payload


def token_expiry(payload: dict) -> datetime:
    return datetime.fromtimestamp(int(payload["exp"]), timezone.utc)


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class TokenBlacklist:
    """Process-local fast path. Durable revocation lives in `revoked_tokens`."""
    def __init__(self): self._jtis: set[str] = set()
    def blacklist_token(self, jti: str) -> None: self._jtis.add(jti)
    def is_blacklisted(self, jti: str) -> bool: return jti in self._jtis


token_blacklist = TokenBlacklist()
