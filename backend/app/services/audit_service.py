from datetime import datetime, timezone
import logging
from backend.app.db.session import get_db

logger = logging.getLogger("slothpilot.audit")


class AuditService:
    """Service managing append-only, tamper-evident audit logs."""

    @staticmethod
    def log(
        action: str,
        module: str,
        actor: str,
        details: str,
        target_hash: str | None = None,
        success: bool = True
    ) -> int:
        """Insert a new audit record into the immutable audit_logs table."""
        now_utc = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            cursor = conn.execute(
                """
                INSERT INTO audit_logs (timestamp, action, module, actor, details, target_hash, success)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (now_utc, action, module, actor, details, target_hash, 1 if success else 0)
            )
            log_id = cursor.lastrowid or 0

        logger.info(
            "Audit [%s] module=%s action=%s success=%s target=%s",
            now_utc, module, action, success, (target_hash[:8] if target_hash else "none")
        )
        return log_id

    @staticmethod
    def get_logs(
        module: str | None = None,
        limit: int = 50,
        offset: int = 0
    ) -> list[dict]:
        """Fetch paginated audit log entries ordered by most recent first."""
        with get_db() as conn:
            if module:
                rows = conn.execute(
                    """
                    SELECT id, timestamp, action, module, actor, details, target_hash, success
                    FROM audit_logs
                    WHERE module = ?
                    ORDER BY id DESC
                    LIMIT ? OFFSET ?
                    """,
                    (module, limit, offset)
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT id, timestamp, action, module, actor, details, target_hash, success
                    FROM audit_logs
                    ORDER BY id DESC
                    LIMIT ? OFFSET ?
                    """,
                    (limit, offset)
                ).fetchall()

        return [dict(row) for row in rows]

    @staticmethod
    def count_logs(module: str | None = None) -> int:
        """Return total count of audit log entries."""
        with get_db() as conn:
            if module:
                row = conn.execute(
                    "SELECT COUNT(*) as count FROM audit_logs WHERE module = ?",
                    (module,)
                ).fetchone()
            else:
                row = conn.execute("SELECT COUNT(*) as count FROM audit_logs").fetchone()
        return row["count"] if row else 0


audit_service = AuditService()
