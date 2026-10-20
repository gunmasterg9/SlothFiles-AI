from pathlib import Path
import pytest
from fastapi import status, HTTPException

from backend.app.services.path_service import path_service
from backend.app.services.file_organizer import file_organizer_service
from backend.app.services.approval_service import approval_service, compute_file_sha256


@pytest.mark.asyncio
async def test_duplicate_detection_and_scan(tmp_path: Path):
    """Verify SHA-256 duplicate detection and organization plan creation."""
    work_dir = tmp_path / "work"
    work_dir.mkdir()
    path_service.add_approved_root(str(work_dir), "Work Folder")

    # Create two identical files (exact duplicates)
    file1 = work_dir / "invoice_original.txt"
    file1.write_text("Invoice #1001 Total: $500", encoding="utf-8")

    file2 = work_dir / "invoice_copy.txt"
    file2.write_text("Invoice #1001 Total: $500", encoding="utf-8")

    # Create a distinct code file
    code_file = work_dir / "script.py"
    code_file.write_text("print('hello')", encoding="utf-8")

    result = await file_organizer_service.scan_and_plan(str(work_dir), use_ai=False)

    assert result["total_files"] == 3
    assert result["duplicates_found"] == 1
    assert result["actions_planned"] == 3

    plan = result["plan"]
    assert plan is not None
    assert plan["status"] == "pending"

    # Verify duplicate category assignment
    duplicate_items = [i for i in plan["items"] if "Duplicates" in i["target_path"]]
    assert len(duplicate_items) == 1
    assert "invoice_" in duplicate_items[0]["source_path"]


@pytest.mark.asyncio
async def test_rejection_leaves_files_untouched(tmp_path: Path):
    """Verify rejecting an action plan makes 0 filesystem changes."""
    work_dir = tmp_path / "work_reject"
    work_dir.mkdir()
    path_service.add_approved_root(str(work_dir), "Work Reject")

    file1 = work_dir / "report.txt"
    file1.write_text("Financial Report Q3", encoding="utf-8")

    result = await file_organizer_service.scan_and_plan(str(work_dir), use_ai=False)
    plan_id = result["plan"]["id"]

    # Reject plan
    rejected_plan = approval_service.reject_plan(plan_id)
    assert rejected_plan["status"] == "rejected"

    # File must still exist at original path
    assert file1.exists()


@pytest.mark.asyncio
async def test_execution_and_undo_lifecycle(tmp_path: Path):
    """Verify approving plan moves files, and undoing restores them."""
    work_dir = tmp_path / "work_exec"
    work_dir.mkdir()
    path_service.add_approved_root(str(work_dir), "Work Exec")

    file1 = work_dir / "invoice_client.txt"
    file1.write_text("Invoice from Acme Corp for consulting.", encoding="utf-8")
    original_hash = compute_file_sha256(file1)

    result = await file_organizer_service.scan_and_plan(str(work_dir), use_ai=False)
    plan_id = result["plan"]["id"]

    # Approve and execute
    executed_plan = approval_service.approve_and_execute(plan_id)
    assert executed_plan["status"] == "completed"

    # Original file should be moved
    assert not file1.exists()

    # Target file in Invoices & Receipts must exist
    item = executed_plan["items"][0]
    target_path = Path(item["target_path"])
    assert target_path.exists()
    assert compute_file_sha256(target_path) == original_hash

    # Now Undo the plan
    undone_plan = approval_service.undo_plan(plan_id)
    assert undone_plan["status"] == "undone"

    # Original file must be restored
    assert file1.exists()
    assert not target_path.exists()
    assert compute_file_sha256(file1) == original_hash


@pytest.mark.asyncio
async def test_modified_source_precondition_abort(tmp_path: Path):
    """Verify modifying source file after preview aborts approval with conflict."""
    work_dir = tmp_path / "work_race"
    work_dir.mkdir()
    path_service.add_approved_root(str(work_dir), "Work Race")

    file1 = work_dir / "statement.txt"
    file1.write_text("Initial text content", encoding="utf-8")

    result = await file_organizer_service.scan_and_plan(str(work_dir), use_ai=False)
    plan_id = result["plan"]["id"]

    # Tamper with file after plan was created
    file1.write_text("Tampered or modified content by user", encoding="utf-8")

    with pytest.raises(HTTPException) as exc:
        approval_service.approve_and_execute(plan_id)
    assert exc.value.status_code == status.HTTP_409_CONFLICT
    assert "modified after plan creation" in exc.value.detail.lower()


def test_organizer_and_approvals_api(client, tmp_path: Path):
    """Integration test via HTTP endpoints for scan, approve, and undo."""
    api_dir = tmp_path / "api_test_folder"
    api_dir.mkdir()
    path_service.add_approved_root(str(api_dir), "API Test Folder")

    doc = api_dir / "receipt.txt"
    doc.write_text("Receipt #8822 paid in full", encoding="utf-8")

    # 1. Scan folder via API
    scan_resp = client.post("/api/organizer/scan", json={"folder_path": str(api_dir), "use_ai": False})
    assert scan_resp.status_code == status.HTTP_200_OK
    data = scan_resp.json()
    assert data["total_files"] == 1
    plan_id = data["plan"]["id"]

    # 2. Check pending approvals API
    pending_resp = client.get("/api/approvals/pending")
    assert pending_resp.status_code == status.HTTP_200_OK
    pending_ids = [p["id"] for p in pending_resp.json()]
    assert plan_id in pending_ids

    # 3. Approve via API
    appr_resp = client.post(f"/api/approvals/{plan_id}/approve")
    assert appr_resp.status_code == status.HTTP_200_OK
    assert appr_resp.json()["status"] == "completed"

    # 4. Undo via API
    undo_resp = client.post(f"/api/approvals/{plan_id}/undo")
    assert undo_resp.status_code == status.HTTP_200_OK
    assert undo_resp.json()["status"] == "undone"
    assert doc.exists()
