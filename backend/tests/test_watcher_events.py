"""Comprehensive tests for real-time file watcher events.

Validates event interception for additions, modifications, renames, deletions,
directory events, debouncing bursts, duplicate suppression, loop prevention,
multi-folder isolation, shutdown cleanup, and API pagination.
"""

from pathlib import Path
import time
import uuid
import pytest
from fastapi import HTTPException, status

from backend.app.services.path_service import path_service
from backend.app.services.folder_watcher import folder_watcher_service


@pytest.fixture(autouse=True)
def clean_watcher_events():
    """Ensure in-memory watcher events are cleared before and after each test."""
    folder_watcher_service.clear_events()
    yield
    folder_watcher_service.clear_events()


def test_file_creation_event(tmp_path: Path):
    """Verify that creating a file produces a normalized 'created' event with metadata."""
    watch_dir = tmp_path / "watch_created"
    watch_dir.mkdir(parents=True, exist_ok=True)
    path_service.add_approved_root(str(watch_dir), "Watch Created")

    watch = folder_watcher_service.add_watch(str(watch_dir), recursive=True, debounce_seconds=0.5)
    watch_id = watch["id"]

    try:
        sample_file = watch_dir / "document_report.txt"
        sample_file.write_text("Quarterly financial report content", encoding="utf-8")

        time.sleep(1.2)

        resp = folder_watcher_service.get_recent_events(watch_id=watch_id, event_type="created")
        assert resp["total"] >= 1
        created_event = next((e for e in resp["events"] if "document_report.txt" in e["path"]), None)
        assert created_event is not None
        assert created_event["event_type"] == "created"
        assert created_event["relative_path"] == "document_report.txt"
        assert created_event["is_directory"] is False
        assert created_event["size_bytes"] is not None
        assert created_event["size_bytes"] > 0
    finally:
        folder_watcher_service.remove_watch(watch_id)


def test_file_modification_burst_debouncing(tmp_path: Path):
    """Verify that multiple rapid writes (bursts) within debounce interval produce 1 settled event."""
    watch_dir = tmp_path / "watch_mod"
    watch_dir.mkdir(parents=True, exist_ok=True)
    path_service.add_approved_root(str(watch_dir), "Watch Mod")

    watch = folder_watcher_service.add_watch(str(watch_dir), recursive=True, debounce_seconds=0.6)
    watch_id = watch["id"]

    try:
        target = watch_dir / "rapid_write.txt"
        target.write_text("initial content", encoding="utf-8")
        time.sleep(1.0)  # Wait for creation and initial write to settle

        # Clear events to strictly isolate and measure the upcoming burst writes
        folder_watcher_service.clear_events()

        # Rapidly write 5 times in quick succession (under 200ms total)
        for i in range(5):
            target.write_text(f"burst write iteration {i}", encoding="utf-8")
            time.sleep(0.04)

        # Wait for debounce timer (0.6s) to mature
        time.sleep(1.2)

        resp = folder_watcher_service.get_recent_events(watch_id=watch_id, event_type="modified")
        mod_events = [e for e in resp["events"] if "rapid_write.txt" in e["path"]]
        # Debouncing must compress the rapid 5 writes into a single settled modification event
        assert len(mod_events) == 1
        assert mod_events[0]["event_type"] == "modified"
        assert mod_events[0]["is_directory"] is False
    finally:
        folder_watcher_service.remove_watch(watch_id)


def test_file_rename_records_src_and_dest(tmp_path: Path):
    """Verify file rename produces a 'moved' event retaining both previous and new paths."""
    watch_dir = tmp_path / "watch_rename"
    watch_dir.mkdir(parents=True, exist_ok=True)
    path_service.add_approved_root(str(watch_dir), "Watch Rename")

    watch = folder_watcher_service.add_watch(str(watch_dir), recursive=True, debounce_seconds=0.5)
    watch_id = watch["id"]

    try:
        old_file = watch_dir / "source_draft.txt"
        old_file.write_text("Important draft text", encoding="utf-8")
        time.sleep(1.0)

        new_file = watch_dir / "final_report.txt"
        old_file.rename(new_file)
        time.sleep(1.0)

        resp = folder_watcher_service.get_recent_events(watch_id=watch_id, event_type="moved")
        assert resp["total"] >= 1
        moved_event = next((e for e in resp["events"] if "final_report.txt" in e["path"]), None)
        assert moved_event is not None
        assert moved_event["event_type"] == "moved"
        assert "source_draft.txt" in moved_event["previous_path"]
        assert "final_report.txt" in moved_event["path"]
        assert moved_event["previous_relative_path"] == "source_draft.txt"
        assert moved_event["relative_path"] == "final_report.txt"
        assert moved_event["is_directory"] is False
    finally:
        folder_watcher_service.remove_watch(watch_id)


