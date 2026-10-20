import hashlib
import os
from pathlib import Path
import sqlite3
import pytest
from fastapi import HTTPException, status
from httpx import ASGITransport, AsyncClient

from backend.app.main import app
from backend.app.db.session import get_db
from backend.app.services.path_service import path_service, PathSecurityViolation
from backend.app.services.approval_service import approval_service, compute_file_sha256
from backend.app.services.file_organizer import file_organizer_service
from backend.app.services.document_extractor import document_extractor
from backend.app.services.ai_service import ollama_service
from backend.app.services.tradesloth_service import TradeSlothService


@pytest.mark.asyncio
async def test_symlink_escape_blocked(tmp_path: Path):
    """
    Verify symlinks pointing outside approved roots are resolved and rejected.
    """
    approved_dir = tmp_path / "approved_dir"
    approved_dir.mkdir()
    path_service.add_approved_root(str(approved_dir), "Approved Dir")

    external_secret = tmp_path / "external_secret.txt"
    external_secret.write_text("SUPER_SECRET_TOKEN=xyz123", encoding="utf-8")

    symlink_path = approved_dir / "link_to_secret.txt"
    try:
        os.symlink(external_secret, symlink_path)
        # Attempt to validate the symlink inside approved_dir
        with pytest.raises(PathSecurityViolation) as exc:
            path_service.validate_path(str(symlink_path))
        assert "outside approved" in str(exc.value.detail).lower()
    except (OSError, NotImplementedError):
        # On Windows without Developer Mode, os.symlink requires elevation
        # Verify traversal equivalent is strictly blocked
        escape_path = str(approved_dir) + "/../external_secret.txt"
        with pytest.raises(PathSecurityViolation) as exc:
            path_service.validate_path(escape_path)
        assert "traversal" in str(exc.value.detail).lower()


def test_case_insensitive_path_resolution(tmp_path: Path):
    """
    On Windows, ensure case variation in paths does not cause false rejections or bypasses.
    """
    approved_dir = tmp_path / "CaseFolder"
    approved_dir.mkdir()
    path_service.add_approved_root(str(approved_dir), "Case Folder")

    test_file = approved_dir / "target.txt"
    test_file.write_text("Hello Case", encoding="utf-8")

    # Lowercase variant
    lower_path = str(test_file).lower()
    validated_lower = path_service.validate_path(lower_path)
    assert validated_lower.exists()

    # Uppercase variant
    upper_path = str(test_file).upper()
    # In Windows, drive letter and path resolving is case-preserving
    validated_upper = path_service.validate_path(upper_path)
    assert validated_upper.exists()


@pytest.mark.asyncio
async def test_destination_collision_aborts_execution(tmp_path: Path):
    """
    Verify that if a target file already exists, approval execution aborts safely
    without silently overwriting the target file.
    """
    work_dir = tmp_path / "work_collision"
    work_dir.mkdir()
    path_service.add_approved_root(str(work_dir), "Collision Work")

    src = work_dir / "source_file.txt"
    src.write_text("Source Content A", encoding="utf-8")

    result = await file_organizer_service.scan_and_plan(str(work_dir), use_ai=False)
    plan = result["plan"]
    assert plan is not None
    plan_id = plan["id"]

    # Pre-create the destination collision file before approval execution
    target_path = Path(plan["items"][0]["target_path"])
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text("Pre-existing destination content DO NOT OVERWRITE", encoding="utf-8")

    # Attempt to approve and execute -> must fail with 409 CONFLICT
    with pytest.raises(HTTPException) as exc:
        approval_service.approve_and_execute(plan_id)

    assert exc.value.status_code == status.HTTP_409_CONFLICT
    assert "already exists" in str(exc.value.detail).lower()

    # Destination file must NOT have been overwritten
    assert target_path.read_text(encoding="utf-8") == "Pre-existing destination content DO NOT OVERWRITE"
    # Source file must still exist untouched
    assert src.exists()


@pytest.mark.asyncio
async def test_stale_approval_tokens_rejected(tmp_path: Path):
    """
    Verify that approving an already executed or rejected plan is rejected with 400 Bad Request.
    """
    work_dir = tmp_path / "work_stale"
    work_dir.mkdir()
    path_service.add_approved_root(str(work_dir), "Stale Work")

    src = work_dir / "stale_test.txt"
    src.write_text("Stale check content", encoding="utf-8")

    result = await file_organizer_service.scan_and_plan(str(work_dir), use_ai=False)
    plan_id = result["plan"]["id"]

    # First execution succeeds
    approval_service.approve_and_execute(plan_id)

    # Second execution must fail (stale token)
    with pytest.raises(HTTPException) as exc:
        approval_service.approve_and_execute(plan_id)
    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "current status is 'completed'" in str(exc.value.detail)

    # Rejecting an already completed plan must also fail
    with pytest.raises(HTTPException) as exc2:
        approval_service.reject_plan(plan_id)
    assert exc2.value.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.asyncio
