from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.services.file_organizer import file_organizer_service
from backend.app.services.approval_service import approval_service

router = APIRouter(prefix="/api/organizer", tags=["File Organizer"])


class ScanFolderRequest(BaseModel):
    folder_path: str = Field(..., description="Target approved folder path to scan")
    use_ai: bool = Field(default=True, description="Use local Ollama for categorization if available")


@router.post("/scan")
async def scan_folder(req: ScanFolderRequest):
    """Scan approved directory, detect exact duplicates, and construct action plan."""
    try:
        return await file_organizer_service.scan_and_plan(
            raw_folder_path=req.folder_path,
            use_ai=req.use_ai
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc)
        ) from exc


@router.get("/plans")
async def list_organizer_plans():
    """List recent plans prepared by the organizer module."""
    pending = approval_service.get_pending_plans()
    return [p for p in pending if p.get("module") == "organizer"]