def test_file_deletion_event(tmp_path: Path):
    """Verify that deleting a file records a 'deleted' event without attempting to open or stat it."""
    watch_dir = tmp_path / "watch_del"
    watch_dir.mkdir(parents=True, exist_ok=True)
    path_service.add_approved_root(str(watch_dir), "Watch Del")

    watch = folder_watcher_service.add_watch(str(watch_dir), recursive=True, debounce_seconds=0.5)
    watch_id = watch["id"]

    try:
        file_to_del = watch_dir / "obsolete.log"
        file_to_del.write_text("log data to delete", encoding="utf-8")
        time.sleep(1.0)

        file_to_del.unlink()
        time.sleep(1.0)

        resp = folder_watcher_service.get_recent_events(watch_id=watch_id, event_type="deleted")
        assert resp["total"] >= 1
        del_event = next((e for e in resp["events"] if "obsolete.log" in e["path"]), None)
        assert del_event is not None
        assert del_event["event_type"] == "deleted"
        assert del_event["relative_path"] == "obsolete.log"
        assert del_event["size_bytes"] is None  # Deleted files cannot and must not be stat'd
        assert del_event["is_directory"] is False
    finally:
        folder_watcher_service.remove_watch(watch_id)


def test_directory_events(tmp_path: Path):
    """Verify directory creation is marked with is_directory=True and handled properly."""
    watch_dir = tmp_path / "watch_dir"
    watch_dir.mkdir(parents=True, exist_ok=True)
    path_service.add_approved_root(str(watch_dir), "Watch Dir")

    watch = folder_watcher_service.add_watch(str(watch_dir), recursive=True, debounce_seconds=0.5)
    watch_id = watch["id"]

    try:
        subfolder = watch_dir / "projects"
        subfolder.mkdir()
        time.sleep(1.0)

        resp = folder_watcher_service.get_recent_events(watch_id=watch_id)
        dir_event = next((e for e in resp["events"] if "projects" in e["path"]), None)
        assert dir_event is not None
        assert dir_event["is_directory"] is True
        assert dir_event["relative_path"] == "projects"
    finally:
        folder_watcher_service.remove_watch(watch_id)


def test_duplicate_event_suppression():
    """Verify rapid identical event calls within 0.5s are deduplicated."""
    event_data = {
        "id": str(uuid.uuid4()),
        "watch_id": "test_watch_dup",
        "folder_path": "C:\\fake\\path",
        "event_type": "created",
        "path": "C:\\fake\\path\\file.txt",
        "relative_path": "file.txt",
        "previous_path": None,
        "previous_relative_path": None,
        "is_directory": False,
        "timestamp": "2026-10-20T12:00:00.000000+00:00",
        "size_bytes": 100,
        "suggestion": None
    }

    # Record first event
    folder_watcher_service.record_event(event_data)

    # Immediately attempt identical event with 10ms offset
    dup_event = dict(event_data)
    dup_event["id"] = str(uuid.uuid4())
    dup_event["timestamp"] = "2026-10-20T12:00:00.010000+00:00"
    folder_watcher_service.record_event(dup_event)

    events = folder_watcher_service.get_recent_events(watch_id="test_watch_dup")
    assert events["total"] == 1


def test_multiple_watched_folders(tmp_path: Path):
    """Verify events across independent watched folders are segregated by watch_id."""
    dir_a = tmp_path / "folder_alpha"
    dir_b = tmp_path / "folder_beta"
    dir_a.mkdir(parents=True, exist_ok=True)
    dir_b.mkdir(parents=True, exist_ok=True)
    path_service.add_approved_root(str(dir_a), "Alpha")
    path_service.add_approved_root(str(dir_b), "Beta")

    watch_a = folder_watcher_service.add_watch(str(dir_a), recursive=True, debounce_seconds=0.5)
    watch_b = folder_watcher_service.add_watch(str(dir_b), recursive=True, debounce_seconds=0.5)

    try:
        (dir_a / "alpha_file.txt").write_text("alpha", encoding="utf-8")
        (dir_b / "beta_file.txt").write_text("beta", encoding="utf-8")
        time.sleep(1.2)

        events_a = folder_watcher_service.get_recent_events(watch_id=watch_a["id"])
        events_b = folder_watcher_service.get_recent_events(watch_id=watch_b["id"])

        assert any("alpha_file.txt" in e["path"] for e in events_a["events"])
        assert not any("beta_file.txt" in e["path"] for e in events_a["events"])

        assert any("beta_file.txt" in e["path"] for e in events_b["events"])
        assert not any("alpha_file.txt" in e["path"] for e in events_b["events"])
    finally:
        folder_watcher_service.remove_watch(watch_a["id"])
        folder_watcher_service.remove_watch(watch_b["id"])


