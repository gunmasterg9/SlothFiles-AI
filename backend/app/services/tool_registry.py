"""Tool Registry for Local AI Copilot.

Enforces strict Pydantic parameter schemas, explicit per-tool permissions (READ_ONLY vs PROPOSE_PLAN),
and restricts language models from direct execution of arbitrary actions.
Any action that modifies the filesystem or system state MUST route through the approval queue.
"""

from enum import Enum
import json
import logging
from typing import Any, Callable, Dict, List, Optional
from pydantic import BaseModel, Field, ValidationError

from backend.app.services.path_service import path_service
from backend.app.services.file_organizer import file_organizer_service
from backend.app.services.tradesloth_service import TradeSlothService
from backend.app.services.task_queue import task_queue
from backend.app.services.ai_service import ollama_service

logger = logging.getLogger("slothpilot.copilot.tools")


class ToolPermission(str, Enum):
    READ_ONLY = "read_only"
    PROPOSE_PLAN = "propose_plan"  # Requires approval queue creation; cannot directly execute


class ToolDefinition(BaseModel):
    name: str
    description: str
    permission: ToolPermission
    parameters_schema: Dict[str, Any]


# -----------------------------------------------------------------------------
# Parameter Schemas for Registered Tools
# -----------------------------------------------------------------------------

class GetSystemStatusParams(BaseModel):
    include_diagnostics: bool = Field(default=True, description="Whether to include detailed component diagnostics")


class ListApprovedRootsParams(BaseModel):
    pass


class GetAuditFindingsParams(BaseModel):
    audit_id: str = Field(..., description="ID of the shipment audit to inspect")


class GetTaskStatusParams(BaseModel):
    task_id: str = Field(..., description="ID of the background task")


class ProposeFolderOrganizationParams(BaseModel):
    folder_path: str = Field(..., description="Approved folder directory to scan and organize")
    use_ai: bool = Field(default=True, description="Enable local AI classification into allowlisted categories")


class ProposeNoteSummaryParams(BaseModel):
    item_id: str = Field(..., description="ID of the inbox note or email item")
    use_ai: bool = Field(default=True, description="Use local model for extraction")


import inspect

# -----------------------------------------------------------------------------
# Tool Implementations
# -----------------------------------------------------------------------------

async def _exec_get_system_status(params: GetSystemStatusParams) -> Dict[str, Any]:
    roots = path_service.get_approved_roots()
    tasks = task_queue.list_tasks(limit=10)
    conn_info = await ollama_service.check_connection()
    selected_model = ollama_service.get_selected_model()
    return {
        "ollama_available": conn_info.get("connected", False),
        "active_model": selected_model,
        "models_count": conn_info.get("count", 0),
        "approved_roots_count": len(roots),
        "approved_roots": [r["path"] for r in roots],
        "recent_tasks_count": len(tasks)
    }


def _exec_list_approved_roots(params: ListApprovedRootsParams) -> Dict[str, Any]:
    roots = path_service.get_approved_roots()
    return {
        "count": len(roots),
        "roots": [{"id": r["id"], "path": r["path"], "label": r["label"]} for r in roots]
    }


def _exec_get_audit_findings(params: GetAuditFindingsParams) -> Dict[str, Any]:
    audit = TradeSlothService.get_audit(params.audit_id)
    if not audit:
        return {"error": f"Audit {params.audit_id} not found."}
    return {
        "id": audit["id"],
        "title": audit["title"],
        "status": audit["status"],
        "total_documents": audit["summary"]["total_documents"],
        "discrepancies": audit["summary"]["discrepancies"],
        "findings": [
            {
                "field_name": f["field_name"],
                "status": f.get("status", f["severity"]),
                "difference": f.get("difference"),
                "recommended_action": f["recommended_action"]
            }
            for f in audit["findings"]
        ]
    }


def _exec_get_task_status(params: GetTaskStatusParams) -> Dict[str, Any]:
    task = task_queue.get_task(params.task_id)
    if not task:
        return {"error": f"Task {params.task_id} not found."}
    return {
        "id": task["id"],
        "task_type": task["task_type"],
        "status": task["status"],
        "message": task["message"],
        "error_message": task["error_message"]
    }


