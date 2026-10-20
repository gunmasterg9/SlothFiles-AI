from datetime import datetime, timezone
import json
import logging
from typing import Literal
import uuid
from fastapi import HTTPException, status

from backend.app.db.session import get_db
from backend.app.services.audit_service import audit_service

logger = logging.getLogger("slothpilot.tasks")

TaskState = Literal[
    "queued", "running", "awaiting_approval", "succeeded", "failed", "cancelled"
]

VALID_TRANSITIONS: dict[TaskState, set[TaskState]] = {
    "queued": {"running", "cancelled"},
    "running": {"awaiting_approval", "succeeded", "failed", "cancelled"},
    "awaiting_approval": {"running", "succeeded", "failed", "cancelled"},
    "succeeded": set(),
    "failed": set(),
    "cancelled": set(),
}


class TaskQueueService:
    """Manages background task lifecycle, valid state transitions, and audit records."""

    @staticmethod
    def create_task(
        task_type: str,
        message: str = "",
        metadata: dict | None = None
    ) -> dict:
        """Enqueue a new task in the queued state."""
        task_id = str(uuid.uuid4())
        now_utc = datetime.now(timezone.utc).isoformat()
        meta_json = json.dumps(metadata or {})

        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO tasks (id, task_type, status, progress, message, created_at, metadata_json)
                VALUES (?, ?, 'queued', 0.0, ?, ?, ?)
                """,
                (task_id, task_type, message, now_utc, meta_json)
            )
            conn.execute(
                """
                INSERT INTO task_events (task_id, timestamp, event_type, details)
                VALUES (?, ?, 'QUEUED', ?)
                """,
                (task_id, now_utc, message or f"Task {task_type} queued")
            )

        audit_service.log(
            action="TASK_QUEUED",
            module="tasks",
            actor="system",
            details=f"Task {task_id} ({task_type}) enqueued",
            success=True
        )

        return TaskQueueService.get_task(task_id)

    @staticmethod
    def get_task(task_id: str) -> dict:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Task not found: {task_id}"
                )
            events = conn.execute(
                "SELECT * FROM task_events WHERE task_id = ? ORDER BY id ASC",
                (task_id,)
            ).fetchall()

        task = dict(row)
        task["metadata"] = json.loads(task["metadata_json"])
        task["events"] = [dict(e) for e in events]
        return task

    @staticmethod
    def list_tasks(
        status_filter: str | None = None,
        limit: int = 50,
        offset: int = 0
    ) -> list[dict]:
        with get_db() as conn:
            if status_filter:
                rows = conn.execute(
                    """
                    SELECT * FROM tasks
                    WHERE status = ?
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (status_filter, limit, offset)
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM tasks
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (limit, offset)
                ).fetchall()

        results = []
        for r in rows:
            t = dict(r)
            t["metadata"] = json.loads(t["metadata_json"])
            results.append(t)
        return results

    @staticmethod
    def transition(
        task_id: str,
        new_state: TaskState,
        progress: float | None = None,
        message: str = "",
        error_message: str | None = None,
        extra_metadata: dict | None = None
    ) -> dict:
        """Validate state transition and persist update with event audit."""
        task = TaskQueueService.get_task(task_id)
        current_state: TaskState = task["status"]

        if new_state != current_state:
            allowed = VALID_TRANSITIONS.get(current_state, set())
            if new_state not in allowed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Illegal task transition from '{current_state}' to '{new_state}'."
                )

        now_utc = datetime.now(timezone.utc).isoformat()
        completed_at = now_utc if new_state in {"succeeded", "failed", "cancelled"} else task["completed_at"]
        new_progress = progress if progress is not None else task["progress"]

        meta = task["metadata"]
        if extra_metadata:
            meta.update(extra_metadata)
        meta_json = json.dumps(meta)

        with get_db() as conn:
            conn.execute(
                """
                UPDATE tasks SET
                    status = ?,
                    progress = ?,
                    message = ?,
                    completed_at = ?,
                    error_message = ?,
                    metadata_json = ?
                WHERE id = ?
                """,
                (new_state, new_progress, message or task["message"], completed_at, error_message, meta_json, task_id)
            )
            conn.execute(
                """
                INSERT INTO task_events (task_id, timestamp, event_type, details)
                VALUES (?, ?, ?, ?)
                """,
                (task_id, now_utc, new_state.upper(), message or f"State changed to {new_state}")
            )

        if new_state in {"succeeded", "failed", "cancelled"}:
            audit_service.log(
                action=f"TASK_{new_state.upper()}",
                module="tasks",
                actor="system",
                details=f"Task {task_id} {new_state}. {error_message or message}",
                success=(new_state == "succeeded")
            )

        return TaskQueueService.get_task(task_id)

    @staticmethod
    def cancel_task(task_id: str) -> dict:
        """Request cooperative cancellation of a queued or running task."""
        return TaskQueueService.transition(
            task_id=task_id,
            new_state="cancelled",
            message="Task cancelled by user request."
        )


task_queue = TaskQueueService()
