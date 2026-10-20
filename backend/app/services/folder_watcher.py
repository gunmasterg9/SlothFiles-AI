import asyncio
from datetime import datetime, timezone
import logging
import os
from pathlib import Path
import threading
import time
import uuid
from typing import Dict, Any

from fastapi import HTTPException, status
from watchdog.events import FileSystemEventHandler, FileSystemEvent
from watchdog.observers import Observer

from backend.app.db.session import get_db
from backend.app.services.audit_service import audit_service
from backend.app.services.path_service import path_service
from backend.app.services.task_queue import task_queue
from backend.app.services.file_organizer import ALLOWLISTED_CATEGORIES, file_organizer_service

logger = logging.getLogger("slothpilot.lazydesk")


class LazyDeskFileHandler(FileSystemEventHandler):
    """Event handler with debouncing and strict event-loop prevention."""

    def __init__(self, watch_id: str, folder_path: Path, debounce_seconds: float = 2.0):
        super().__init__()
        self.watch_id = watch_id
        self.folder_path = folder_path.resolve()
        self.debounce_seconds = debounce_seconds
        self._pending_events: Dict[str, float] = {}
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._worker_thread = threading.Thread(target=self._debounce_worker, daemon=True)
        self._worker_thread.start()

    def should_ignore(self, file_path: Path) -> bool:
        """Filter out temp files, internal category directories, and hidden artifacts."""
        name = file_path.name
        if name.startswith(".") or name.startswith("~$") or name.endswith(".tmp") or name == "Thumbs.db":
            return True

        # Loop prevention: Ignore anything inside category subdirectories created by the application
        try:
            rel = file_path.resolve().relative_to(self.folder_path)
            parts = rel.parts
            if len(parts) > 1 and parts[0] in ALLOWLISTED_CATEGORIES:
                return True
        except ValueError:
            return True

        return False

    def on_created(self, event: FileSystemEvent):
        if not event.is_directory:
            self._record_event(Path(event.src_path))

    def on_modified(self, event: FileSystemEvent):
        if not event.is_directory:
            self._record_event(Path(event.src_path))

    def _record_event(self, path: Path):
        if self.should_ignore(path):
            return

        with self._lock:
            # Check if this watch is currently paused
            with get_db() as conn:
                row = conn.execute(
                    "SELECT is_paused FROM folder_watches WHERE id = ?",
                    (self.watch_id,)
                ).fetchone()
                if row and row["is_paused"]:
                    return

            self._pending_events[str(path.resolve())] = time.time() + self.debounce_seconds

    def _debounce_worker(self):
        while not self._stop_event.is_set():
            time.sleep(0.5)
            now = time.time()
            to_process = []

            with self._lock:
                for path_str, process_time in list(self._pending_events.items()):
                    if now >= process_time:
                        to_process.append(path_str)
                        del self._pending_events[path_str]

            for path_str in to_process:
                self._process_settled_file(Path(path_str))

    def _process_settled_file(self, file_path: Path):
        """Process a settled file: wait for file lock release, create task and prepare suggested plan."""
        if not file_path.exists() or self.should_ignore(file_path):
            return

        # Retry with backoff for Windows file locks (e.g. browser still downloading)
        file_ready = False
        for attempt in range(3):
            try:
                with open(file_path, "rb") as f:
                    f.read(512)
                file_ready = True
                break
            except (IOError, PermissionError):
                time.sleep(0.5 * (attempt + 1))

        if not file_ready:
            logger.warning("LazyDesk: File %s locked by another process. Skipping.", file_path.name)
            return

        # Enqueue background task
        task = task_queue.create_task(
            task_type="lazydesk_file_event",
            message=f"New file detected: {file_path.name}",
            metadata={"folder": str(self.folder_path), "file": str(file_path)}
        )

        try:
            task_queue.transition(task["id"], "running", progress=0.2, message="Analyzing file...")

            # Run deterministic or AI classification to prepare suggestion
            classification = file_organizer_service._deterministic_classification(
                file_name=file_path.name,
                text=""
            )

            task_queue.transition(
                task["id"],
                "succeeded",
                progress=1.0,
                message=f"Prepared suggestion: Category '{classification['category']}'",
                extra_metadata={"suggestion": classification}
            )

            audit_service.log(
                action="LAZYDESK_EVENT_PROCESSED",
                module="lazydesk",
                actor="system",
                details=f"Detected and prepared suggestion for '{file_path.name}' -> {classification['category']}",
                success=True
            )
        except Exception as exc:
            logger.exception("LazyDesk task failed for %s: %s", file_path.name, exc)
            task_queue.transition(
                task["id"],
                "failed",
                error_message=str(exc)
            )

    def stop(self):
        self._stop_event.set()


