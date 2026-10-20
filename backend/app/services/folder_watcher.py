import asyncio
from collections import deque
from datetime import datetime, timezone
import logging
import os
from pathlib import Path
import threading
import time
from typing import Dict, Any, List, Optional, Tuple
import uuid

from fastapi import HTTPException, status
from watchdog.events import FileSystemEventHandler, FileSystemEvent, FileSystemMovedEvent
from watchdog.observers import Observer

from backend.app.db.session import get_db
from backend.app.services.audit_service import audit_service
from backend.app.services.path_service import path_service
from backend.app.services.task_queue import task_queue
from backend.app.services.file_organizer import ALLOWLISTED_CATEGORIES, file_organizer_service
from backend.app.services.rules_engine import rules_engine_service

logger = logging.getLogger("slothpilot.lazydesk")


class LazyDeskFileHandler(FileSystemEventHandler):
    """Event handler capturing file creation, modification, rename/move, and deletion
    with debouncing, duplicate event suppression, and strict event-loop prevention."""

    def __init__(self, watch_id: str, folder_path: Path, debounce_seconds: float = 2.0):
        super().__init__()
        self.watch_id = watch_id
        self.folder_path = folder_path.resolve()
        self.debounce_seconds = debounce_seconds
        # Maps abs_path_str -> (process_time: float, origin_type: str, previous_path: Optional[str])
        self._pending_events: Dict[str, Tuple[float, str, Optional[str]]] = {}
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._worker_thread = threading.Thread(target=self._debounce_worker, daemon=True)
        self._worker_thread.start()

    def should_ignore(self, file_path: Path | str) -> bool:
        """Filter out temp files, internal category directories, and hidden artifacts."""
        try:
            p = Path(file_path)
            name = p.name
        except Exception:
            return True

        if not name:
            return True

        # Hidden, office lock files, temp files, and system artifacts
        if (
            name.startswith(".")
            or name.startswith("~$")
            or name.endswith(".tmp")
            or name.endswith(".crdownload")
            or name.endswith(".swp")
            or name.endswith(".swo")
            or name == "Thumbs.db"
            or name.lower() == "desktop.ini"
        ):
            return True

        # Loop prevention: Ignore anything inside category subdirectories created by the application
        try:
            rel = p.resolve().relative_to(self.folder_path)
            parts = rel.parts
            if len(parts) > 1 and parts[0] in ALLOWLISTED_CATEGORIES:
                return True
        except (ValueError, RuntimeError):
            # Outside of watched folder
            return False

        return False

    def _safe_paths(self, raw_path: str | Path) -> Tuple[str, str]:
        """Safely normalize and compute absolute and relative paths without throwing exceptions."""
        try:
            p = Path(raw_path)
            resolved = p.resolve(strict=False)
            abs_str = str(resolved)
        except Exception:
            abs_str = str(raw_path)

        try:
            rel_str = str(Path(abs_str).relative_to(self.folder_path))
        except (ValueError, RuntimeError):
            rel_str = Path(raw_path).name

        return abs_str, rel_str

    def _is_paused(self) -> bool:
        """Check database whether this watch is currently paused."""
        try:
            with get_db() as conn:
                row = conn.execute(
                    "SELECT is_paused FROM folder_watches WHERE id = ?",
                    (self.watch_id,)
                ).fetchone()
                return bool(row and row["is_paused"])
        except Exception:
            return False

    def on_created(self, event: FileSystemEvent):
        if self.should_ignore(event.src_path):
            return
        if self._is_paused():
            return

        is_dir = event.is_directory
        abs_path, rel_path = self._safe_paths(event.src_path)

        # Record immediate created event to recent feed
        size_bytes = None
        if not is_dir and Path(abs_path).exists():
            try:
                size_bytes = Path(abs_path).stat().st_size
            except Exception:
                size_bytes = None

        folder_watcher_service.record_event({
            "id": str(uuid.uuid4()),
            "watch_id": self.watch_id,
            "folder_path": str(self.folder_path),
            "event_type": "created",
            "path": abs_path,
            "relative_path": rel_path,
            "previous_path": None,
            "previous_relative_path": None,
            "is_directory": is_dir,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "size_bytes": size_bytes,
            "suggestion": None
        })

        if not is_dir:
            # Enqueue for debounced settled processing & classification suggestion
            with self._lock:
                self._pending_events[abs_path] = (time.time() + self.debounce_seconds, "created", None)

    def on_modified(self, event: FileSystemEvent):
        if event.is_directory:
            # Directory modification events on Windows are high frequency folder timestamp touches; ignore
            return
        if self.should_ignore(event.src_path):
            return
        if self._is_paused():
            return

        abs_path, _ = self._safe_paths(event.src_path)

        # Debounce modification bursts: update process time deadline
        with self._lock:
            self._pending_events[abs_path] = (time.time() + self.debounce_seconds, "modified", None)

    def on_moved(self, event: FileSystemMovedEvent):
        src_ignored = self.should_ignore(event.src_path)
        dest_ignored = self.should_ignore(event.dest_path)
        if src_ignored and dest_ignored:
            return
        if self._is_paused():
            return

        is_dir = event.is_directory
        src_abs, src_rel = self._safe_paths(event.src_path)
        dest_abs, dest_rel = self._safe_paths(event.dest_path)

        # Cancel any pending debounced events for old path
        with self._lock:
            self._pending_events.pop(src_abs, None)

        size_bytes = None
        if not is_dir and Path(dest_abs).exists():
            try:
                size_bytes = Path(dest_abs).stat().st_size
            except Exception:
                size_bytes = None

        # Record moved event preserving exact source and destination paths
        folder_watcher_service.record_event({
            "id": str(uuid.uuid4()),
            "watch_id": self.watch_id,
            "folder_path": str(self.folder_path),
            "event_type": "moved",
            "path": dest_abs,
            "relative_path": dest_rel,
            "previous_path": src_abs,
            "previous_relative_path": src_rel,
            "is_directory": is_dir,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "size_bytes": size_bytes,
            "suggestion": None
        })

        # If file moved within watch and not ignored, schedule classification
        if not is_dir and not dest_ignored and Path(dest_abs).exists():
            with self._lock:
                self._pending_events[dest_abs] = (time.time() + self.debounce_seconds, "moved", src_abs)

    def on_deleted(self, event: FileSystemEvent):
        if self.should_ignore(event.src_path):
            return
        if self._is_paused():
            return

        is_dir = event.is_directory
        src_abs, src_rel = self._safe_paths(event.src_path)

        # Cancel any pending debounced events since the file is deleted
        with self._lock:
            self._pending_events.pop(src_abs, None)

        # Record deletion event safely. Do not open, stat, or hash non-existent file.
        folder_watcher_service.record_event({
            "id": str(uuid.uuid4()),
            "watch_id": self.watch_id,
            "folder_path": str(self.folder_path),
            "event_type": "deleted",
            "path": src_abs,
            "relative_path": src_rel,
            "previous_path": None,
            "previous_relative_path": None,
            "is_directory": is_dir,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "size_bytes": None,
            "suggestion": None
        })

    def _debounce_worker(self):
        while not self._stop_event.is_set():
            time.sleep(0.3)
            now = time.time()
            to_process: List[Tuple[str, str, Optional[str]]] = []

            with self._lock:
                for path_str, (proc_time, origin_type, prev_path) in list(self._pending_events.items()):
                    if now >= proc_time:
                        to_process.append((path_str, origin_type, prev_path))
                        del self._pending_events[path_str]

            for path_str, origin_type, prev_path in to_process:
                f_path = Path(path_str)
                if not f_path.exists() or self.should_ignore(f_path):
                    continue

                # If this was a debounced modification burst, emit the settled modified event
                if origin_type == "modified":
                    abs_path, rel_path = self._safe_paths(f_path)
                    try:
                        sz = f_path.stat().st_size
                    except Exception:
                        sz = None

                    folder_watcher_service.record_event({
                        "id": str(uuid.uuid4()),
                        "watch_id": self.watch_id,
                        "folder_path": str(self.folder_path),
                        "event_type": "modified",
                        "path": abs_path,
                        "relative_path": rel_path,
                        "previous_path": None,
                        "previous_relative_path": None,
                        "is_directory": False,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "size_bytes": sz,
                        "suggestion": None
                    })

                self._process_settled_file(f_path)

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

            # Run user organization rules or fallback to categorization
            rule_proposal = rules_engine_service.evaluate_file(file_path, self.folder_path)
            if rule_proposal:
                classification = {
                    "category": rule_proposal["rule_name"],
                    "suggested_filename": Path(rule_proposal["target_path"]).name,
                    "target_path": rule_proposal["target_path"],
                    "reason": rule_proposal["reason"],
                    "rule_id": rule_proposal["rule_id"],
                    "rule_name": rule_proposal["rule_name"],
                    "is_ai": False
                }
            else:
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

            # Attach suggestion to recent matching event in the in-memory feed
            folder_watcher_service.attach_suggestion(
                watch_id=self.watch_id,
                file_path=str(file_path.resolve()),
                suggestion=classification
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
    """Manages active folder watch observers on approved directory roots
    and maintains a bounded in-memory activity event stream."""

    def __init__(self):
        self._observers: Dict[str, tuple[Observer, LazyDeskFileHandler]] = {}
        # Bounded in-memory event feed (retained up to 1000 items)
        self._recent_events: deque = deque(maxlen=1000)
        self._events_lock = threading.Lock()

    def record_event(self, event_data: dict) -> dict:
        """Record a normalized file activity event with duplicate suppression."""
        with self._events_lock:
            if self._recent_events:
                last = self._recent_events[-1]
                # Check for rapid duplicate events within 0.5 seconds
                if (
                    last["watch_id"] == event_data["watch_id"]
                    and last["event_type"] == event_data["event_type"]
                    and last["path"] == event_data["path"]
                    and last["is_directory"] == event_data["is_directory"]
                ):
                    try:
                        last_dt = datetime.fromisoformat(last["timestamp"])
                        curr_dt = datetime.fromisoformat(event_data["timestamp"])
                        if (curr_dt - last_dt).total_seconds() < 0.5:
                            # Suppress rapid duplicate event
                            return last
                    except Exception:
                        pass

            self._recent_events.append(event_data)
            return event_data

    def attach_suggestion(self, watch_id: str, file_path: str, suggestion: dict):
        """Attach classification suggestion to recent events matching this file."""
        with self._events_lock:
            for ev in reversed(self._recent_events):
                if ev["watch_id"] == watch_id and ev["path"] == file_path:
                    ev["suggestion"] = suggestion
                    break

    def get_recent_events(
        self,
        watch_id: Optional[str] = None,
        event_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> dict:
        """Retrieve paginated recent file events in reverse chronological order.

        NOTE: This event feed is maintained in an in-memory buffer (bounded to 1,000 events)
        to deliver instant loopback responsiveness without disk I/O overhead.
        Consequential operations (approvals, moves, rollbacks) are stored permanently in SQLite audit_logs.
        """
        with self._events_lock:
            # Copy items in reverse chronological order
            filtered = list(reversed(self._recent_events))

            if watch_id:
                filtered = [e for e in filtered if e["watch_id"] == watch_id]
            if event_type:
                target_type = event_type.strip().lower()
                filtered = [e for e in filtered if e["event_type"] == target_type]

            total = len(filtered)
            paged = filtered[offset : offset + limit]

            return {
                "total": total,
                "events": paged,
                "limit": limit,
                "offset": offset
            }

    def clear_events(self):
        """Clear all in-memory events (useful for test isolation and dashboard resets)."""
        with self._events_lock:
            self._recent_events.clear()

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
                old_obs.join(timeout=2.0)
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
