# 🦥 SlothPilot AI

> **One AI. All your busywork. Less effort.**

SlothPilot AI is an offline-first personal productivity and automation application powered by open-weight local AI and open-source software. It handles file clutter, repetitive folder monitoring, document obligations, cross-document discrepancy auditing, and local task assistance—without sending your data to the cloud or recurring API costs.

---

## 🌟 The Five Integrated Modules

1. **Smart File Organizer**:
   - Indexes files within user-approved directory roots.
   - Computes streaming SHA-256 hashes to detect exact duplicates.
   - Extracts text from TXT, PDF, DOCX, XLSX, and RFC 5322 EML files.
   - Classifies documents into allowlisted category directories using open-weight models (`qwen2.5:7b`, `llama3.2`, etc.).
   - Generates plan previews and gates all file movements behind explicit user approvals with safe undo.

2. **LazyDesk Automation**:
   - Monitored folder watchers strictly confined to approved roots using Watchdog.
   - Deduplicated event queue with debouncing and event-loop prevention (internal moves & `.tmp` files ignored).
   - Cooperative pause/resume controls and resilient task state machine (`queued -> running -> awaiting_approval / succeeded / failed / cancelled`).
   - Detailed task history with actionable error reporting.

3. **Inbox & Notes Assistant**:
   - Imports meeting notes, transcripts, Markdown files, and local EML emails.
   - Extracts action items with urgency flags, assignees, and mandatory source quote citations.
   - Discovers key deadlines and dates, explicitly flagging ambiguous relative dates.
   - Synthesizes executive summaries and drafts local response drafts (stored locally; no network transmission).
   - Adversarial prompt injection defense prevents document contents from overriding system security.

4. **TradeSloth Document Auditor**:
   - Cross-audits multi-document shipment packages (Commercial Invoices, Bills of Lading, Packing Lists).
   - Deterministic candidate field extraction (invoice numbers, currencies, gross/net weights, package counts, monetary totals).
   - Exact `decimal.Decimal` arithmetic eliminates floating-point drift.
   - Detects unit conflicts (e.g. `kg` vs `lbs`) and currency mismatches before comparison.
   - Generates a categorized discrepancy matrix (`verified`, `inconsistent`, `missing`, `unreadable`) with evidence references.
   - Exports printable Markdown audit reports with embedded statutory and customs compliance disclaimers.

5. **Local AI Copilot**:
   - Conversational assistant operating strictly on loopback.
   - Sandboxed tool registry with strict Pydantic schemas and explicit permissions (`READ_ONLY` vs `PROPOSE_PLAN`).
   - Tools for querying system health, listing approved roots, summarizing TradeSloth discrepancy matrices, checking background task status, and proposing folder organization.
   - Proposing an organization plan routes to the shared approvals queue; zero direct shell or filesystem mutation allowed.
   - Deterministic fallback allows tools to remain operational even when Ollama is offline.

---

## 🛡️ Security & Privacy Architecture

- **Strict Loopback Binding**: Backend (`127.0.0.1:8000`) and frontend (`127.0.0.1:5173`) bind exclusively to loopback. Wildcard bindings (`0.0.0.0`) and LAN exposure are blocked by default.
- **DNS Rebinding & Host Guard**: Middleware verifies the `Host` header on all requests; requests with foreign host headers are rejected with `403 Forbidden`.
- **Approved Roots Boundary**: All filesystem access is strictly confined to user-approved directories stored in SQLite. Directory traversal (`..`), UNC paths (`\\server\share`), and symlink escapes are detected and rejected.
- **Shared Approval Lifecycle**: Consequential file operations are gated behind one-time approval plans. Preconditions (source existence, SHA-256 integrity, destination collision freedom) are revalidated immediately prior to execution.
- **Append-Only Audit Trail**: SQLite database triggers block `UPDATE` and `DELETE` queries on `audit_logs`, providing an immutable audit trail of all operations and rejections.
- **No Cloud Fallbacks**: SlothPilot AI never sends prompts, documents, or metadata to external third-party cloud APIs.

