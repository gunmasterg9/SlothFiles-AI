from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.config import settings
from backend.app.services.ai_service import (
    ollama_service,
    OllamaOfflineError,
    OllamaModelNotFoundError
)
from backend.app.services.path_service import path_service

router = APIRouter(prefix="/api", tags=["Settings"])


class RootAddRequest(BaseModel):
    path: str = Field(..., description="Absolute folder path to approve")
    label: str = Field(default="", description="Optional human label")


class ModelSelectRequest(BaseModel):
    model: str = Field(..., description="Model name to activate")


class SystemSettingsResponse(BaseModel):
    app_name: str
    app_version: str
    environment: str
    host: str
    port: int
    ollama_base_url: str
    ollama_selected_model: str
    max_file_size_bytes: int
    extraction_timeout_seconds: int
    approved_roots: list[dict]


@router.get("/settings", response_model=SystemSettingsResponse)
async def get_settings():
    """Retrieve application configuration, active model, and approved roots."""
    roots = path_service.get_approved_roots()
    selected_model = ollama_service.get_selected_model()
    return SystemSettingsResponse(
        app_name=settings.app_name,
        app_version=settings.app_version,
        environment=settings.environment,
        host=settings.host,
        port=settings.port,
        ollama_base_url=settings.ollama_base_url,
        ollama_selected_model=selected_model,
        max_file_size_bytes=settings.max_file_size_bytes,
        extraction_timeout_seconds=int(settings.extraction_timeout_seconds),
        approved_roots=roots
    )


@router.get("/models")
async def list_models():
    """Discover models installed in the local Ollama runtime."""
    try:
        models = await ollama_service.list_models()
        selected = ollama_service.get_selected_model()
        return {
            "status": "connected",
            "selected_model": selected,
            "models": models,
            "count": len(models)
        }
    except OllamaOfflineError as exc:
        return {
            "status": "offline",
            "selected_model": ollama_service.get_selected_model(),
            "models": [],
            "count": 0,
            "error": str(exc)
        }


@router.put("/settings/model")
async def set_model(req: ModelSelectRequest):
    """Set the active open-weight model after verifying it is installed locally."""
    try:
        available = await ollama_service.list_models()
        if req.model not in available:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Model '{req.model}' is not available in local Ollama. Available: {available}"
            )
        ollama_service.set_selected_model(req.model)
        return {"status": "ok", "selected_model": req.model}
    except OllamaOfflineError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc)
        ) from exc


@router.post("/settings/roots", status_code=status.HTTP_201_CREATED)
async def add_approved_root(req: RootAddRequest):
    """Register a new approved folder root for restricted filesystem operations."""
    return path_service.add_approved_root(req.path, req.label)


@router.delete("/settings/roots/{root_id}")
async def remove_approved_root(root_id: str):
    """Deactivate an approved root directory."""
    success = path_service.remove_approved_root(root_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approved root not found or already inactive."
        )
    return {"status": "ok", "removed_id": root_id}
