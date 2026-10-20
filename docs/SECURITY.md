# SlothPilot AI: Security Policy & Threat Model

SlothPilot AI is designed for privacy-conscious automation of personal files and documents on local machines. This document outlines our threat model, defensive controls, and verification mechanisms.

---

## 1. Threat Model & Trust Assumptions

### Untrusted Entities
1. **Document Contents**: Text inside uploaded PDFs, DOCX, XLSX, TXT, and EML files may contain prompt injections, malicious macro references, or instructions attempting to manipulate the language model.
2. **Untrusted Origins**: Web pages visited in user browsers could attempt cross-origin requests or DNS-rebinding attacks against local ports (`8000`, `5173`).
3. **Model Outputs**: Open-weight language models may hallucinate, output invalid formats, or propose invalid tools or paths. All model outputs are treated as untrusted suggestions.

### Trusted Boundaries
1. **User Approvals**: Explicit human consent is required before any consequential file move, rename, or deletion occurs.
2. **Local Operating System**: Process-level access and file permissions on Windows 11.

---

## 2. Security Controls & Mitigations

### 2.1 Filesystem Isolation & Path Traversal Defense
- **Approved Roots Enforcement**: Users explicitly register directories they want SlothPilot to access. Any operation attempting to read, scan, or move files outside approved roots is rejected with `403 Forbidden`.
- **Traversal Tokens**: Any path containing `..`, `/../`, or `\..\` is rejected before path resolution.
- **UNC Paths**: Windows UNC paths (`\\server\share`) are rejected to prevent NetNTLM hash leaks.
- **Symlink Escapes**: Paths are resolved to their physical canonical locations using `.resolve()`. If a symlink inside an approved folder points to an external file, it is blocked.
- **Case-Insensitive Normalization**: Windows path comparisons are normalized to prevent casing-based bypasses.

### 2.2 TOCTOU & Approval Race Condition Defense
- **Hash-Bound Plans**: When a plan is created, every source file is hashed with SHA-256.
- **Precondition Revalidation**: Immediately before executing an approved plan:
  1. The source file must exist.
  2. The current SHA-256 hash must match the hash recorded at preview time. If the file was modified, execution aborts with `409 Conflict`.
  3. The destination file must not exist. If a collision is detected, execution aborts with `409 Conflict` (silent overwriting is blocked).
  4. The destination directory must lie within approved roots.
- **Stale Token Rejection**: Approvals are single-use. Re-approving or rejecting an already completed or rejected plan fails with `400 Bad Request`.

### 2.3 Network & Loopback Defense
- **Strict Loopback Binding**: The backend and frontend bind exclusively to `127.0.0.1`. Binding to `0.0.0.0` is prohibited in production code.
- **Host Header Verification**: ASGI middleware checks the `Host` header on all requests. Requests with foreign hosts (e.g., DNS rebinding attacks) are rejected with `403 Forbidden`.
- **Narrow CORS**: Allowed origins are restricted strictly to loopback dashboard addresses (`http://127.0.0.1:5173`).

### 2.4 Immutable Audit Logging
- **Database Triggers**: The SQLite database schema includes triggers:
  ```sql
  CREATE TRIGGER IF NOT EXISTS prevent_audit_logs_update
  BEFORE UPDATE ON audit_logs
  BEGIN
      SELECT RAISE(ABORT, 'Audit logs are append-only. UPDATE operations are forbidden.');
  END;

  CREATE TRIGGER IF NOT EXISTS prevent_audit_logs_delete
  BEFORE DELETE ON audit_logs
  BEGIN
      SELECT RAISE(ABORT, 'Audit logs are append-only. DELETE operations are forbidden.');
  END;
  ```
- Any direct SQL attempt to tamper with or erase audit logs results in a database exception.

### 2.5 Local AI Sandboxing & Injection Resilience
- **Strict Tool Permissions**: Copilot tools are classified as `READ_ONLY` or `PROPOSE_PLAN`. Proposing an action routes to the approval queue. Direct command execution, shell execution, or unrestricted filesystem access is blocked.
- **Deterministic Precedence**: Critical workflows (duplicate hashing, TradeSloth decimal math) are executed with deterministic algorithms. AI is never trusted for exact calculations.
- **Prompt Injection Defense**: Ingested document text is formatted in isolated evidence blocks; the system prompt strictly instructs the model to ignore user impersonation instructions inside document text.

---

## 3. Reporting Vulnerabilities

If you discover a security vulnerability in SlothPilot AI, please open a confidential advisory on GitHub or email the security maintainers. Provide:
1. Description of the vulnerability and attack vector.
2. Steps to reproduce.
3. Potential impact.

We respond to security disclosures within 48 hours.
