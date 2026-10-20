# SlothPilot AI: Testing & Acceptance Guide

SlothPilot AI enforces a strict policy: **No feature is marked complete without automated test evidence.**

---

## 1. Test Architecture

The test suite is structured around pytest for the backend and Vite/TypeScript for the frontend. Tests use temporary directories (`tmp_path`) and synthetic fixtures to ensure user directories (Downloads, Documents) are never touched during test execution.

```
backend/tests/
├── test_health.py                     # Health, readiness, host guard, 404 handler (4 tests)
├── test_database_and_audit.py         # Migrations, append-only triggers, pagination (3 tests)
├── test_document_extractor.py         # Multi-format text extraction (5 tests)
├── test_path_security.py              # Root approvals, traversal, UNC blocking (4 tests)
├── test_settings_and_audit_api.py     # Settings, models, and audit API routes (3 tests)
├── test_organizer_and_approvals.py    # Duplicate detection, approvals lifecycle, undo (5 tests)
├── test_tasks_and_watcher.py          # Task state machine, watcher debounce, loop prevention (4 tests)
├── test_inbox.py                      # Notes/email import, dates, prompt injection defense (4 tests)
├── test_tradesloth.py                 # Multi-doc audit, decimal math, markdown export (4 tests)
├── test_copilot.py                    # Tool registry schemas, sessions, deterministic fallbacks (5 tests)
├── test_security_hardening.py         # Symlinks, case-sensitivity, collisions, offline suite (8 tests)
└── test_ollama_service.py             # Live Ollama discovery, model selection, offline handling (4 tests)
Total: 53 tests
```

---

## 2. Running Tests

### Running the Entire Test Suite
```powershell
.venv\Scripts\python.exe -m pytest backend/tests/ -v
```

### Running Specific Test Modules
```powershell
# Run security and offline tests
.venv\Scripts\python.exe -m pytest backend/tests/test_security_hardening.py -v

# Run TradeSloth auditor tests
.venv\Scripts\python.exe -m pytest backend/tests/test_tradesloth.py -v

# Run Local Copilot tests
.venv\Scripts\python.exe -m pytest backend/tests/test_copilot.py -v
```

### Frontend Build Verification
```powershell
cd frontend
cmd.exe /c "npm.cmd run build"
```

### End-to-End Automated Verification
```powershell
.\scripts\verify.ps1
```

---

## 3. Acceptance Verification Criteria

All 17 acceptance requirements from the specification are verified:

1. ✅ **Backend health**: `/api/health` and `/api/ready` return valid JSON on loopback.
2. ✅ **Frontend build**: TypeScript and Vite compile with 0 errors into `frontend/dist/`.
3. ✅ **Ollama discovery**: Live model listing reflects installed local models.
4. ✅ **File scanning**: Scanning returns accurate metadata and document text.
5. ✅ **Duplicate detection**: SHA-256 streaming hash accurately flags exact duplicate files.
6. ✅ **AI classification**: Allowlisted category classification works with fallback handling.
7. ✅ **Approval queue**: Proposed operations appear in the pending queue without making changes.
8. ✅ **Rejection safety**: Rejected plans leave the filesystem completely untouched.
9. ✅ **Approved execution**: Approved plans move files to target directories.
10. ✅ **Safe undo**: Undo reverses file moves and restores original state.
11. ✅ **Folder watcher**: Watchdog monitors folders without duplicate processing loops.
12. ✅ **Inbox extraction**: Summaries, obligations, and date evidence extracted with quotes.
13. ✅ **Shipment discrepancies**: Exact `Decimal` arithmetic flags cross-document variances.
14. ✅ **Copilot tool permissions**: Tools reject unauthorized operations and arbitrary command execution.
15. ✅ **Audit history**: SQLite triggers ensure immutable append-only history.
16. ✅ **Offline verification**: Full offline operation verified with synthetic folder and local inference.
17. ✅ **No regressions**: All 53 tests pass consecutively.
