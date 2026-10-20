"""TradeSloth Auditor Router.

Provides endpoints to trigger multi-document shipment audits, retrieve findings,
and export compliance discrepancy reports.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from backend.app.services.tradesloth_service import TradeSlothService

router = APIRouter(prefix="/api/tradesloth", tags=["TradeSloth Document Auditor"])


class AuditRequest(BaseModel):
    document_paths: List[str] = Field(..., min_length=1, description="List of file paths within approved roots")
    title: Optional[str] = Field(None, description="Optional custom title for the audit")


@router.post("/audit")
def run_shipment_audit(req: AuditRequest):
    """Audits multiple shipment documents for discrepancies in reference numbers, quantities, weights, and money."""
    try:
        return TradeSlothService.audit_documents(req.document_paths, req.title)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audit failed: {str(e)}")


@router.get("/audits")
def list_audits():
    """Lists all completed shipment audits."""
    return TradeSlothService.list_audits()


@router.get("/audits/{audit_id}")
def get_audit(audit_id: str):
    """Retrieves a specific shipment audit by ID with detailed discrepancy findings."""
    audit = TradeSlothService.get_audit(audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found.")
    return audit


@router.get("/audits/{audit_id}/report")
def export_audit_report(audit_id: str):
    """Exports an audit report in Markdown format with source evidence and legal disclaimers."""
    try:
        md_content = TradeSlothService.export_report_markdown(audit_id)
        return Response(content=md_content, media_type="text/markdown")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