async def test_source_file_modified_race_condition(tmp_path: Path):
    """
    Verify that if a source file is modified after plan creation (SHA-256 change),
    precondition revalidation catches the change and aborts.
    """
    work_dir = tmp_path / "work_modified"
    work_dir.mkdir()
    path_service.add_approved_root(str(work_dir), "Modified Work")

    src = work_dir / "critical_doc.txt"
    src.write_text("Original State v1.0", encoding="utf-8")

    result = await file_organizer_service.scan_and_plan(str(work_dir), use_ai=False)
    plan_id = result["plan"]["id"]

    # Tamper with the source file
    src.write_text("Tampered State v2.0 - Attacker injected payload", encoding="utf-8")

    # Execution must abort
    with pytest.raises(HTTPException) as exc:
        approval_service.approve_and_execute(plan_id)

    assert exc.value.status_code == status.HTTP_409_CONFLICT
    assert "modified after plan creation" in str(exc.value.detail).lower()


def test_audit_log_tampering_impossible():
    """
    Verify that SQLite triggers block UPDATE and DELETE on audit_logs table,
    enforcing append-only immutability.
    """
    with get_db() as conn:
        # Fetch an existing audit row
        row = conn.execute("SELECT id FROM audit_logs LIMIT 1").fetchone()
        if row:
            log_id = row["id"]

            # Attempt UPDATE -> must fail
            with pytest.raises(sqlite3.IntegrityError) as exc_update:
                conn.execute(
                    "UPDATE audit_logs SET action = 'HACKED' WHERE id = ?",
                    (log_id,)
                )
            assert "append-only" in str(exc_update.value).lower()

            # Attempt DELETE -> must fail
            with pytest.raises(sqlite3.IntegrityError) as exc_delete:
                conn.execute(
                    "DELETE FROM audit_logs WHERE id = ?",
                    (log_id,)
                )
            assert "append-only" in str(exc_delete.value).lower()


@pytest.mark.asyncio
async def test_dns_rebinding_and_host_validation():
    """
    Verify that requests with unauthorized Host headers are rejected with 403 Forbidden.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        # Legitimate loopback request
        res_ok = await client.get("/api/health", headers={"Host": "127.0.0.1:8000"})
        assert res_ok.status_code == 200

        # Malicious Host header (DNS rebinding attack attempt)
        res_blocked = await client.get("/api/health", headers={"Host": "attacker-dns-rebind.com"})
        assert res_blocked.status_code == 403
        assert "untrusted host header" in res_blocked.json()["error"]["message"].lower()


@pytest.mark.asyncio
async def test_offline_verification_suite(tmp_path: Path):
    """
    Offline Verification (Section 19):
    1. Confirm local backend health and readiness.
    2. Confirm local Ollama discovery and model selection without external API calls.
    3. Scan a synthetic folder and verify exact duplicate detection.
    4. Approve a file action and verify audit trail.
    5. Verify deterministic TradeSloth document audit continues working completely offline.
    """
    # 1. Health check
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        health_res = await client.get("/api/health")
        assert health_res.status_code == 200
        assert health_res.json()["status"] == "ok"

    # 2. Ollama local runtime check
    conn_info = await ollama_service.check_connection()
    assert "connected" in conn_info
    assert "models" in conn_info

    # 3. Scan synthetic test folder offline
    offline_dir = tmp_path / "offline_workspace"
    offline_dir.mkdir()
    path_service.add_approved_root(str(offline_dir), "Offline Workspace")

    doc_a = offline_dir / "notes_a.txt"
    doc_a.write_text("Offline Notes Content 123", encoding="utf-8")

    doc_b = offline_dir / "notes_b.txt"
    doc_b.write_text("Offline Notes Content 123", encoding="utf-8")  # Exact duplicate

    scan_res = await file_organizer_service.scan_and_plan(str(offline_dir), use_ai=False)
    assert scan_res["total_files"] == 2
    assert scan_res["duplicates_found"] == 1
    assert scan_res["actions_planned"] == 2

    # 4. Prepare and approve file action offline
    plan = scan_res["plan"]
    assert plan is not None
    executed = approval_service.approve_and_execute(plan["id"])
    assert executed["status"] == "completed"

    # Confirm audit entry was recorded
    with get_db() as conn:
        audit_entry = conn.execute(
            "SELECT * FROM audit_logs WHERE action = 'PLAN_EXECUTED' ORDER BY id DESC LIMIT 1"
        ).fetchone()
        assert audit_entry is not None
        assert "2 files moved" in audit_entry["details"]

    # 5. Verify deterministic TradeSloth audit works 100% offline
    doc1 = offline_dir / "inv.txt"
    doc1.write_text("Invoice Number: INV-OFFLINE-99\nTotal: 5000.00 USD\nQuantity: 100 cartons\nGross Weight: 450.00 kg", encoding="utf-8")
    doc2 = offline_dir / "bl.txt"
    doc2.write_text("B/L: INV-OFFLINE-99\nTotal: 5000.00 USD\nQuantity: 95 cartons\nGross Weight: 450.00 kg", encoding="utf-8")

    audit_res = TradeSlothService.audit_documents([str(doc1), str(doc2)], "Offline Audit")
    assert audit_res["status"] == "discrepancies_found"
    assert audit_res["summary"]["discrepancies"] >= 1