def test_observer_shutdown_and_cleanup(tmp_path: Path):
    """Verify observer thread and debounce worker cleanly terminate on shutdown."""
    watch_dir = tmp_path / "watch_shutdown"
    watch_dir.mkdir(parents=True, exist_ok=True)
    path_service.add_approved_root(str(watch_dir), "Watch Shutdown")

    watch = folder_watcher_service.add_watch(str(watch_dir), recursive=False, debounce_seconds=1.0)
    assert watch["id"] in folder_watcher_service._observers

    folder_watcher_service.shutdown()
    assert len(folder_watcher_service._observers) == 0


def test_unauthorized_paths_and_traversal(tmp_path: Path):
    """Verify attempting to monitor an unapproved or traversal directory is rejected with 403."""
    unapproved = tmp_path / "unapproved_secret_dir"
    unapproved.mkdir(parents=True, exist_ok=True)

    with pytest.raises(HTTPException) as exc:
        folder_watcher_service.add_watch(str(unapproved))
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN

    with pytest.raises(HTTPException) as exc_trav:
        folder_watcher_service.add_watch(str(unapproved) + "/../other")
    assert exc_trav.value.status_code == status.HTTP_403_FORBIDDEN


def test_loop_prevention_for_organizer_subfolders(tmp_path: Path):
    """Verify files created inside internal category folders are ignored to prevent loops."""
    watch_dir = tmp_path / "watch_loop"
    watch_dir.mkdir(parents=True, exist_ok=True)
    path_service.add_approved_root(str(watch_dir), "Watch Loop")

    watch = folder_watcher_service.add_watch(str(watch_dir), recursive=True, debounce_seconds=0.5)
    watch_id = watch["id"]

    try:
        # Internal category folder
        internal_cat = watch_dir / "Invoices & Receipts"
        internal_cat.mkdir(exist_ok=True)

        internal_file = internal_cat / "invoice_nested.txt"
        internal_file.write_text("Nested invoice", encoding="utf-8")

        temp_file = watch_dir / "editor_swap.tmp"
        temp_file.write_text("Temporary swap file", encoding="utf-8")

        time.sleep(1.0)

        resp = folder_watcher_service.get_recent_events(watch_id=watch_id)
        assert not any("invoice_nested.txt" in e["path"] for e in resp["events"])
        assert not any("editor_swap.tmp" in e["path"] for e in resp["events"])
    finally:
        folder_watcher_service.remove_watch(watch_id)


def test_bounded_event_history_and_api(client):
    """Verify /api/watcher/events pagination, bounded size, and clearing endpoints."""
    # Seed 15 synthetic events
    for i in range(15):
        folder_watcher_service.record_event({
            "id": f"event_{i}",
            "watch_id": "watch_api_test",
            "folder_path": "C:\\fake\\api",
            "event_type": "created" if i % 2 == 0 else "modified",
            "path": f"C:\\fake\\api\\file_{i}.txt",
            "relative_path": f"file_{i}.txt",
            "previous_path": None,
            "previous_relative_path": None,
            "is_directory": False,
            "timestamp": f"2026-10-20T12:00:{i:02d}.000000+00:00",
            "size_bytes": 100 * i,
            "suggestion": None
        })

    # Page 1: limit 5, offset 0
    res_p1 = client.get("/api/watcher/events?limit=5&offset=0")
    assert res_p1.status_code == status.HTTP_200_OK
    data_p1 = res_p1.json()
    assert data_p1["total"] == 15
    assert len(data_p1["events"]) == 5
    assert data_p1["limit"] == 5
    assert data_p1["offset"] == 0

    # Page 2: limit 5, offset 5
    res_p2 = client.get("/api/watcher/events?limit=5&offset=5")
    assert res_p2.status_code == status.HTTP_200_OK
    data_p2 = res_p2.json()
    assert data_p2["offset"] == 5
    assert len(data_p2["events"]) == 5

    # Filter by event_type
    res_created = client.get("/api/watcher/events?event_type=created")
    assert res_created.status_code == status.HTTP_200_OK
    data_created = res_created.json()
    assert all(e["event_type"] == "created" for e in data_created["events"])

    # Clear events
    res_clear = client.post("/api/watcher/events/clear")
    assert res_clear.status_code == status.HTTP_200_OK

    res_empty = client.get("/api/watcher/events")
    assert res_empty.json()["total"] == 0
