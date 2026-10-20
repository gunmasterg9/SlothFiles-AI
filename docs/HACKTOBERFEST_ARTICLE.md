---
title: "SlothPilot AI: Let Open-Source AI Handle the Busywork, Locally"
published: false
description: "An offline-first personal productivity and document automation application powered by local open-weight AI, FastAPI, SQLite, and React."
tags: ["ai", "python", "opensource", "webdev"]
canonical_url: null
cover_image: null
---

# SlothPilot AI: Let Open-Source AI Handle the Busywork, Locally

Every knowledge worker knows the burden of digital busywork: folders overflowing with unorganized downloads, meeting notes with buried action items, email threads requiring routine replies, and shipment documents requiring tedious cross-auditing for variance discrepancies.

Many modern productivity tools solve this by piping personal files to proprietary cloud APIs. But for sensitive financial spreadsheets, confidential client communications, or international trade documents, sending data to third-party cloud servers poses real privacy risks, unpredictable recurring API costs, and dependency on constant internet connectivity.

**SlothPilot AI** ("*One AI. All your busywork. Less effort.*") was built to solve this challenge through an **offline-first**, local-first architecture powered by open-weight AI and open-source software.

---

## Why Open-Weight Models & Local Inference?

SlothPilot AI is powered by local inference using **Ollama** running on your local machine (`http://127.0.0.1:11434`), supporting open-weight models such as `qwen2.5:7b`, `llama3.2`, and `smollm2`.

Choosing local open-weight models provides three distinct advantages:

1. **True Privacy**: Document text, hashes, notes, and file paths never leave your local loopback interface (`127.0.0.1`).
2. **Zero Recurring API Costs**: You aren't billed per token or per API request. Once models are downloaded, automated scans and copilot conversations run without subscription fees.
3. **Resilience & Offline Operation**: You can work on an airplane, in a secure facility, or during an internet outage without interruption.

---

## System Architecture: The Five Integrated Modules

SlothPilot AI pairs a **FastAPI (Python 3.12)** backend with a **React 19 (TypeScript, Vite, Tailwind CSS)** dashboard. Rather than isolated utilities, all functionality shares a single core infrastructure:

```
[React 19 Dashboard (127.0.0.1:5173)]
              |
              v (Strict Loopback JSON)
[FastAPI Backend (127.0.0.1:8000)]
  ├── PathService (Approved Directory Roots, Traversal Block, Symlink Defense)
  ├── ApprovalService (Precondition Revalidation & Atomic Safe Undo)
  ├── TaskQueue & FolderWatcher (Debounced Watchdog Monitoring)
  ├── AuditService (Append-Only SQLite Trigger Logs)
  └── Local AI Engine (Ollama API Discovery & Structured Pydantic Output)
```

The five integrated modules include:

### 1. Smart File Organizer
- Scans user-approved folders and computes streaming SHA-256 hashes to flag exact duplicate files.
- Extracts text from TXT, PDF, DOCX, XLSX, and RFC 5322 EML files.
- Employs open-weight models to classify files into allowlisted categories (`Invoices & Receipts`, `Legal & Contracts`, `Documents & Notes`, `Code & Data`).
- Previews proposed moves and routes them to an approvals queue.

### 2. LazyDesk Automation
- Monitored folder watches restricted strictly to approved directories using Python's `watchdog`.
- Automatically deduplicates and debounces file events (default 2s delay).
- Prevents file operation loops by explicitly ignoring internal reorganizations, category directories, and temporary files (`.tmp`, `~$`).
- Validated state machine (`queued -> running -> awaiting_approval / succeeded / failed / cancelled`) with cooperative pause/resume controls.

### 3. Inbox and Notes Assistant
- Imports meeting notes, transcripts, Markdown files, and local EML emails.
- Extracts actionable obligations with assigned owners, urgency flags, and mandatory direct source quote citations.
- Identifies deadlines and dates, explicitly flagging ambiguous relative dates (e.g. "next Thursday").
- Synthesizes executive summaries and drafts local response drafts stored safely on your machine without external transmission.
- Defense against prompt injection ensures untrusted document text cannot override system constraints.

### 4. TradeSloth Document Auditor
- Cross-audits multi-document shipment sets (Bills of Lading, Commercial Invoices, Packing Lists).
- Extracts candidate fields: invoice numbers, currencies, gross/net weights, package counts, and monetary totals.
- Eliminates floating-point inaccuracies by computing all variances using Python's `decimal.Decimal`.
- Validates units (e.g., `kg` vs. `lbs`) and currency mismatches before comparing values.
- Compiles a deterministic discrepancy matrix (`verified`, `inconsistent`, `missing`, `unreadable`) and exports standalone Markdown audit reports.

### 5. Local AI Copilot
- Conversational dashboard assistant equipped with a sandboxed tool registry.
- Tools enforce strict Pydantic schemas and segregated permissions (`READ_ONLY` for system and audit queries vs. `PROPOSE_PLAN` for organization requests).
- Consequential proposals route strictly into the shared approvals queue; direct shell command execution or unapproved file mutations are blocked.
- Deterministic fallback allows tools to remain functional even if the local AI model is offline.

