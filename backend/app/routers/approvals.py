from fastapi import APIRouter, HTTPException, status
from backend.app.services.approval_service import approval_service

router = APIRouter(prefix="/api/approvals", tags=["Approvals"])


@router.get("/pending")
async def get_pending_plans():
    """Retrieve all pending action plans across all modules awaiting user review."""
    return approval_service.get_pending_plans()


@router.get("/{plan_id}")
async def get_plan(plan_id: str):
    """Retrieve details and action items for a specific plan."""
    return approval_service.get_plan(plan_id)


@router.post("/{plan_id}/approve")
async def approve_plan(plan_id: str):
    """Revalidate preconditions strictly and execute the approved action plan."""
    return approval_service.approve_and_execute(plan_id)


@router.post("/{plan_id}/reject")
async def reject_plan(plan_id: str):
    """Reject proposed plan. Leaves all files strictly untouched."""
    return approval_service.reject_plan(plan_id)


@router.post("/{plan_id}/undo")
async def undo_plan(plan_id: str):
    """Safely restore moved files to their original locations."""
    return approval_service.undo_plan(plan_id)
