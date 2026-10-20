# SlothPilot AI: Implementation Plan & Operational Ledger

## 1. Environment & Repository Baseline Inspection (M0)

- **Working Directory:** `C:\Users\RAHUL\Desktop\gautam\slothpilot-ai`
- **Git Branch:** `main` (clean standalone repository initialized)
- **Host OS:** Windows 11 (PowerShell 5.1 / cmd.exe)
- **Runtime Versions:**
  - Python: `3.12.10`
  - Node.js: `v24.21.0`
  - npm: `11.19.0`
  - Ollama: `0.40.6` (Active on `http://127.0.0.1:11434`)
  - Local Models Available: `qwen2.5:7b` (4.7 GB), `llama3.2:latest` (2.0 GB), `smollm2:latest` (1.8 GB)
- **Backend Environment:** `.venv` configured with Python 3.12, FastAPI, Uvicorn, Pydantic v2, HTTPX, Pytest, PyMuPDF, python-docx, openpyxl, watchdog, and standard-library modules (`email`, `hashlib`, `sqlite3`).
- **Frontend Environment:** `frontend/` configured with React 19, TypeScript, Vite 8, Tailwind CSS 3, Lucide icons. Verified production build compiles cleanly.

---

## 2. Architecture & Service Inventory

SlothPilot AI is structured around strict separation of concerns, loopback isolation, deterministic safety gates, and local open-weight AI inference:

```
slothpilot-ai/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app factory, lifespan, CORS, middleware
│   │   ├── config.py                # Pydantic Settings (.env, loopback bindings, timeouts)
│   │   ├── db/
│   │   │   ├── session.py           # SQLite connection manager, foreign keys & pragmas
│   │   │   └── migrations.py        # Versioned non-destructive SQLite migrations
│   │   ├── services/
│   │   │   ├── ai_service.py        # Ollama client, model discovery, structured generation
│   │   │   ├── path_service.py      # Path traversal guard, approved roots, UNC/symlink validation
│   │   │   ├── document_extractor.py# Text extraction (PDF, DOCX, XLSX, TXT, EML)
│   │   │   ├── file_organizer.py    # Metadata indexing, SHA-256 duplicate detection, plan builder
│   │   │   ├── folder_watcher.py    # Watchdog observer, debounced event queue, loop prevention
│   │   │   ├── inbox_service.py     # Note/EML parser, date & action extraction, drafts
│   │   │   ├── tradesloth_service.py# Shipment doc auditor, decimal arithmetic, discrepancy engine
│   │   │   ├── approval_service.py  # Consequential action plans, execution, safe undo
│   │   │   ├── task_queue.py        # Background task lifecycle, state transitions, cooperative cancel
│   │   │   ├── audit_service.py     # Append-only audit logging & tamper-evident history
│   │   │   └── copilot_service.py   # Local AI agent, registered tool runner, sandboxed execution
│   │   └── routers/
│   │       ├── health.py            # /api/health and /api/ready
│   │       ├── settings.py          # /api/settings and /api/models
│   │       ├── organizer.py         # /api/organizer (scan, plan, execute, undo)
│   │       ├── watcher.py           # /api/watcher (roots, watch status, queue)
│   │       ├── inbox.py             # /api/inbox (imports, summaries, drafts)
│   │       ├── tradesloth.py        # /api/tradesloth (audits, findings, reports)
│   │       ├── approvals.py         # /api/approvals (pending plans, approve, reject)
│   │       ├── tasks.py             # /api/tasks (lifecycle, active, history, cancel)
│   │       ├── audit.py             # /api/audit (append-only log inspection)
│   │       └── copilot.py           # /api/copilot (chat, tools, session history)
│   ├── tests/
│   │   ├── conftest.py              # Test fixtures (temp roots, synthetic files, mock Ollama)
│   │   ├── test_path_security.py    # Path traversal, symlink escape, drive hopping tests
│   │   ├── test_organizer.py        # Duplicate hashes, classification, undo tests
│   │   ├── test_watcher.py          # Watchdog debouncing, loop prevention tests
│   │   ├── test_inbox.py            # Notes/EML extraction, retention, drafts tests
│   │   ├── test_tradesloth.py       # Shipment discrepancy decimal precision tests
│   │   ├── test_approval_lifecycle.py# Stale approval rejection, modification guard tests
│   │   └── test_copilot_tools.py    # Strict tool schema validation & permission tests
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # Root layout, router/tab navigation, status banners
│   │   ├── components/              # Reusable UI primitives (Modals, Alerts, Badges, Tables)
│   │   ├── features/
│   │   │   ├── overview/            # Dashboard stats, Ollama health, active tasks, alerts
│   │   │   ├── organizer/           # Smart File Organizer UI (Scan, Review, Approve, Undo)
│   │   │   ├── lazydesk/            # LazyDesk Folder Watcher & Automation UI
│   │   │   ├── inbox/               # Inbox & Notes Assistant UI (Imports, Summaries, Drafts)
│   │   │   ├── tradesloth/          # TradeSloth Document Auditor UI & Discrepancy Matrix
│   │   │   ├── copilot/             # Local AI Copilot Chat & Tool Inspector
│   │   │   ├── approvals/           # Pending Action Plans & Risk Inspector
│   │   │   ├── tasks/               # Shared Task History & Cancellation Controller
│   │   │   └── settings/            # System Settings, Approved Roots, Ollama Model Selector
│   │   └── services/api.ts          # Strongly typed API client
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── TESTING.md
│   └── DEMO.md
├── scripts/
│   ├── setup.ps1                    # Environment validation & dependency installer
│   ├── start.ps1                    # Reliable dual-process launcher (backend + frontend)
│   ├── stop.ps1                     # Safe PID-targeted process terminator
│   └── verify.ps1                   # Comprehensive automated test runner
└── .env.example
```

