from pathlib import Path
import sqlite3
import pytest
from backend.app.db.migrations import run_migrations
from backend.app.db.session import get_db
from backend.app.services.audit_service import audit_service


def test_migrations_idempotent(tmp_path: Path):
    """Verify migrations apply cleanly on an empty database and are idempotent."""
    fresh_db = tmp_path / "fresh" / "fresh.db"
    count1 = run_migrations(db_path=fresh_db)
    assert count1 >= 1

    # Rerunning should apply 0 additional migrations
    count2 = run_migrations(db_path=fresh_db)
    assert count2 == 0


def test_audit_logs_append_only_trigger():
    """Verify that SQLite triggers block UPDATE and DELETE on the audit_logs table."""
    log_id = audit_service.log(
        action="TEST_ACTION",
        module="test",
        actor="tester",
        details="Sample details",
        target_hash="abc123hash",
        success=True
    )
    assert log_id > 0

    with get_db() as conn:
        # Test UPDATE rejection
        with pytest.raises(sqlite3.DatabaseError) as exc_update:
            conn.execute("UPDATE audit_logs SET details = 'tampered' WHERE id = ?", (log_id,))
        assert "immutable" in str(exc_update.value).lower()

        # Test DELETE rejection
        with pytest.raises(sqlite3.DatabaseError) as exc_delete:
            conn.execute("DELETE FROM audit_logs WHERE id = ?", (log_id,))
        assert "immutable" in str(exc_delete.value).lower()


def test_audit_service_pagination():
    """Verify pagination and module filtering in audit service."""
    for i in range(5):
        audit_service.log(
            action=f"ACTION_{i}",
            module="module_a",
            actor="tester",
            details=f"Details {i}"
        )
    for i in range(3):
        audit_service.log(
            action=f"ACTION_{i}",
            module="module_b",
            actor="tester",
            details=f"Details {i}"
        )

    all_logs = audit_service.get_logs(limit=20)
    assert len(all_logs) >= 8

    module_b_logs = audit_service.get_logs(module="module_b")
    assert len(module_b_logs) == 3
    assert all(log["module"] == "module_b" for log in module_b_logs)