async def _exec_propose_folder_organization(params: ProposeFolderOrganizationParams) -> Dict[str, Any]:
    """Scans an approved folder and creates an action plan in the approval queue.

    CRITICAL SAFETY CONSTRAINT: This tool ONLY prepares an action plan.
    It does NOT execute file moves. User must explicitly approve the plan in the UI.
    """
    scan_res = await file_organizer_service.scan_and_plan(params.folder_path, use_ai=params.use_ai)
    plan = scan_res.get("plan")
    if not plan:
        return {
            "message": "Folder scan complete. No organization actions needed (folder already organized).",
            "plan_id": None,
            "actions_planned": 0,
            "requires_user_approval": False,
            "items_preview": []
        }

    return {
        "message": "Action plan prepared and queued for user approval.",
        "plan_id": plan["id"],
        "title": plan["title"],
        "actions_planned": len(plan["items"]),
        "requires_user_approval": True,
        "items_preview": [
            {
                "source": item["source_path"],
                "target": item["target_path"],
                "reason": item["reason"]
            }
            for item in plan["items"][:5]
        ]
    }


# -----------------------------------------------------------------------------
# Tool Registry Class
# -----------------------------------------------------------------------------

class ToolRegistry:
    """Registry managing available Copilot tools and enforcing parameter validation and permission gates."""

    def __init__(self):
        self._tools: Dict[str, Dict[str, Any]] = {}
        self._register_defaults()

    def register_tool(
        self,
        name: str,
        description: str,
        permission: ToolPermission,
        param_model: type[BaseModel],
        handler: Callable[[Any], Dict[str, Any]]
    ):
        self._tools[name] = {
            "name": name,
            "description": description,
            "permission": permission,
            "param_model": param_model,
            "schema": param_model.model_json_schema(),
            "handler": handler
        }

    def _register_defaults(self):
        self.register_tool(
            name="get_system_status",
            description="Returns current system status, local model connection, approved root directories, and task counts.",
            permission=ToolPermission.READ_ONLY,
            param_model=GetSystemStatusParams,
            handler=_exec_get_system_status
        )
        self.register_tool(
            name="list_approved_roots",
            description="Returns all user-approved directories where file operations are permitted.",
            permission=ToolPermission.READ_ONLY,
            param_model=ListApprovedRootsParams,
            handler=_exec_list_approved_roots
        )
        self.register_tool(
            name="get_audit_findings",
            description="Retrieves TradeSloth shipment discrepancy findings and recommended review actions for a specific audit ID.",
            permission=ToolPermission.READ_ONLY,
            param_model=GetAuditFindingsParams,
            handler=_exec_get_audit_findings
        )
        self.register_tool(
            name="get_task_status",
            description="Checks the execution status, progress, and outcome of a background task.",
            permission=ToolPermission.READ_ONLY,
            param_model=GetTaskStatusParams,
            handler=_exec_get_task_status
        )
        self.register_tool(
            name="propose_file_organization",
            description="Scans an approved folder and generates a proposed file organization plan in the approval queue. Never executes file moves directly.",
            permission=ToolPermission.PROPOSE_PLAN,
            param_model=ProposeFolderOrganizationParams,
            handler=_exec_propose_folder_organization
        )

    def get_tool_definitions(self) -> List[ToolDefinition]:
        """Returns metadata and parameter schemas for all registered tools."""
        return [
            ToolDefinition(
                name=t["name"],
                description=t["description"],
                permission=t["permission"],
                parameters_schema=t["schema"]
            )
            for t in self._tools.values()
        ]

    async def execute_tool(self, name: str, raw_params: Dict[str, Any]) -> Dict[str, Any]:
        """Validates arguments against Pydantic schema and executes tool safely."""
        if name not in self._tools:
            raise ValueError(f"Unknown or unauthorized tool: '{name}'. Available tools: {list(self._tools.keys())}")

        tool_info = self._tools[name]
        param_model = tool_info["param_model"]

        try:
            validated_params = param_model(**raw_params)
        except ValidationError as e:
            raise ValueError(f"Invalid arguments for tool '{name}': {e.errors()}")

        # Execute handler (sync or async)
        try:
            handler_res = tool_info["handler"](validated_params)
            if inspect.iscoroutine(handler_res):
                result = await handler_res
            else:
                result = handler_res
            return {
                "tool_name": name,
                "permission": tool_info["permission"].value,
                "success": True,
                "result": result
            }
        except Exception as e:
            logger.exception("Error executing tool '%s': %s", name, str(e))
            return {
                "tool_name": name,
                "permission": tool_info["permission"].value,
                "success": False,
                "error": str(e)
            }


tool_registry = ToolRegistry()