---

## 3. Milestones & Verification Protocol

### Milestone M0: Repository Inspection & Implementation Plan
- **Goal:** Baseline environment validation, repo initialization, dependency audit, implementation plan.
- **Verification:** Git status clean, Python 3.12 verified, Node 24 + npm verified, Ollama runtime verified, `docs/IMPLEMENTATION_PLAN.md` recorded.
- **Status:** Completed.

### Milestone M1: Project Skeleton, Local Configuration & Health Checks
- **Goal:** FastAPI backend skeleton, Pydantic settings, loopback-only binding, CORS restriction, `/api/health` and `/api/ready`, React frontend skeleton with tab navigation and health banner.
- **Verification:** Pytest suite passes; `curl http://127.0.0.1:8000/api/health` returns status `ok`; frontend builds and displays live health indicator.

### Milestone M2: Ollama Integration, Settings, SQLite & Audit Infrastructure
- **Goal:** Local Ollama API client (no cloud fallback, real model discovery, timeouts, structured errors), SQLite versioned migrations, approved roots manager, append-only audit log service.
- **Verification:** Unit tests for model discovery (`qwen2.5:7b`, `llama3.2:latest`); test SQLite migration runner; test append-only audit log constraints.

### Milestone M3: Smart File Organizer
- **Goal:** Approved folder selection, file metadata indexing, SHA-256 duplicate detection, document text extraction (PDF, DOCX, XLSX, TXT), AI classification with deterministic category allowlist, action plan generation, conflict detection, approval workflow, safe file move/rename, undo support.
- **Verification:** Synthetic folder tests: exact duplicates identified by SHA-256; mock/real classification tested; rejected plans make 0 filesystem changes; approved moves succeed; undo restores files accurately.

### Milestone M4: LazyDesk Automation
- **Goal:** Watchdog folder monitoring restricted to approved roots, pause/resume, persistent queue, file-change deduplication, event loop prevention (ignoring internal moves/temp files), retry limits with backoff, task history.
- **Verification:** Watchdog integration test: dropping file in watched test folder triggers queued plan; self-modification does not loop; pause stops processing; resume restarts.

### Milestone M5: Inbox & Notes Assistant
- **Goal:** Import validation (TXT, MD, EML), local metadata/text storage, summary generation, action-item extraction, date extraction with source quotes, local reply drafting (no network send), search/filtering.
- **Verification:** Test EML/TXT parser with synthetic emails; verify source citation for dates/action items; verify prompt injection resistance (untrusted document instructions cannot override safety policies).

### Milestone M6: TradeSloth Document Auditor
- **Goal:** Multi-document shipment auditor (PDF, DOCX, XLSX, TXT), candidate field extraction (invoice numbers, currency, descriptions, quantities, weights, package counts, totals), decimal arithmetic comparison, tolerance handling, discrepancy matrix (missing, unreadable, inconsistent, verified), printable/exportable audit report.
- **Verification:** Synthetic shipment tests with matching & mismatching documents; decimal precision tests (rounding/currency); verify report contains evidence snippets and disclaimer.

### Milestone M7: Local AI Copilot & Restricted Tools
- **Goal:** Conversational copilot with streaming/structured response, tool registry with strict Pydantic schemas, explicit per-tool permissions (read-only query tools vs. plan-proposing tools), model offline detection and deterministic fallback.
- **Verification:** Test tool dispatcher rejects arbitrary command execution, tests tool permission checking, tests copilot tool proposals route through approval queue.

### Milestone M8: Security Hardening, Integration Tests & Offline Verification
- **Goal:** Comprehensive security test suite (path traversal `..`, UNC/drive hopping, symlink escape, stale approvals, source file modification race conditions), complete offline verification test with internet disabled.
- **Verification:** 100% security tests pass; application operates without external internet connection.

### Milestone M9: Documentation, Demonstration & Hacktoberfest Submission
- **Goal:** Operational PowerShell scripts (`setup.ps1`, `start.ps1`, `stop.ps1`, `verify.ps1`), `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/TESTING.md`, `docs/DEMO.md`, `README.md`, `LICENSE`, `CONTRIBUTING.md`, and DEV.to article draft.
- **Verification:** `scripts/verify.ps1` runs end-to-end and exits code 0; browser walkthrough recorded.

---

## 4. Key Security & Implementation Rules

1. **Loopback Only:** Default backend binds to `127.0.0.1:8000`, frontend binds to `127.0.0.1:5173`. Never bind `0.0.0.0` or allow wildcards.
2. **Approved Roots Constraint:** Filesystem access is strictly confined to user-approved directory roots stored in SQLite. Traversal attempts (`..`, alternate drives, symlink loops) trigger `403 Forbidden` and are logged in audit history.
3. **Approval Binding & Precondition Revalidation:** Action plans include SHA-256 hashes of source files, timestamps, and target paths. Approvals are one-time tokens. Before executing any move or rename, preconditions are re-verified; if source file was modified, execution aborts.
4. **Append-Only Audit Log:** Database triggers or service constraints block `UPDATE` and `DELETE` on the `audit_logs` table.
5. **Decimal Financial Arithmetic:** Quantities, weights, and currency amounts use Python `decimal.Decimal` to eliminate floating-point drift.
6. **No Phantom Completion:** Features are only marked complete when backed by passing automated tests and observable runtime proof.
