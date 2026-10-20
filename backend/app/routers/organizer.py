from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from backend.app.services.file_organizer import file_organizer_service
from backend.app.services.approval_service import approval_service
from backend.app.services.rules_engine import (
    rules_engine_service,
    RuleCreate,
    RuleUpdate,
    RuleTestRequest,
    TemplatePreviewRequest
)

router = APIRouter(prefix="/api/organizer", tags=["File Organizer"])


class ScanFolderRequest(BaseModel):
    folder_path: str = Field(..., description="Target approved folder path to scan")
    use_ai: bool = Field(default=True, description="Use local Ollama for categorization if available")


@router.post("/scan")
async def scan_folder(req: ScanFolderRequest):
    """Scan approved directory, detect exact duplicates, and construct action plan."""
    try:
        return await file_organizer_service.scan_and_plan(
            raw_folder_path=req.folder_path,
            use_ai=req.use_ai
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc)
        ) from exc


@router.get("/plans")
async def list_organizer_plans():
    """List recent plans prepared by the organizer module."""
    pending = approval_service.get_pending_plans()
    return [p for p in pending if p.get("module") == "organizer"]


# =========================================================================
# Organization Rules Endpoints
# =========================================================================

@router.get("/rules")
async def list_organization_rules(
    only_enabled: bool = Query(default=False, description="Filter for only active enabled rules")
):
    """List all organization rules ordered by priority ASC, created_at ASC."""
    return rules_engine_service.list_rules(only_enabled=only_enabled)


@router.post("/rules", status_code=status.HTTP_201_CREATED)
async def create_organization_rule(rule_in: RuleCreate):
    """Create a new user-configured organization rule with validated templates."""
    try:
        return rules_engine_service.create_rule(rule_in)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/rules/{rule_id}")
async def get_organization_rule(rule_id: str):
    """Retrieve an organization rule by ID."""
    return rules_engine_service.get_rule(rule_id)


@router.put("/rules/{rule_id}")
async def update_organization_rule(rule_id: str, rule_in: RuleUpdate):
    """Update an organization rule."""
    try:
        return rules_engine_service.update_rule(rule_id, rule_in)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/rules/{rule_id}")
async def delete_organization_rule(rule_id: str):
    """Delete an organization rule."""
    return rules_engine_service.delete_rule(rule_id)


@router.post("/rules/{rule_id}/toggle")
async def toggle_organization_rule(rule_id: str):
    """Toggle a rule's enabled/disabled status."""
    return rules_engine_service.toggle_rule(rule_id)


@router.post("/rules/test")
async def test_organization_rule(req: RuleTestRequest):
    """Test matching criteria and template destination resolution against a sample filename."""
    try:
        return rules_engine_service.test_rule(req)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


# =========================================================================
# Templates Reference and Preview Endpoints
# =========================================================================

@router.get("/templates")
async def list_template_variables():
    """Return available template variables and their documented semantics."""
    return {
        "variables": rules_engine_service.get_template_variables_info(),
        "example_templates": [
            "Invoices & Receipts/{year}/{month}/{stem}.{extension}",
            "Contracts & Legal/{year}/{stem}.{extension}",
            "Code & Data/{extension}/{stem}.{extension}",
            "Media & Assets/{year}/{month}/{stem}.{extension}",
            "Archives/{year}/{stem}.{extension}"
        ]
    }


@router.post("/templates/preview")
async def preview_template(req: TemplatePreviewRequest):
    """Preview destination path resolution for a template and sample filename."""
    try:
        resolved = rules_engine_service.resolve_template(
            template=req.template,
            filename=req.sample_filename,
            category=req.category
        )
        return {
            "template": req.template,
            "sample_filename": req.sample_filename,
            "resolved_destination": resolved
        }
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
