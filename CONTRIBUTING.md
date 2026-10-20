# Contributing to SlothPilot AI

Thank you for your interest in contributing to **SlothPilot AI**! We welcome community contributions, bug reports, feature requests, and documentation improvements.

---

## 🦥 Core Architectural Values

SlothPilot AI is built upon non-negotiable principles:

1. **Offline-First & Local AI**: We rely exclusively on open-weight local inference (Ollama) and local SQLite storage. No cloud fallbacks, no telemetry, and no mandatory internet connections after initial setup.
2. **Deterministic Precedence**: AI models propose suggestions, but deterministic verification rules govern execution. Critical operations (financial math, exact SHA-256 duplicate detection, document diffs) always use deterministic code.
3. **Approval Lifecycle**: The AI model and automation tasks never make consequential filesystem changes without explicit user approval.
4. **Security by Default**:
   - Loopback-only binding (`127.0.0.1`).
   - Strict confinement to user-approved filesystem roots.
   - Host header validation to prevent DNS rebinding.
   - Append-only audit history enforced by SQLite database triggers.

---

## 🛠️ Development Setup

### Prerequisites

- **Python 3.12+**
- **Node.js v18+** and **npm**
- **Ollama** (optional for AI features; deterministic workflows function without it)

### Quick Start

1. Clone the repository:
   ```powershell
   git clone https://github.com/your-org/slothpilot-ai.git
   cd slothpilot-ai
   ```

2. Run automated environment setup:
   ```powershell
   .\scripts\setup.ps1
   ```

3. Launch backend and frontend development servers:
   ```powershell
   .\scripts\start.ps1
   ```

4. Verify your setup:
   ```powershell
   .\scripts\verify.ps1
   ```

---

## 🧪 Testing Guidelines

Every change must include automated tests. We do not accept PRs with broken or missing tests:

- **Backend Tests**: Run pytest across all test modules:
  ```powershell
  .venv\Scripts\python.exe -m pytest backend/tests/ -v
  ```
- **Frontend Build**: Ensure TypeScript and Vite compile cleanly:
  ```powershell
  cd frontend
  npm run build
  ```
- **Full Verification**: Run the automated verification script:
  ```powershell
  .\scripts\verify.ps1
  ```

---

## 🔒 Security Policy

If you identify a potential security issue (path traversal bypass, unapproved file mutation, DNS rebinding vulnerability), please report it responsibly by opening a private security advisory on GitHub or emailing the maintainers. Do not disclose vulnerabilities publicly before a fix is released.

---

## 🎃 Hacktoberfest Participation

SlothPilot AI participates in open-source celebrations like Hacktoberfest! When submitting a PR:
- Clearly describe the problem and solution in your PR description.
- Reference related issue numbers.
- Ensure all CI tests and verification checks pass cleanly.