---

## 📋 Technology Stack

- **Backend**: Python 3.12, FastAPI, Pydantic v2, SQLite, Pytest, PyMuPDF, python-docx, openpyxl, Watchdog.
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide icons.
- **Local AI**: Ollama local inference API (`http://127.0.0.1:11434`), supporting `qwen2.5:7b`, `llama3.2`, `smollm2`, and other open-weight models.

---

## 🚀 Quick Start Guide

### Prerequisites

1. **Windows 11** (or compatible Windows / Linux environment).
2. **Python 3.12+** and **Node.js v18+**.
3. **Ollama** installed and running on `http://127.0.0.1:11434` (optional for local AI features; deterministic workflows work offline without it).

### 1. Installation

Clone the repository and run the automated setup script:

```powershell
git clone https://github.com/your-org/slothpilot-ai.git
cd slothpilot-ai
.\scripts\setup.ps1
```

The setup script verifies dependencies, creates `.venv`, installs backend requirements, installs frontend packages, and initializes `.env` without downloading large models silently.

### 2. Launch Services

Start the backend and frontend services on loopback:

```powershell
.\scripts\start.ps1
```

Once running:
- **Frontend Dashboard**: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- **Backend API & Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Backend Health Check**: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)

### 3. Verify System Health & Tests

Run the complete test suite (53 tests) and build verification:

```powershell
.\scripts\verify.ps1
```

### 4. Stop Services

Safely terminate only the processes started by SlothPilot:

```powershell
.\scripts\stop.ps1
```

---

## 🧪 Verified Test Suite

SlothPilot AI includes a comprehensive automated test suite with **53 passing tests** across 12 test modules:

| Test Module | Coverage | Status |
|:---|:---|:---:|
| `test_health.py` | Health endpoints, readiness, DNS rebinding guard, 404 handler | ✅ Passed |
| `test_database_and_audit.py` | Idempotent migrations, append-only trigger, audit pagination | ✅ Passed |
| `test_document_extractor.py` | TXT, DOCX, XLSX, RFC 5322 EML, PDF & scanned OCR detection | ✅ Passed |
| `test_path_security.py` | Approved roots, traversal blocking, UNC blocking | ✅ Passed |
| `test_settings_and_audit_api.py`| Settings CRUD, live model discovery, audit log API | ✅ Passed |
| `test_organizer_and_approvals.py`| Duplicate detection, approval lifecycle, precondition abort, safe undo | ✅ Passed |
| `test_tasks_and_watcher.py` | Task state machine, cancellation, Watchdog loop prevention | ✅ Passed |
| `test_inbox.py` | Note & email parsing, obligations, dates, injection safety | ✅ Passed |
| `test_tradesloth.py` | Clean audit, decimal comparison, markdown report export | ✅ Passed |
| `test_copilot.py` | Pydantic tool schemas, session lifecycle, deterministic fallback | ✅ Passed |
| `test_security_hardening.py` | Symlinks, case-insensitivity, collisions, race conditions, offline | ✅ Passed |

---

## ⚠️ Limitations & Disclosures

- **Initial Downloads**: Initial installation of Python packages, Node modules, and Ollama models requires an internet connection. Once downloaded, all workflows operate 100% offline.
- **Hardware Requirements**: Local model inference speed depends on your GPU / CPU capabilities. Recommended candidate: `qwen2.5:7b` (requires ~5GB VRAM or 8GB RAM). Smaller models like `llama3.2:1b` or `smollm2` can be used on lower-spec machines.
- **Regulatory Disclaimer**: Reports generated by the TradeSloth Document Auditor highlight cross-document variances for human review and do not constitute legal or statutory customs clearance advice.
- **OCR Capability**: Scanned PDFs without embedded text streams are identified as unreadable; OCR integration requires an installed local OCR engine.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
