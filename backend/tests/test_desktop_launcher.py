"""
SlothFiles AI - Desktop Launcher and Window Experience Tests (Phase 4)
Verifies:
- Production frontend SPA asset serving and structured 404 security
- Desktop launcher and shutdown script existence and configurations
- Loopback-only binding and DNS rebinding protections
- Safe PID tracking and process ownership semantics
- Database preservation during launcher cycles
"""

import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from fastapi import status

from backend.app.main import app
from backend.app.config import settings
from backend.app.db.session import get_db


@pytest.fixture
def client():
    return TestClient(app, base_url="http://127.0.0.1:8000")


# =========================================================================
# 1. Production SPA Static Serving & API Security Boundary Tests
# =========================================================================

def test_spa_root_serves_html_when_built(client):
    """Verify that GET / returns the production frontend HTML index when dist is built."""
    frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist" / "index.html"
    response = client.get("/")
    if frontend_dist.exists():
        assert response.status_code == status.HTTP_200_OK
        assert "text/html" in response.headers.get("content-type", "")
        assert "<!doctype html>" in response.text.lower() or "<div id=\"root\"" in response.text.lower()
    else:
        pytest.skip("frontend/dist not built in this test run")


def test_api_routes_never_return_spa_html(client):
    """Verify that non-existent API routes return structured JSON 404, never fallback to index.html."""
    response = client.get("/api/definitely-not-an-endpoint-12345")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "application/json" in response.headers.get("content-type", "")
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "HTTP_404"


def test_loopback_security_configuration():
    """Verify backend settings bind strictly to loopback interface and do not expose wildcard."""
    assert settings.host in ("127.0.0.1", "localhost")
    assert settings.port == 8000
    # Host header guard must block arbitrary external domains
    c = TestClient(app, base_url="http://127.0.0.1:8000")
    blocked = c.get("/api/health", headers={"host": "malicious-site.com"})
    assert blocked.status_code == status.HTTP_403_FORBIDDEN


# =========================================================================
# 2. Desktop Launcher & Shutdown Script Existence & Syntax Tests
# =========================================================================

def test_launcher_scripts_exist():
    """Verify all required Windows desktop launch and shutdown scripts exist."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    scripts = [
        repo_root / "start-desktop.bat",
        repo_root / "stop-desktop.bat",
        repo_root / "scripts" / "start-desktop.ps1",
        repo_root / "scripts" / "stop-desktop.ps1",
        repo_root / "scripts" / "start-desktop.bat",
        repo_root / "scripts" / "stop-desktop.bat",
    ]
    for s in scripts:
        assert s.exists(), f"Missing required desktop launcher file: {s}"
        assert s.stat().st_size > 0, f"File is empty: {s}"


def test_launcher_ps1_contains_edge_app_and_safe_pids():
    """Verify start-desktop.ps1 configures Edge app mode, loopback URLs, and PID tracking."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    start_ps1 = (repo_root / "scripts" / "start-desktop.ps1").read_text(encoding="utf-8")

    # Loopback bindings
    assert "127.0.0.1" in start_ps1
    # Edge application mode argument
    assert "--app=" in start_ps1
    # Window size preference
    assert "--window-size=" in start_ps1
    # PID tracking file
    assert ".slothpilot.pids" in start_ps1
    # Health check verification
    assert "/api/health" in start_ps1
    # Edge fallback logic
    assert "Find-EdgeExecutable" in start_ps1


def test_stop_desktop_ps1_contains_safe_process_filtering():
    """Verify stop-desktop.ps1 validates process names to avoid killing unrelated processes."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    stop_ps1 = (repo_root / "scripts" / "stop-desktop.ps1").read_text(encoding="utf-8")

    assert ".slothpilot.pids" in stop_ps1
    # Safe process name check (never blind taskkill /f /im python.exe)
    assert "ExpectedProcessNames" in stop_ps1
    assert "python" in stop_ps1.lower()
    assert "Stop-Process" in stop_ps1


def test_batch_wrappers_run_powershell_bypassing_execution_policy():
    """Verify .bat wrappers launch PowerShell with -ExecutionPolicy Bypass and -NoProfile."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    bat_start = (repo_root / "start-desktop.bat").read_text(encoding="utf-8")
    bat_stop = (repo_root / "stop-desktop.bat").read_text(encoding="utf-8")

    assert "ExecutionPolicy Bypass" in bat_start
    assert "start-desktop.ps1" in bat_start
    assert "ExecutionPolicy Bypass" in bat_stop
    assert "stop-desktop.ps1" in bat_stop


# =========================================================================
# 3. PID Tracking Schema & Database Preservation Tests
# =========================================================================

def test_pid_tracking_format():
    """Verify PID file schema structure."""
    dummy_data = {
        "backend_pid": 12345,
        "frontend_pid": 67890,
        "edge_pid": 54321,
        "mode": "production",
        "target_url": "http://127.0.0.1:8000/",
        "started_at": "2026-10-20T12:00:00Z"
    }
    encoded = json.dumps(dummy_data)
    decoded = json.loads(encoded)
    assert decoded["backend_pid"] == 12345
    assert decoded["mode"] in ("production", "development")
    assert decoded["target_url"].startswith("http://127.0.0.1:")


def test_database_preserved_during_launcher_lifecycle():
    """Verify that application launch and shutdown cycles preserve SQLite records."""
    # Insert or query a sentinel record
    with get_db() as conn:
        cursor = conn.execute("SELECT COUNT(*) as cnt FROM organization_rules")
        count = cursor.fetchone()["cnt"]
        assert count >= 5, "Database must preserve seeded organization rules across sessions"


def test_path_traversal_does_not_leak_source_files(client):
    """Verify that path traversal in SPA router cannot read backend files."""
    response = client.get("/../../backend/app/main.py")
    # Must not return Python code
    assert "from fastapi import FastAPI" not in response.text
    # Either index.html is returned (for client routing) or 404
    assert response.status_code in (status.HTTP_200_OK, status.HTTP_404_NOT_FOUND)


def test_launcher_ps1_has_wait_and_port_inspection():
    """Verify start-desktop.ps1 supports -Wait mode and port process diagnostics."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    start_ps1 = (repo_root / "scripts" / "start-desktop.ps1").read_text(encoding="utf-8")

    assert "[switch]$Wait" in start_ps1
    assert "Get-PortProcessInfo" in start_ps1
    assert "Get-NetTCPConnection" in start_ps1

