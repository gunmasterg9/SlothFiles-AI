from datetime import datetime, timezone
import os
from pathlib import Path
import uuid
from fastapi import HTTPException, status

from backend.app.db.session import get_db
from backend.app.services.audit_service import audit_service


class PathSecurityViolation(HTTPException):
    def __init__(self, message: str):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=message
        )


class PathService:
    """Service strictly enforcing filesystem boundaries and approved roots."""

    @staticmethod
    def get_approved_roots() -> list[dict]:
        """Fetch all active approved root directories."""
        with get_db() as conn:
            rows = conn.execute(
                "SELECT id, path, label, is_active, created_at FROM approved_roots WHERE is_active = 1"
            ).fetchall()
        return [dict(row) for row in rows]

    @staticmethod
    def add_approved_root(raw_path: str, label: str) -> dict:
        """Register and approve a directory root after validation."""
        path = Path(raw_path).expanduser().resolve()
        if not path.exists():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Directory does not exist: {raw_path}"
            )
        if not path.is_dir():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target path is not a directory: {raw_path}"
            )

        canonical_path = str(path)
        root_id = str(uuid.uuid4())
        now_utc = datetime.now(timezone.utc).isoformat()

        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO approved_roots (id, path, label, is_active, created_at)
                VALUES (?, ?, ?, 1, ?)
                ON CONFLICT(path) DO UPDATE SET
                    label = excluded.label,
                    is_active = 1
                """,
                (root_id, canonical_path, label or path.name, now_utc)
            )

        audit_service.log(
            action="ADD_APPROVED_ROOT",
            module="security",
            actor="user",
            details=f"Approved root added: {canonical_path}",
            success=True
        )

        return {
            "id": root_id,
            "path": canonical_path,
            "label": label or path.name,
            "is_active": 1,
            "created_at": now_utc
        }

    @staticmethod
    def remove_approved_root(root_id: str) -> bool:
        """Deactivate an approved directory root."""
        with get_db() as conn:
            cursor = conn.execute(
                "UPDATE approved_roots SET is_active = 0 WHERE id = ?",
                (root_id,)
            )
            affected = cursor.rowcount > 0

        if affected:
            audit_service.log(
                action="REMOVE_APPROVED_ROOT",
                module="security",
                actor="user",
                details=f"Approved root deactivated: id={root_id}",
                success=True
            )
        return affected

    @classmethod
    def validate_path(cls, candidate: str | Path, allow_missing: bool = False) -> Path:
        """
        Verify that the candidate path is strictly located within an approved root.
        Re-resolves symlinks, normalizes Windows drive letters, and blocks traversal.
        """
        if not candidate:
            raise PathSecurityViolation("Path cannot be empty.")

        p = Path(candidate).expanduser()

        # Reject path traversal tokens explicitly
        str_val = str(candidate).replace("\\", "/")
        if "/../" in str_val or str_val.endswith("/..") or str_val.startswith("../"):
            audit_service.log(
                action="PATH_TRAVERSAL_BLOCKED",
                module="security",
                actor="system",
                details=f"Blocked traversal token in path: {candidate}",
                success=False
            )
            raise PathSecurityViolation("Path traversal using '..' is strictly prohibited.")

        # Reject UNC paths if not explicitly whitelisted
        if str(candidate).startswith("\\\\") or str_val.startswith("//"):
            audit_service.log(
                action="UNC_PATH_BLOCKED",
                module="security",
                actor="system",
                details=f"Blocked UNC path: {candidate}",
                success=False
            )
            raise PathSecurityViolation("UNC network paths are not allowed.")

        # Resolve to canonical absolute path
        try:
            resolved = p.resolve(strict=not allow_missing)
        except (FileNotFoundError, RuntimeError) as exc:
            if not allow_missing:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Path not found: {candidate}"
                ) from exc
            resolved = p.resolve(strict=False)

        approved_roots = cls.get_approved_roots()
        if not approved_roots:
            audit_service.log(
                action="NO_APPROVED_ROOTS",
                module="security",
                actor="system",
                details="Access denied: No approved root directories are registered.",
                success=False
            )
            raise PathSecurityViolation(
                "No approved root folders configured. Please approve a folder in Settings."
            )

        resolved_str = str(resolved).lower()

        # Check if resolved path is a subpath of any approved root
        is_allowed = False
        for root in approved_roots:
            root_path_str = str(Path(root["path"]).resolve()).lower()
            # Must either equal the root or start with root + os.sep
            if resolved_str == root_path_str or resolved_str.startswith(root_path_str + os.sep.lower()):
                is_allowed = True
                break

        if not is_allowed:
            audit_service.log(
                action="PATH_OUTSIDE_ROOT_BLOCKED",
                module="security",
                actor="system",
                details=f"Blocked path outside approved roots: {resolved}",
                success=False
            )
            raise PathSecurityViolation(
                f"Access denied: Target path '{resolved.name}' is outside approved directories."
            )

        return resolved


path_service = PathService()
