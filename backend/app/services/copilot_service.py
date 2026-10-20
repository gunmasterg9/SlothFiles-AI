"""Local AI Copilot Service.

Provides offline-first conversational assistance, session management,
bounded context, strict tool dispatch with Pydantic validation, and
deterministic offline fallbacks when Ollama is stopped.
"""

from datetime import datetime, timezone
import json
import logging
import re
import uuid
from typing import Any, Dict, List, Optional

from backend.app.db.session import get_db
from backend.app.services.ai_service import ollama_service, OllamaError
from backend.app.services.audit_service import audit_service
from backend.app.services.tool_registry import tool_registry

logger = logging.getLogger("slothpilot.copilot")

COPILOT_SYSTEM_PROMPT = """You are SlothPilot AI Copilot, an offline-first assistant running locally on Windows 11.
You assist users with file organization, shipment document audits, task monitoring, and productivity notes.

MANDATORY SECURITY RULES:
1. You can inspect local content and propose action plans, but you CANNOT directly modify files, delete items, execute shell commands, send email, or access network endpoints.
2. Any consequential file operation MUST be proposed as a plan using the 'propose_file_organization' tool, which requires explicit user consent in the approval queue.
3. When you decide to call a tool, output ONLY a JSON object in the exact format:
{"tool": "<tool_name>", "parameters": { ... }}

Available tools:
- get_system_status: Check health, active Ollama model, and approved root counts.
- list_approved_roots: List all approved directories.
- get_audit_findings: Inspect TradeSloth shipment discrepancy findings by audit_id.
- get_task_status: Check background task progress and messages.
- propose_file_organization: Scan an approved folder and prepare an action plan for user approval.

If no tool is needed, respond with helpful, concise markdown text."""


