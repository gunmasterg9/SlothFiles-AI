"""Unit and integration tests for Local AI Copilot and Restricted Tools.

Validates tool registry schemas, permission gates, session management,
deterministic offline fallbacks, and approval-gated plan proposals.
"""

from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.services.path_service import path_service
from backend.app.services.tool_registry import tool_registry, ToolPermission
from backend.app.services.copilot_service import copilot_service


@pytest.mark.asyncio
async def test_tool_registry_schemas_and_permissions():
    """Verify tool definitions, permission enforcement, and rejection of invalid parameters."""
    tools = tool_registry.get_tool_definitions()
    tool_names = [t.name for t in tools]

    assert "get_system_status" in tool_names
    assert "list_approved_roots" in tool_names
    assert "propose_file_organization" in tool_names

    # Check permission levels
    status_tool = next(t for t in tools if t.name == "get_system_status")
    assert status_tool.permission == ToolPermission.READ_ONLY

    propose_tool = next(t for t in tools if t.name == "propose_file_organization")
    assert propose_tool.permission == ToolPermission.PROPOSE_PLAN

    # Rejection of unknown tool
    with pytest.raises(ValueError, match="Unknown or unauthorized tool"):
        await tool_registry.execute_tool("delete_all_files", {})

    with pytest.raises(ValueError, match="Unknown or unauthorized tool"):
        await tool_registry.execute_tool("execute_shell_command", {"command": "rm -rf /"})

    # Rejection of missing required parameters
    with pytest.raises(ValueError, match="Invalid arguments"):
        await tool_registry.execute_tool("propose_file_organization", {})


@pytest.mark.asyncio
async def test_copilot_session_lifecycle():
    """Verify session creation, message persistence, and retrieval."""
    session = copilot_service.create_session("Test Session 1")
    assert session["id"] is not None
    assert session["title"] == "Test Session 1"

    sessions = copilot_service.list_sessions()
    assert any(s["id"] == session["id"] for s in sessions)

    # Chat interaction
    reply = await copilot_service.chat(session["id"], "What is the system status?")
    assert reply["role"] == "assistant"
    assert reply["content"] is not None

    messages = copilot_service.get_messages(session["id"])
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == "What is the system status?"
    assert messages[1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_copilot_deterministic_fallbacks(tmp_path: Path, monkeypatch):
    """Verify that Copilot remains fully useful and provides accurate deterministic answers when Ollama is offline."""
    from backend.app.services.ai_service import ollama_service
    async def mock_offline():
        return {"connected": False, "models": [], "count": 0}
    monkeypatch.setattr(ollama_service, "check_connection", mock_offline)

    session = copilot_service.create_session("Offline Session")

    # Add an approved root
    test_folder = tmp_path / "offline_folder"
    test_folder.mkdir()
    path_service.add_approved_root(str(test_folder), "Offline Folder")

    # 1. Status query
    status_reply = await copilot_service.chat(session["id"], "Show me the health status")
    assert "System Status" in status_reply["content"]
    assert status_reply["tool_calls"] is not None
    assert status_reply["tool_calls"][0]["tool"] == "get_system_status"

    # 2. Approved roots query
    roots_reply = await copilot_service.chat(session["id"], "What are the approved roots?")
    assert "Approved Directory Roots" in roots_reply["content"]
    assert str(test_folder) in roots_reply["content"]

    # 3. General query
    general_reply = await copilot_service.chat(session["id"], "How can you help me?")
    assert "SlothPilot AI Copilot" in general_reply["content"]


@pytest.mark.asyncio
async def test_copilot_propose_organization_routes_to_approval_queue(tmp_path: Path):
    """Verify that proposing file organization creates a pending approval plan and does NOT move files directly."""
    organize_dir = tmp_path / "copilot_organize"
    organize_dir.mkdir()
    path_service.add_approved_root(str(organize_dir), "Copilot Organize Root")

    # Create dummy files
    f1 = organize_dir / "invoice.txt"
    f1.write_text("Invoice data 123", encoding="utf-8")
    f2 = organize_dir / "invoice_copy.txt"
    f2.write_text("Invoice data 123", encoding="utf-8")

    res = await tool_registry.execute_tool(
        "propose_file_organization",
        {"folder_path": str(organize_dir), "use_ai": False}
    )

    assert res["success"] is True
    plan_data = res["result"]
    assert plan_data["requires_user_approval"] is True
    assert "plan_id" in plan_data
    assert plan_data["actions_planned"] >= 1

    # Precondition: files have NOT been moved yet (they remain in original place until approved)
    assert f1.exists()
    assert f2.exists()


def test_copilot_api_routes(tmp_path: Path, client: TestClient):
    """Verify FastAPI endpoints for Copilot sessions, messages, chat, and tools list."""
    # 1. List tools
    tools_res = client.get("/api/copilot/tools")
    assert tools_res.status_code == 200
    assert len(tools_res.json()) >= 4

    # 2. Create session
    create_res = client.post("/api/copilot/sessions", json={"title": "API Session"})
    assert create_res.status_code == 201
    session_id = create_res.json()["id"]

    # 3. List sessions
    list_res = client.get("/api/copilot/sessions")
    assert list_res.status_code == 200
    assert any(s["id"] == session_id for s in list_res.json())

    # 4. Chat
    chat_res = client.post(
        f"/api/copilot/sessions/{session_id}/chat",
        json={"prompt": "system status"}
    )
    assert chat_res.status_code == 200
    assert "assistant" == chat_res.json()["role"]

    # 5. Get messages
    msg_res = client.get(f"/api/copilot/sessions/{session_id}/messages")
    assert msg_res.status_code == 200
    assert len(msg_res.json()) == 2
