from pathlib import Path
import time
import pytest
from fastapi import HTTPException, status

from backend.app.services.path_service import path_service
from backend.app.services.task_queue import task_queue
from backend.app.services.folder_watcher import folder_watcher_service


def test_task_state_transitions():
    """Verify task lifecycle transitions and rejection of invalid state transitions."""
    task = task_queue.create_task("test_job", message="Starting job")
    assert task["status"] == "queued"
    assert task["progress"] == 0.0

    # Valid: queued -> running
    running = task_queue.transition(task["id"], "running", progress=0.5, message="Processing data")
    assert running["status"] == "running"
    assert running["progress"] == 0.5

    # Valid: running -> succeeded
    succeeded = task_queue.transition(task["id"], "succeeded", progress=1.0, message="Job finished")
    assert succeeded["status"] == "succeeded"
    assert succeeded["completed_at"] is not None

    # Invalid: succeeded -> running
    with pytest.raises(HTTPException) as exc:
        task_queue.transition(task["id"], "running")
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST


def test_task_cancellation():
    """Verify cooperative cancellation of a queued task."""
    task = task_queue.create_task("cancellable_job")
    cancelled = task_queue.cancel_task(task["id"])
    assert cancelled["status"] == "cancelled"
    assert "cancelled" in cancelled["message"].lower()


def test_watcher_lifecycle_and_loop_prevention(tmp_path: Path):
    """Verify folder watch creation, pause/resume, and event loop guards."""
    watch_dir = tmp_path / "watched_folder"
    watch_dir.mkdir()
    path_service.add_approved_root(str(watch_dir), "Watched Folder")

    # Add watch with fast debounce for testing
    watch = folder_watcher_service.add_watch(str(watch_dir), recursive=True, debounce_seconds=0.6)
    watch_id = watch["id"]
    assert watch["folder_path"] == str(watch_dir.resolve())

    # Verify listed
    watches = folder_watcher_service.list_watches()
    assert any(w["id"] == watch_id for w in watches)

    # Pause watch
    paused = folder_watcher_service.pause_watch(watch_id)
    assert paused["status"] == "paused"

    # Resume watch
    resumed = folder_watcher_service.resume_watch(watch_id)
    assert resumed["status"] == "active"

    # Test file drop and task creation
    test_file = watch_dir / "invoice_received.txt"
    test_file.write_text("Invoice #9991 Total: $400", encoding="utf-8")

    # Wait for debounce worker
    time.sleep(1.5)

    # Verify task was created by LazyDesk handler
    tasks = task_queue.list_tasks(status_filter="succeeded", limit=10)
    matching_tasks = [t for t in tasks if t.get("metadata", {}).get("file") == str(test_file.resolve())]
    assert len(matching_tasks) >= 1

    # Loop prevention test: files in internal category folders or temp files must NOT generate new tasks
    initial_task_count = len(task_queue.list_tasks(limit=100))

    internal_cat_dir = watch_dir / "Invoices & Receipts"
    internal_cat_dir.mkdir(exist_ok=True)
    internal_file = internal_cat_dir / "sub_invoice.txt"
    internal_file.write_text("Internal category file", encoding="utf-8")

    temp_file = watch_dir / "temp_file.tmp"
    temp_file.write_text("Temporary file", encoding="utf-8")

    time.sleep(1.2)
    after_task_count = len(task_queue.list_tasks(limit=100))
    # Should not have created any new tasks for internal or temp files
    assert after_task_count == initial_task_count

    # Cleanup watch
    removed = folder_watcher_service.remove_watch(watch_id)
    assert removed is True


def test_tasks_and_watcher_api(client, tmp_path: Path):
    """Test HTTP API endpoints for tasks and folder watches."""
    api_watch_dir = tmp_path / "api_watched"
    api_watch_dir.mkdir()
    path_service.add_approved_root(str(api_watch_dir), "API Watched")

    # 1. Add watch via API
    add_resp = client.post(
        "/api/watcher/watches",
        json={"folder_path": str(api_watch_dir), "debounce_seconds": 1.0}
    )
    assert add_resp.status_code == status.HTTP_201_CREATED
    watch_id = add_resp.json()["id"]

    # 2. List watches
    list_resp = client.get("/api/watcher/watches")
    assert list_resp.status_code == status.HTTP_200_OK
    assert any(w["id"] == watch_id for w in list_resp.json())

    # 3. Pause via API
    pause_resp = client.post(f"/api/watcher/watches/{watch_id}/pause")
    assert pause_resp.status_code == status.HTTP_200_OK

    # 4. Resume via API
    resume_resp = client.post(f"/api/watcher/watches/{watch_id}/resume")
    assert resume_resp.status_code == status.HTTP_200_OK

    # 5. List tasks via API
    tasks_resp = client.get("/api/tasks")
    assert tasks_resp.status_code == status.HTTP_200_OK
    assert isinstance(tasks_resp.json(), list)

    # 6. Delete watch via API
    del_resp = client.delete(f"/api/watcher/watches/{watch_id}")
    assert del_resp.status_code == status.HTTP_200_OK
