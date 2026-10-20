from fastapi import APIRouter, Query, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.services.inbox_service import inbox_service

router = APIRouter(prefix="/api/inbox", tags=["Inbox & Notes Assistant"])


class ImportFileRequest(BaseModel):
    file_path: str = Field(..., description="Approved file path to import (.txt, .md, .eml)")
    title: str | None = Field(default=None, description="Optional custom title")


class AnalyzeItemRequest(BaseModel):
    use_ai: bool = Field(default=True, description="Enable local open-weight AI analysis")


@router.post("/import", status_code=status.HTTP_201_CREATED)
async def import_file(req: ImportFileRequest):
    """Import a local note or email file into the inbox store."""
    return inbox_service.import_file(raw_file_path=req.file_path, title=req.title)


@router.get("/items")
async def list_items(
    query: str | None = Query(default=None, description="Search keyword"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0)
):
    """List imported inbox notes and emails with optional search filtering."""
    return inbox_service.list_items(query=query, limit=limit, offset=offset)


@router.get("/items/{item_id}")
async def get_item_details(item_id: str):
    """Retrieve full text, extracted action items, key dates, and drafted reply."""
    return inbox_service.get_item(item_id)


@router.post("/items/{item_id}/analyze")
async def analyze_item(item_id: str, req: AnalyzeItemRequest):
    """Run factual summarization, action item extraction, date parsing, and draft generation."""
    return await inbox_service.analyze_item(item_id=item_id, use_ai=req.use_ai)