class FolderWatcherService:
    """Manages active folder watch observers on approved directory roots."""

    def __init__(self):
        self._observers: Dict[str, tuple[Observer, LazyDeskFileHandler]] = {}

    def list_watches(self) -> list[dict]:
        with get_db() as conn:
            rows = conn.execute(
                "SELECT id, folder_path, is_paused, recursive, debounce_seconds, last_scan_at, created_at FROM folder_watches"
            ).fetchall()
        return [dict(r) for r in rows]

    def add_watch(
        self,
        raw_folder_path: str,
        recursive: bool = False,
        debounce_seconds: float = 2.0
    ) -> dict:
        """Register and start a folder watch within approved roots."""
        folder = path_service.validate_path(raw_folder_path)
        if not folder.is_dir():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Path is not a directory: {folder}"
            )

        canonical = str(folder)
        watch_id = str(uuid.uuid4())
        now_utc = datetime.now(timezone.utc).isoformat()

        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO folder_watches (id, folder_path, is_paused, recursive, debounce_seconds, created_at)
                VALUES (?, ?, 0, ?, ?, ?)
                ON CONFLICT(folder_path) DO UPDATE SET
                    is_paused = 0,
                    recursive = excluded.recursive
                """,
                (watch_id, canonical, 1 if recursive else 0, debounce_seconds, now_utc)
            )

        # Start watchdog observer
        self._start_observer(watch_id, folder, recursive, debounce_seconds)

        audit_service.log(
            action="WATCH_ADDED",
            module="lazydesk",
            actor="user",
            details=f"Started monitoring folder: {canonical}",
            success=True
        )

        return {
            "id": watch_id,
            "folder_path": canonical,
            "is_paused": 0,
            "recursive": 1 if recursive else 0,
            "debounce_seconds": debounce_seconds,
            "created_at": now_utc
        }

    def pause_watch(self, watch_id: str) -> dict:
        with get_db() as conn:
            conn.execute(
                "UPDATE folder_watches SET is_paused = 1 WHERE id = ?",
                (watch_id,)
            )
        audit_service.log(
            action="WATCH_PAUSED",
            module="lazydesk",
            actor="user",
            details=f"Paused watch {watch_id}",
            success=True
        )
        return {"status": "paused", "id": watch_id}

    def resume_watch(self, watch_id: str) -> dict:
        with get_db() as conn:
            conn.execute(
                "UPDATE folder_watches SET is_paused = 0 WHERE id = ?",
                (watch_id,)
            )
        audit_service.log(
            action="WATCH_RESUMED",
            module="lazydesk",
            actor="user",
            details=f"Resumed watch {watch_id}",
            success=True
        )
        return {"status": "active", "id": watch_id}

    def remove_watch(self, watch_id: str) -> bool:
        if watch_id in self._observers:
            obs, handler = self._observers.pop(watch_id)
            handler.stop()
            try:
                obs.stop()
                obs.join(timeout=2.0)
            except Exception:
                pass

        with get_db() as conn:
            cursor = conn.execute("DELETE FROM folder_watches WHERE id = ?", (watch_id,))
            affected = cursor.rowcount > 0

        if affected:
            audit_service.log(
                action="WATCH_REMOVED",
                module="lazydesk",
                actor="user",
                details=f"Removed watch {watch_id}",
                success=True
            )
        return affected

    def _start_observer(self, watch_id: str, folder: Path, recursive: bool, debounce_seconds: float):
        if watch_id in self._observers:
            old_obs, old_handler = self._observers.pop(watch_id)
            old_handler.stop()
            try:
                old_obs.stop()
            except Exception:
                pass

        handler = LazyDeskFileHandler(watch_id, folder, debounce_seconds)
        observer = Observer()
        observer.schedule(handler, str(folder), recursive=recursive)
        observer.daemon = True
        observer.start()
        self._observers[watch_id] = (observer, handler)

    def shutdown(self):
        """Stop all running observers."""
        for watch_id, (obs, handler) in list(self._observers.items()):
            handler.stop()
            try:
                obs.stop()
                obs.join(timeout=1.0)
            except Exception:
                pass
        self._observers.clear()


folder_watcher_service = FolderWatcherService()