---

## Critical Distinction: AI Suggestions vs. Deterministic Actions

A fundamental architectural rule of SlothPilot AI is that **language models are never permitted to execute consequential file actions directly**.

1. **AI Proposes Plans, Deterministic Code Enforces Constraints**:
   - The model can only suggest destination categories or describe discrepancies.
   - Filesystem operations are strictly validated by `PathService` to guarantee paths lie within user-approved directory roots. Traversal tokens (`..`), UNC paths (`\\server\share`), and symlink escapes are rejected.
2. **Precondition Revalidation (TOCTOU Defense)**:
   - When a plan is created, source files are hashed with SHA-256.
   - When the user clicks "Approve", the application re-verifies preconditions immediately before moving:
     - Does the source file still exist?
     - Does the SHA-256 hash match the preview? (Detects if a file was modified after preview).
     - Does a file already exist at the destination? (Blocks silent overwrites).
3. **Immutable Audit Trail**:
   - Every approval, execution, and policy block is recorded in an SQLite `audit_logs` table. Database triggers prevent SQL `UPDATE` and `DELETE` queries, ensuring an append-only audit trail.

---

## Real Demonstration Workflow

Here is what organizing a chaotic folder looks like in practice:

1. **Approve Root**: In *Settings & Audit*, add `C:\Users\RAHUL\Documents\ProjectFiles` as an approved root.
2. **Scan**: In *File Organizer*, scan the directory. The engine extracts text across 15 documents and identifies 2 duplicate invoices via SHA-256 hash matching.
3. **Inspect Plan**: The UI displays a proposed Action Plan showing proposed moves into `Invoices & Receipts` and `Duplicates`. No files have been moved.
4. **Approve**: In the *Approvals* tab, review the items and click **Approve**. Preconditions are revalidated and files are moved atomically.
5. **Undo (if needed)**: Click **Undo** at any time to return all files safely back to their original locations.

---

## Installation & Setup

### Prerequisites
- Windows 11 (or Linux/macOS)
- Python 3.12+
- Node.js v18+ and npm
- Ollama (installed locally with `ollama run qwen2.5:7b`)

### Commands

```powershell
# 1. Clone the repository
git clone https://github.com/your-org/slothpilot-ai.git
cd slothpilot-ai

# 2. Run automated setup (creates .venv, installs backend and frontend dependencies)
.\scripts\setup.ps1

# 3. Launch backend and frontend services on loopback (127.0.0.1)
.\scripts\start.ps1

# 4. Open your browser
# Dashboard: http://127.0.0.1:5173
# API Docs:  http://127.0.0.1:8000/docs
```

To stop all services cleanly without affecting unrelated processes:
```powershell
.\scripts\stop.ps1
```

---

## Verified Test Results

SlothPilot AI is backed by an automated test suite comprising **53 passing tests** across 12 test files:

```
============================= test session starts =============================
collected 53 items

backend/tests/test_health.py ................ PASSED [4 tests]
backend/tests/test_database_and_audit.py .... PASSED [3 tests]
backend/tests/test_document_extractor.py .... PASSED [5 tests]
backend/tests/test_path_security.py ......... PASSED [4 tests]
backend/tests/test_settings_and_audit_api.py  PASSED [3 tests]
backend/tests/test_organizer_and_approvals.py PASSED [5 tests]
backend/tests/test_tasks_and_watcher.py ..... PASSED [4 tests]
backend/tests/test_inbox.py ................. PASSED [4 tests]
backend/tests/test_tradesloth.py ............ PASSED [4 tests]
backend/tests/test_copilot.py ............... PASSED [5 tests]
backend/tests/test_security_hardening.py .... PASSED [8 tests]
backend/tests/test_ollama_service.py ........ PASSED [4 tests]

======================== 53 passed in 75.75s ========================
```

You can verify the entire test suite and production build at any time:
```powershell
.\scripts\verify.ps1
```

---

## Transparent Limitations & Disclosures

- **Initial Setup Requires Internet**: Downloading Python dependencies, Node packages, and local Ollama weights requires an initial internet connection. Subsequent operation is completely offline.
- **Hardware Requirements**: Local inference requires suitable hardware. A model like `qwen2.5:7b` requires approximately 5GB of GPU VRAM or 8GB of system RAM. Lighter models like `llama3.2:1b` or `smollm2` can be used on low-resource machines.
- **Regulatory Notice**: The TradeSloth Document Auditor identifies discrepancies for human audit and review; it does not replace professional customs brokerage or legal compliance counsel.
- **Scanned Images & OCR**: Image-only PDFs without text streams are identified as unreadable; optical character recognition requires a local OCR engine installation.

---

## Conclusion & Open Source Repository

SlothPilot AI demonstrates that you don't need to sacrifice privacy or take on cloud subscriptions to automate personal digital busywork. Open-weight models, coupled with strict deterministic security guardrails and clean human approval workflows, provide a robust, respectful alternative.

Explore the code, run the tests, and contribute on GitHub:
👉 **[SlothPilot AI Repository](https://github.com/your-org/slothpilot-ai)** (Licensed under MIT).
