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
    GEMINI_API_KEY: SecretStr | None = None
    GROQ_API_KEY: SecretStr | None = None
    gemini_model: str = "gemini-2.0-flash"
    groq_model: str = "llama-3.3-70b-versatile"
    LLM_TIMEOUT_SECONDS: float = Field(default=30, gt=0, le=120)
    NEO4J_URI: str | None = None
    NEO4J_USER: str | None = None
    NEO4J_PASSWORD: SecretStr | None = None
    GRAPH_SEEDING_ENABLED: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
