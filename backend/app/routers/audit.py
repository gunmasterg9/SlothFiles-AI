from fastapi import APIRouter, Query
from pydantic import BaseModel

from backend.app.services.audit_service import audit_service

router = APIRouter(prefix="/api/audit", tags=["Audit"])


class AuditLogItem(BaseModel):
    id: int
    timestamp: str
    action: str
    module: str
    actor: str
    details: str
    target_hash: str | None
    success: int


class AuditLogResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[AuditLogItem]


@router.get("", response_model=AuditLogResponse)
async def get_audit_logs(
    module: str | None = Query(default=None, description="Filter by module"),
    limit: int = Query(default=50, ge=1, le=500, description="Page limit"),
    offset: int = Query(default=0, ge=0, description="Page offset")
):
    """Retrieve immutable audit history entries."""
    items = audit_service.get_logs(module=module, limit=limit, offset=offset)
    total = audit_service.count_logs(module=module)
    return AuditLogResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=items
    )
