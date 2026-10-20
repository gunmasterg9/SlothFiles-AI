from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from backend.app.services.folder_watcher import folder_watcher_service

router = APIRouter(prefix="/api/watcher", tags=["LazyDesk Automation"])


class AddWatchRequest(BaseModel):
    folder_path: str = Field(..., description="Approved directory path to monitor")
    recursive: bool = Field(default=False)
    debounce_seconds: float = Field(default=2.0, ge=0.5, le=30.0)


@router.get("/watches")
async def list_watches():
    """List all registered folder watches and their pause/resume status."""
    return folder_watcher_service.list_watches()


@router.post("/watches", status_code=status.HTTP_201_CREATED)
async def add_watch(req: AddWatchRequest):
    """Start monitoring an approved directory for new or modified files."""
    return folder_watcher_service.add_watch(
        raw_folder_path=req.folder_path,
        recursive=req.recursive,
        debounce_seconds=req.debounce_seconds
    )


@router.post("/watches/{watch_id}/pause")
async def pause_watch(watch_id: str):
    """Pause an active folder watch."""
    return folder_watcher_service.pause_watch(watch_id)


@router.post("/watches/{watch_id}/resume")
async def resume_watch(watch_id: str):
    """Resume a paused folder watch."""
    return folder_watcher_service.resume_watch(watch_id)


@router.delete("/watches/{watch_id}")
async def remove_watch(watch_id: str):
    """Stop monitoring a directory and remove the watch."""
    success = folder_watcher_service.remove_watch(watch_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Watch not found: {watch_id}"
        )
    return {"status": "ok", "removed_id": watch_id}


@router.get("/events")
async def list_recent_events(
    watch_id: Optional[str] = Query(default=None, description="Filter by watch ID"),
    event_type: Optional[str] = Query(default=None, description="Filter by event type: created, modified, moved, deleted"),
    limit: int = Query(default=100, ge=1, le=1000, description="Max number of events to return"),
    offset: int = Query(default=0, ge=0, description="Pagination offset")
):
    """Retrieve queryable recent file activity feed across monitored folders.

    NOTE: The real-time watcher event feed is held in an in-memory ring buffer (bounded to 1,000 entries)
    to provide responsive loopback polling without unnecessary SQLite writes.
    Consequential approved operations are permanently recorded in SQLite audit_logs.
    """
    return folder_watcher_service.get_recent_events(
        watch_id=watch_id,
        event_type=event_type,
        limit=limit,
        offset=offset
    )


@router.post("/events/clear")
async def clear_recent_events():
    """Clear the in-memory recent event feed."""
    folder_watcher_service.clear_events()
    return {"status": "ok", "message": "Recent event feed cleared."}
