from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with loopback defaults and environment overrides."""

    app_name: str = "SlothPilot AI"
    app_version: str = "0.1.0"
    environment: str = "development"

    # Server binding (Strict loopback isolation by default)
    host: str = Field(default="127.0.0.1", description="Bind host - loopback only")
    port: int = Field(default=8000, description="Backend HTTP port")
    frontend_origins: list[str] = Field(
        default=["http://127.0.0.1:5173", "http://localhost:5173"],
        description="Allowed CORS origins"
    )

    # Local Storage paths
    data_dir: Path = Field(default=Path("./data"), description="Root storage directory")
    database_filename: str = "slothpilot.db"

    # Ollama Local AI Inference
    ollama_base_url: str = Field(
        default="http://127.0.0.1:11434",
        description="Ollama local API endpoint"
    )
    ollama_default_model: str = Field(
        default="qwen2.5:7b",
        description="Default local model candidate"
    )
    ollama_timeout_seconds: float = Field(
        default=60.0,
        description="Timeout for AI inference requests"
    )

    # Processing safety limits
    max_file_size_bytes: int = Field(
        default=50 * 1024 * 1024,  # 50 MB
        description="Maximum file size for document extraction & hashing"
    )
    extraction_timeout_seconds: float = Field(
        default=30.0,
        description="Timeout for document extraction per file"
    )
    task_history_retention_days: int = Field(
        default=90,
        description="Retention limit for completed tasks"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def resolved_data_dir(self) -> Path:
        resolved = self.data_dir.resolve()
        resolved.mkdir(parents=True, exist_ok=True)
        return resolved

    @property
    def database_path(self) -> Path:
        return self.resolved_data_dir / self.database_filename


settings = Settings()
