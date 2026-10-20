"""Local AI Copilot Router.

Provides conversational endpoints, message history, tool dispatch, and tool schemas.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from backend.app.services.copilot_service import copilot_service
from backend.app.services.tool_registry import tool_registry

router = APIRouter(prefix="/api/copilot", tags=["Local AI Copilot"])


class CreateSessionRequest(BaseModel):
    title: Optional[str] = Field(None, description="Optional custom title for the chat session")


class ChatPromptRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="User question or prompt for Copilot")


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
def create_session(req: CreateSessionRequest):
    """Creates a new conversational copilot session."""
    try:
        return copilot_service.create_session(req.title)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions")
def list_sessions():
    """Lists all copilot sessions ordered by recent activity."""
    return copilot_service.list_sessions()


@router.get("/sessions/{session_id}/messages")
def get_session_messages(session_id: str):
    """Retrieves message history for a specific session."""
    return copilot_service.get_messages(session_id)


@router.post("/sessions/{session_id}/chat")
async def chat(session_id: str, req: ChatPromptRequest):
    """Sends a user prompt to the copilot within a session."""
    try:
        return await copilot_service.chat(session_id, req.prompt)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Copilot inference error: {str(e)}")


@router.get("/tools")
def list_tools():
    """Lists all registered tools, descriptions, permission gates, and JSON parameter schemas."""
    return tool_registry.get_tool_definitions()
