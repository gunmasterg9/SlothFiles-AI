import os
from datetime import datetime, timezone
import httpx
from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from backend.app.config import settings

router = APIRouter(prefix="/api", tags=["System"])


class HealthResponse(BaseModel):
    status: str = Field(default="ok", examples=["ok"])
    app_name: str
    version: str
    environment: str
    timestamp: str


class ReadinessComponent(BaseModel):
    name: str
    status: str
    details: str | None = None


class ReadinessResponse(BaseModel):
    status: str = Field(description="ready or degraded")
    timestamp: str
    components: list[ReadinessComponent]


@router.get("/health", response_model=HealthResponse, status_code=status.HTTP_200_OK)
async def get_health():
    """Liveness probe returning application identity and UTC timestamp."""
    return HealthResponse(
        status="ok",
        app_name=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        timestamp=datetime.now(timezone.utc).isoformat()
    )


@router.get("/ready", response_model=ReadinessResponse, status_code=status.HTTP_200_OK)
async def get_readiness():
    """Readiness probe verifying local storage and Ollama connectivity."""
    components: list[ReadinessComponent] = []

    # 1. Storage check
    try:
        data_dir = settings.resolved_data_dir
        test_file = data_dir / ".write_test"
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink()
        components.append(ReadinessComponent(name="storage", status="healthy", details=str(data_dir)))
    except Exception as exc:
        components.append(ReadinessComponent(name="storage", status="unhealthy", details=str(exc)))

    # 2. Database path check
    try:
        db_path = settings.database_path
        components.append(ReadinessComponent(
            name="database",
            status="healthy" if db_path.parent.exists() else "unhealthy",
            details=str(db_path)
        ))
    except Exception as exc:
        components.append(ReadinessComponent(name="database", status="unhealthy", details=str(exc)))

    # 3. Ollama local connection check
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            if resp.status_code == 200:
                models = resp.json().get("models", [])
                components.append(ReadinessComponent(
                    name="ollama",
                    status="connected",
                    details=f"{len(models)} local models detected"
                ))
            else:
                components.append(ReadinessComponent(
                    name="ollama",
                    status="offline",
                    details=f"HTTP {resp.status_code}"
                ))
    except Exception as exc:
        components.append(ReadinessComponent(
            name="ollama",
            status="offline",
            details=f"Ollama offline or starting: {type(exc).__name__}"
        ))

    storage_healthy = any(c.name == "storage" and c.status == "healthy" for c in components)
    database_healthy = any(c.name == "database" and c.status == "healthy" for c in components)
    overall_status = "ready" if (storage_healthy and database_healthy) else "degraded"

    return ReadinessResponse(
        status=overall_status,
        timestamp=datetime.now(timezone.utc).isoformat(),
        components=components
    )
