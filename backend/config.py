from pathlib import Path
from typing import List, Literal
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, SecretStr, field_validator, model_validator


class Settings(BaseSettings):
    APP_NAME: str = "Skitrace"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # Server configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS configuration
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    # Project directories
    BASE_DIR: Path = Path(__file__).resolve().parent
    DATA_DIR: Path = BASE_DIR / "data"
    SIGNAL_CACHE_DIR: Path = BASE_DIR / ".cache" / "signals"
    SIGNAL_CACHE_TTL_SECONDS: int = Field(default=6 * 60 * 60, gt=0)
    SIGNAL_HTTP_TIMEOUT_SECONDS: float = Field(default=8.0, gt=0, le=60)
    GITHUB_TOKEN: SecretStr | None = None
    ADMIN_KEY: SecretStr | None = None
    GEMINI_API_KEY: SecretStr | None = None
    GROQ_API_KEY: SecretStr | None = None
    gemini_model: str = "gemini-2.0-flash"
    groq_model: str = "llama-3.3-70b-versatile"
    LLM_TIMEOUT_SECONDS: float = Field(default=30, gt=0, le=120)
    NEO4J_URI: str | None = None
    NEO4J_USER: str | None = None
    NEO4J_PASSWORD: SecretStr | None = None
    GRAPH_SEEDING_ENABLED: bool = False

    # Phase 5 persistence, authentication, and retention.
    DATABASE_URL: str = "sqlite+aiosqlite:///./mosaic.db"
    DB_POOL_SIZE: int = Field(default=5, ge=1)
    DB_MAX_OVERFLOW: int = Field(default=10, ge=0)
    JWT_SECRET: SecretStr = SecretStr("development-only-change-me-at-least-32-bytes")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = Field(default=60, gt=0)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, gt=0)
    OAUTH_PROVIDER: Literal["google", "github", "clerk"] | None = None
    OAUTH_CLIENT_ID: str | None = None
    OAUTH_CLIENT_SECRET: SecretStr | None = None
    OAUTH_REDIRECT_URI: str | None = None
    SIGNAL_CACHE_TTL_DAYS: int = Field(default=90, gt=0)
    AUTO_SEED_DB: bool = False
    E2E_BOOTSTRAP_USERS: bool = False

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug_mode(cls, value):
        if isinstance(value, str) and value.lower() in {"release", "production", "prod"}:
            return False
        return value

    @model_validator(mode="after")
    def production_secrets(self):
        secret=self.JWT_SECRET.get_secret_value()
        if self.ENVIRONMENT.lower() in {"production","prod"} and (secret.startswith("development-") or len(secret)<32):
            raise ValueError("JWT_SECRET must be a deployment-specific value of at least 32 characters")
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
