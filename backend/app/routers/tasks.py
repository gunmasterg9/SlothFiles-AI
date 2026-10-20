from fastapi import APIRouter, Query, HTTPException, status
from pydantic import BaseModel

from backend.app.services.task_queue import task_queue

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


class TaskItem(BaseModel):
    id: str
    task_type: str
    status: str
    progress: float
    message: str
    created_at: str
    completed_at: str | None
    error_message: str | None
    metadata: dict


@router.get("", response_model=list[TaskItem])
async def list_tasks(
    status: str | None = Query(default=None, description="Filter by status"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0)
):
    """List recent tasks across all modules."""
    return task_queue.list_tasks(status_filter=status, limit=limit, offset=offset)


@router.get("/{task_id}")
async def get_task_details(task_id: str):
    """Retrieve full task details, progress, and event history."""
    return task_queue.get_task(task_id)


@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str):
    """Request cooperative cancellation of a task."""
    return task_queue.cancel_task(task_id)
