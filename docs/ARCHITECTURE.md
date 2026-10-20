# SlothPilot AI: Architecture & System Design

## 1. System Overview

SlothPilot AI is engineered as a privacy-preserving, offline-first application. It pairs an asynchronous Python FastAPI backend with a React (TypeScript + Vite + Tailwind CSS) single-page application dashboard, connecting exclusively via loopback (`127.0.0.1`).

```
+-----------------------------------------------------------------+
|                       User Browser Dashboard                    |
|             (React 19, TypeScript, Vite, Tailwind CSS)          |
|                  http://127.0.0.1:5173                          |
+-------------------------------+---------------------------------+
                                | HTTP REST / JSON
                                v (Strict loopback only)
+-----------------------------------------------------------------+
|                       FastAPI Backend                           |
|                  http://127.0.0.1:8000                          |
|                                                                 |
|  [Middleware: Loopback Host Guard & CORS & Structured Errors]  |
+-----------------------------------------------------------------+
| Shared Core Services:                                           |
|  * PathService: Approved directory root gating & traversal block|
|  * ApprovalService: Precondition revalidation & safe undo       |
|  * TaskQueue: Cooperative task state machine & watcher daemon   |
|  * AuditService: Immutable append-only audit trail              |
|  * DocumentExtractor: Multi-format text extraction (PDF/DOCX/..)|
|  * OllamaService: Local AI model discovery & structured outputs|
|  * ToolRegistry: Strict Pydantic sandboxed schemas              |
+-------------------------------+---------------------------------+
                                |
               +----------------+----------------+
               |                                 |
               v                                 v
+-----------------------------+   +-------------------------------+
|      SQLite Database        |   |       Local Ollama Engine     |
|   (Versioned Migrations &   |   |     (Open-Weight Local AI)    |
|   Append-Only DB Triggers)  |   |     http://127.0.0.1:11434    |
+-----------------------------+   +-------------------------------+
```

---

## 2. Shared Core Services

### 2.1 PathService (`backend/app/services/path_service.py`)
- **Responsibility**: Enforces filesystem security boundaries across all modules.
- **Rules**:
  1. No filesystem access is allowed outside user-registered, active `approved_roots`.
  2. Traversal tokens (`..`, `/../`, `\..\`) are detected and blocked immediately with `403 Forbidden`.
  3. UNC network paths (`\\server\share`, `//server/share`) are prohibited.
  4. Symlinks are resolved to their physical destinations; symlinks pointing outside approved roots are blocked.
  5. Case-insensitivity on Windows is normalized via canonical path resolution.

### 2.2 ApprovalService (`backend/app/services/approval_service.py`)
- **Responsibility**: Manages the approval gating lifecycle for consequential file modifications.
- **Workflow**:
  1. `create_plan()` generates a plan record with precomputed SHA-256 hashes of all source files.
  2. The plan is presented in the dashboard for human inspection.
  3. Rejection changes status to `rejected` with **zero** filesystem mutations.
  4. Execution revalidates all preconditions immediately before moving:
     - Source file must still exist.
     - Source file SHA-256 must match the preview hash (detecting post-preview modifications).
     - Target destination file must not exist (no silent overwriting).
     - Target parent directory must lie within approved roots.
  5. Moves are executed atomically; rollback/undo is recorded and supported.

### 2.3 TaskQueue & FolderWatcher (`backend/app/services/task_queue.py`, `folder_watcher.py`)
- **Responsibility**: Asynchronous task scheduling and background folder monitoring.
- **Validated State Transitions**:
  `queued -> running -> awaiting_approval / succeeded / failed / cancelled`
- **Loop Prevention**: Monitored folders debounce file change events (default 2s) and automatically ignore internal category subdirectories, hidden files, and temporary swap files (`.tmp`, `~$`, `.crdownload`).

### 2.4 AuditService (`backend/app/services/audit_service.py`)
- **Responsibility**: Records all consequential actions, policy violations, and approval events.
- **Database Trigger**: SQLite trigger `prevent_audit_logs_update` and `prevent_audit_logs_delete` blocks SQL `UPDATE` and `DELETE` queries, ensuring tamper-resistant audit logs.

### 2.5 OllamaService (`backend/app/services/ai_service.py`)
- **Responsibility**: Connects to the local Ollama instance on `http://127.0.0.1:11434`.
- **Offline Guarantee**: Retrieves model list from the actual running environment; validates JSON outputs against Pydantic schemas; falls back to deterministic workflows when Ollama is offline or unconfigured.

### 2.6 ToolRegistry (`backend/app/services/tool_registry.py`)
- **Responsibility**: Sandboxed tool registry for Local AI Copilot.
- **Permissions**: Distinguishes between `READ_ONLY` query tools and `PROPOSE_PLAN` tools. Proposing an action creates an action plan in the approval queue; direct shell command execution or arbitrary file modifications are strictly prohibited.

---

## 3. Database Schema

The database (`data/slothpilot.db`) uses versioned SQL migrations (`backend/app/db/migrations/001_initial_schema.sql`):

- `settings`: Key-value application configuration.
- `approved_roots`: Registered directories permitted for scanning and file operations.
- `action_plans` & `action_items`: Gated operations awaiting or completing approval.
- `tasks` & `task_events`: Asynchronous task execution states and event timelines.
- `folder_watches`: Monitored directory paths and debounce configurations.
- `inbox_items`: Imported notes, summaries, obligations, and date evidence.
- `shipment_audits` & `audit_findings`: TradeSloth document audits and discrepancy matrices.
- `copilot_sessions` & `copilot_messages`: Persistent conversational session transcripts.
- `audit_logs`: Append-only event history guarded by database triggers.

---

## 4. Network and Loopback Boundaries

- **Backend Host Binding**: `127.0.0.1:8000` (Loopback only).
- **Frontend Host Binding**: `127.0.0.1:5173` (Loopback only).
- **CORS Configuration**: Restricts allowed origins strictly to `http://127.0.0.1:5173` and `http://localhost:5173`.
- **DNS Rebinding Protection**: Custom ASGI middleware inspects the HTTP `Host` header. Requests directed to unauthorized domain names are immediately rejected with `403 Forbidden`.
