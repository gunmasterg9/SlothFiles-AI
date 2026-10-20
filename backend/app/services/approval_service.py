from datetime import datetime, timezone
import hashlib
import json
import logging
import os
from pathlib import Path
import shutil
import uuid
from fastapi import HTTPException, status

from backend.app.db.session import get_db
from backend.app.services.audit_service import audit_service
from backend.app.services.path_service import path_service

logger = logging.getLogger("slothpilot.approvals")


def compute_file_sha256(path: Path) -> str:
    """Compute SHA-256 hash of a file efficiently using streaming chunks."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


class ApprovalService:
    """Manages consequential action plans, preconditions revalidation, and rollback."""

    @staticmethod
    def create_plan(
        title: str,
        description: str,
        module: str,
        items: list[dict]
    ) -> dict:
        """Create a new action plan with calculated file hashes for approval gating."""
        plan_id = str(uuid.uuid4())
        now_utc = datetime.now(timezone.utc).isoformat()

        # Precompute hashes and validate paths
        hashes_combined = ""
        validated_items = []

        for item in items:
            item_id = str(uuid.uuid4())
            src_path = Path(item["source_path"]).resolve()
            tgt_path = Path(item["target_path"]).resolve()

            # Validate paths are in approved roots
            path_service.validate_path(src_path)
            path_service.validate_path(tgt_path.parent, allow_missing=True)

            # Compute exact source hash
            file_hash = compute_file_sha256(src_path) if src_path.exists() else "missing"
            hashes_combined += f"{src_path}:{file_hash};"

            validated_items.append((
                item_id,
                plan_id,
                item.get("action_type", "move"),
                str(src_path),
                str(tgt_path),
                file_hash,
                item.get("risk_level", "low"),
                item.get("reason", "Automated organization plan")
            ))

        revalidation_hash = hashlib.sha256(hashes_combined.encode("utf-8")).hexdigest()

        with get_db() as conn:
            # 1. Insert parent action_plans row first
            conn.execute(
                """
                INSERT INTO action_plans (
                    id, title, description, module, status, created_at, revalidation_hash
                )
                VALUES (?, ?, ?, ?, 'pending', ?, ?)
                """,
                (plan_id, title, description, module, now_utc, revalidation_hash)
            )

            # 2. Insert child action_items
            for v_item in validated_items:
                conn.execute(
                    """
                    INSERT INTO action_items (
                        id, plan_id, action_type, source_path, target_path,
                        source_hash, risk_level, reason, status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                    """,
                    v_item
                )

        audit_service.log(
            action="PLAN_CREATED",
            module=module,
            actor="system",
            details=f"Created plan '{title}' with {len(items)} items",
            target_hash=revalidation_hash,
            success=True
        )

        return ApprovalService.get_plan(plan_id)

    @staticmethod
    def get_plan(plan_id: str) -> dict:
        with get_db() as conn:
            plan_row = conn.execute(
                "SELECT * FROM action_plans WHERE id = ?",
                (plan_id,)
            ).fetchone()
            if not plan_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Action plan not found: {plan_id}"
                )

            item_rows = conn.execute(
                "SELECT * FROM action_items WHERE plan_id = ?",
                (plan_id,)
            ).fetchall()

        plan = dict(plan_row)
        plan["items"] = [dict(r) for r in item_rows]
        return plan

    @staticmethod
    def get_pending_plans() -> list[dict]:
        with get_db() as conn:
            plan_rows = conn.execute(
                "SELECT * FROM action_plans WHERE status = 'pending' ORDER BY created_at DESC"
            ).fetchall()

        plans = []
        for pr in plan_rows:
            p = dict(pr)
            with get_db() as conn:
                item_rows = conn.execute(
                    "SELECT * FROM action_items WHERE plan_id = ?",
                    (p["id"],)
                ).fetchall()
            p["items"] = [dict(r) for r in item_rows]
            plans.append(p)
        return plans

    @staticmethod
    def reject_plan(plan_id: str) -> dict:
        """Reject proposed plan. Makes ZERO filesystem changes."""
        plan = ApprovalService.get_plan(plan_id)
        if plan["status"] != "pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot reject plan with status '{plan['status']}'."
            )

        with get_db() as conn:
            conn.execute(
                "UPDATE action_plans SET status = 'rejected' WHERE id = ?",
                (plan_id,)
            )
            conn.execute(
                "UPDATE action_items SET status = 'rejected' WHERE plan_id = ?",
                (plan_id,)
            )

        audit_service.log(
            action="PLAN_REJECTED",
            module=plan["module"],
            actor="user",
            details=f"User rejected plan '{plan['title']}'. 0 filesystem modifications made.",
            success=True
        )
        return ApprovalService.get_plan(plan_id)

    @staticmethod
    def approve_and_execute(plan_id: str) -> dict:
        """
        Revalidate preconditions strictly (source existence, SHA-256 match,
        collision freedom, root boundary) and execute approved operations safely.
        """
        plan = ApprovalService.get_plan(plan_id)
        if plan["status"] != "pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Plan cannot be approved; current status is '{plan['status']}'."
            )

        items = plan["items"]
        if not items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Action plan contains no items to execute."
            )

        # PRECONDITION REVALIDATION STEP
        for item in items:
            src = Path(item["source_path"])
            tgt = Path(item["target_path"])

            # 1. Source must exist
            if not src.exists():
                audit_service.log(
                    action="EXECUTION_ABORTED_SOURCE_MISSING",
                    module=plan["module"],
                    actor="system",
                    details=f"Source file disappeared: {src.name}",
                    success=False
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Precondition failed: Source file '{src.name}' no longer exists."
                )

            # 2. Source file must NOT have changed since preview
            current_hash = compute_file_sha256(src)
            if current_hash != item["source_hash"]:
                audit_service.log(
                    action="EXECUTION_ABORTED_FILE_MODIFIED",
                    module=plan["module"],
                    actor="system",
                    details=f"Source file '{src.name}' was modified after plan creation.",
                    target_hash=current_hash,
                    success=False
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Precondition failed: File '{src.name}' was modified after plan creation. Aborting."
                )

            # 3. Target file must NOT exist (No silent overwrites)
            if tgt.exists():
                audit_service.log(
                    action="EXECUTION_ABORTED_COLLISION",
                    module=plan["module"],
                    actor="system",
                    details=f"Destination collision detected: {tgt.name}",
                    success=False
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Precondition failed: Destination '{tgt.name}' already exists. Overwrites blocked."
                )

            # 4. Target parent must be in approved roots
            path_service.validate_path(tgt.parent, allow_missing=True)

        # EXECUTION STEP
        now_utc = datetime.now(timezone.utc).isoformat()
        executed_items = []

        with get_db() as conn:
            for item in items:
                src = Path(item["source_path"])
                tgt = Path(item["target_path"])

                tgt.parent.mkdir(parents=True, exist_ok=True)
                # Move safely
                shutil.move(str(src), str(tgt))

                undo_data = json.dumps({
                    "original_source": str(src),
                    "moved_target": str(tgt),
                    "file_hash": item["source_hash"]
                })

                conn.execute(
                    """
                    UPDATE action_items SET
                        status = 'executed',
                        executed_at = ?,
                        undo_data_json = ?
                    WHERE id = ?
                    """,
                    (now_utc, undo_data, item["id"])
                )
                executed_items.append(item["id"])

            conn.execute(
                """
                UPDATE action_plans SET
                    status = 'completed',
                    approved_at = ?,
                    executed_at = ?
                WHERE id = ?
                """,
                (now_utc, now_utc, plan_id)
            )

        audit_service.log(
            action="PLAN_EXECUTED",
            module=plan["module"],
            actor="user",
            details=f"Successfully executed plan '{plan['title']}' ({len(executed_items)} files moved).",
            success=True
        )

        return ApprovalService.get_plan(plan_id)

    @staticmethod
    def undo_plan(plan_id: str) -> dict:
        """Safely restore moved files to their original locations."""
        plan = ApprovalService.get_plan(plan_id)
        if plan["status"] != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot undo plan with status '{plan['status']}'. Only completed plans can be rolled back."
            )

        items = plan["items"]
        undone_count = 0

        # Rollback in reverse order
        with get_db() as conn:
            for item in reversed(items):
                if item["status"] != "executed" or not item["undo_data_json"]:
                    continue

                undo_info = json.loads(item["undo_data_json"])
                curr_loc = Path(undo_info["moved_target"])
                orig_loc = Path(undo_info["original_source"])

                if not curr_loc.exists():
                    logger.warning("Undo: File not found at moved target %s", curr_loc)
                    continue

                if orig_loc.exists():
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Cannot undo: original location '{orig_loc.name}' is now occupied."
                    )

                orig_loc.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(curr_loc), str(orig_loc))

                conn.execute(
                    "UPDATE action_items SET status = 'undone' WHERE id = ?",
                    (item["id"],)
                )
                undone_count += 1

            conn.execute(
                "UPDATE action_plans SET status = 'undone' WHERE id = ?",
                (plan_id,)
            )

        audit_service.log(
            action="PLAN_UNDONE",
            module=plan["module"],
            actor="user",
            details=f"Rolled back {undone_count} file operations for plan '{plan['title']}'.",
            success=True
        )

        return ApprovalService.get_plan(plan_id)


approval_service = ApprovalService()