class CopilotService:
    """Manages Copilot chat sessions, bounded context, tool dispatch, and offline fallbacks."""

    @classmethod
    def create_session(cls, title: Optional[str] = None) -> Dict[str, Any]:
        """Creates a new conversational copilot session."""
        session_id = str(uuid.uuid4())
        now_utc = datetime.now(timezone.utc).isoformat()
        session_title = title or f"Copilot Session {now_utc[11:16]}"

        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO copilot_sessions (id, title, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, session_title, now_utc, now_utc)
            )

        audit_service.log(
            action="copilot_session_created",
            module="copilot",
            actor="user",
            details=f"Created chat session '{session_title}' ({session_id[:8]})"
        )

        return {
            "id": session_id,
            "title": session_title,
            "created_at": now_utc,
            "updated_at": now_utc
        }

    @classmethod
    def list_sessions(cls) -> List[Dict[str, Any]]:
        """Lists all copilot sessions ordered by most recently updated."""
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT id, title, created_at, updated_at FROM copilot_sessions ORDER BY updated_at DESC"
            )
            rows = cursor.fetchall()
            return [
                {
                    "id": r[0],
                    "title": r[1],
                    "created_at": r[2],
                    "updated_at": r[3]
                }
                for r in rows
            ]

    @classmethod
    def get_messages(cls, session_id: str) -> List[Dict[str, Any]]:
        """Retrieves bounded chronological message history for a session."""
        with get_db() as conn:
            cursor = conn.execute(
                """
                SELECT id, role, content, tool_calls_json, tool_results_json, created_at
                FROM copilot_messages
                WHERE session_id = ?
                ORDER BY created_at ASC
                LIMIT 50
                """,
                (session_id,)
            )
            rows = cursor.fetchall()
            return [
                {
                    "id": r[0],
                    "role": r[1],
                    "content": r[2],
                    "tool_calls": json.loads(r[3]) if r[3] else None,
                    "tool_results": json.loads(r[4]) if r[4] else None,
                    "created_at": r[5]
                }
                for r in rows
            ]

    @classmethod
    async def chat(cls, session_id: str, prompt: str) -> Dict[str, Any]:
        """Processes a user prompt within a session, executing restricted tools if requested."""
        if not prompt.strip():
            raise ValueError("Prompt cannot be empty.")

        now_utc = datetime.now(timezone.utc).isoformat()

        # 1. Verify session exists
        with get_db() as conn:
            cursor = conn.execute("SELECT id, title FROM copilot_sessions WHERE id = ?", (session_id,))
            session_row = cursor.fetchone()
            if not session_row:
                raise ValueError(f"Session {session_id} not found.")

        # 2. Record user message
        user_msg_id = str(uuid.uuid4())
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO copilot_messages (id, session_id, role, content, created_at)
                VALUES (?, ?, 'user', ?, ?)
                """,
                (user_msg_id, session_id, prompt.strip(), now_utc)
            )

        # 3. Check model availability
        conn_info = await ollama_service.check_connection()
        is_ollama_online = conn_info.get("connected", False)
        selected_model = ollama_service.get_selected_model()

        tool_calls: Optional[List[Dict[str, Any]]] = None
        tool_results: Optional[List[Dict[str, Any]]] = None
        assistant_content: str = ""

        # 4. Generate response (Local LLM or Deterministic Fallback)
        if is_ollama_online and selected_model:
            try:
                assistant_content, tool_calls, tool_results = await cls._generate_with_llm(
                    session_id, prompt, selected_model
                )
            except Exception as e:
                logger.warning("LLM generation encountered error: %s. Falling back to deterministic logic.", str(e))
                assistant_content, tool_calls, tool_results = await cls._deterministic_fallback(prompt)
        else:
            assistant_content, tool_calls, tool_results = await cls._deterministic_fallback(prompt)

        # 5. Record assistant response in database
        asst_msg_id = str(uuid.uuid4())
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO copilot_messages (
                    id, session_id, role, content, tool_calls_json, tool_results_json, created_at
                )
                VALUES (?, ?, 'assistant', ?, ?, ?, ?)
                """,
                (
                    asst_msg_id,
                    session_id,
                    assistant_content,
                    json.dumps(tool_calls) if tool_calls else None,
                    json.dumps(tool_results) if tool_results else None,
                    datetime.now(timezone.utc).isoformat()
                )
            )
            # Update session timestamp
            conn.execute(
                "UPDATE copilot_sessions SET updated_at = ? WHERE id = ?",
                (datetime.now(timezone.utc).isoformat(), session_id)
            )

        return {
            "id": asst_msg_id,
            "session_id": session_id,
            "role": "assistant",
            "content": assistant_content,
            "tool_calls": tool_calls,
            "tool_results": tool_results,
            "model_online": is_ollama_online
        }

    # -------------------------------------------------------------------------
    # Internal Inference & Fallback Handlers
    # -------------------------------------------------------------------------

    @classmethod
    async def _generate_with_llm(
        cls, session_id: str, prompt: str, model_name: str
    ) -> tuple[str, Optional[List[Dict[str, Any]]], Optional[List[Dict[str, Any]]]]:
        """Invokes local Ollama model with structured tool registry awareness."""
        history = cls.get_messages(session_id)[-6:]  # Bounded recent context

        # Build prompt context
        conversation_context = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in history])
        full_prompt = (
            f"{COPILOT_SYSTEM_PROMPT}\n\n"
            f"Recent Conversation:\n{conversation_context}\n\n"
            f"USER: {prompt}\n"
            "ASSISTANT:"
        )

        raw_response = await ollama_service.generate(
            prompt=full_prompt,
            model=model_name
        )

        # Check if the model response contains a tool call JSON object
        tool_call_match = re.search(r'\{\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"parameters"\s*:\s*(\{[^}]*\})\s*\}', raw_response)
        if tool_call_match:
            tool_name = tool_call_match.group(1)
            raw_params_str = tool_call_match.group(2)
            try:
                params = json.loads(raw_params_str)
                exec_result = await tool_registry.execute_tool(tool_name, params)
                tool_calls = [{"tool": tool_name, "parameters": params}]
                tool_results = [exec_result]

                explanation = raw_response.replace(tool_call_match.group(0), "").strip()
                if not explanation:
                    explanation = f"### System Status\n\nExecuted tool `{tool_name}` safely. See results below."
                return explanation, tool_calls, tool_results
            except Exception as e:
                logger.warning("Tool dispatch failed from model response: %s", str(e))

        return raw_response, None, None

    @classmethod
    async def _deterministic_fallback(
        cls, prompt: str
    ) -> tuple[str, Optional[List[Dict[str, Any]]], Optional[List[Dict[str, Any]]]]:
        """Deterministic keyword and intent matching when Ollama is offline or for deterministic tools."""
        p_lower = prompt.lower()

        # Intent 1: System status or Ollama health
        if any(w in p_lower for w in ("status", "health", "system", "ollama", "model")):
            res = await tool_registry.execute_tool("get_system_status", {"include_diagnostics": True})
            data = res.get("result", {})
            msg = (
                f"### System Status (Deterministic Report)\n\n"
                f"- **Local AI (Ollama):** {'Online' if data.get('ollama_available') else 'Offline (Start Ollama locally on port 11434)'}\n"
                f"- **Selected Model:** `{data.get('active_model') or 'None'}` ({data.get('models_count', 0)} detected locally)\n"
                f"- **Approved Directory Roots:** {data.get('approved_roots_count', 0)} registered\n"
                f"- **Recent Tasks:** {data.get('recent_tasks_count', 0)}\n\n"
                "*All deterministic workflows (file scanning, SHA-256 duplicate detection, document auditing, task queue) remain fully operational without Ollama.*"
            )
            return msg, [{"tool": "get_system_status", "parameters": {}}], [res]

        # Intent 2: List approved roots
        if any(w in p_lower for w in ("roots", "approved", "folder", "directories", "paths")):
            res = await tool_registry.execute_tool("list_approved_roots", {})
            roots = res.get("result", {}).get("roots", [])
            msg = f"### Approved Directory Roots ({len(roots)})\n\n"
            if not roots:
                msg += "No directory roots have been approved yet. Add an approved root in **Settings & Security** to enable file operations."
            else:
                for r in roots:
                    msg += f"- **{r['label']}:** `{r['path']}`\n"
            msg += "\n*Filesystem operations are strictly confined to these directories. Traversal is blocked.*"
            return msg, [{"tool": "list_approved_roots", "parameters": {}}], [res]

        # Intent 3: General Help
        msg = (
            "### SlothPilot AI Copilot (Deterministic Assistant)\n\n"
            "I can assist you with your offline personal automation even when the local AI model is stopped:\n\n"
            "1. **Status & Health:** Ask *'system status'* to inspect loopback services and local models.\n"
            "2. **Approved Roots:** Ask *'list approved roots'* to view directories where file operations are authorized.\n"
            "3. **File Organization:** Head to **File Organizer** or LazyDesk to scan folders and detect exact SHA-256 duplicates.\n"
            "4. **Shipment Audits:** Navigate to **TradeSloth Auditor** to cross-examine shipping documents with decimal precision.\n"
            "5. **Action Safety:** All file operations require explicit consent in the **Approvals** tab.\n\n"
            "*Start Ollama on `127.0.0.1:11434` to enable open-weight generative language inference.*"
        )
        return msg, None, None


copilot_service = CopilotService()
