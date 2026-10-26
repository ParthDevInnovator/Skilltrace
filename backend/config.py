from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, SecretStr


class Settings(BaseSettings):
    APP_NAME: str = "Mosaic"
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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
