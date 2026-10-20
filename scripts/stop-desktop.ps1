# SlothFiles AI - Desktop Shutdown Script (Phase 4)
# Safely terminates only the backend and frontend processes started by SlothPilot.
# Preserves SQLite database records, settings, and unrelated user processes.

[CmdletBinding()]
param (
    [switch]$Force
)

$ErrorActionPreference = "SilentlyContinue"

# 1. Resolve Repository Root
$scriptDirectory = Split-Path -Parent $PSScriptRoot
if (Test-Path (Join-Path $scriptDirectory "backend\app\main.py")) {
    $repoRoot = $scriptDirectory
} elseif (Test-Path (Join-Path $PSScriptRoot "backend\app\main.py")) {
    $repoRoot = $PSScriptRoot
} else {
    $repoRoot = (Get-Item -Path $PSScriptRoot).Parent.FullName
}

$pidFile = Join-Path $repoRoot ".slothpilot.pids"

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "        SlothPilot AI - Shutting Down Desktop          " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $pidFile)) {
    Write-Host "[INFO] No active .slothpilot.pids record found." -ForegroundColor Yellow
    Write-Host "       Checking loopback ports for remaining SlothPilot instances..." -ForegroundColor Gray

    # Fallback: check if backend is running on 8000
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -Method Get -TimeoutSec 1 -ErrorAction SilentlyContinue
        if ($res -and $res.status -eq "ok") {
            Write-Host "[WARNING] A SlothPilot instance is running on http://127.0.0.1:8000 without PID record." -ForegroundColor Yellow
            Write-Host "          To safely stop it, find its process or restart your terminal." -ForegroundColor Gray
        }
    } catch {}

    Write-Host "[OK] Clean shutdown complete." -ForegroundColor Green
    Write-Host ""
    exit 0
}

# 2. Parse PID tracking file
try {
    $pidsContent = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
} catch {
    Write-Host "[WARNING] Could not parse .slothpilot.pids file. Removing stale record." -ForegroundColor Yellow
    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
    exit 0
}

# 3. Stop Specific Processes Gracefully
function Stop-TrackedProcess {
    param (
        [int]$ProcessId,
        [string]$ProcessName,
        [string[]]$ExpectedProcessNames
    )

    if ($ProcessId -le 0) {
        return
    }

    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $proc) {
        Write-Host "      [INFO] $ProcessName (PID $ProcessId) is already stopped." -ForegroundColor Gray
        return
    }

    # Verify process identity so we never terminate an unrelated recycled PID
    $actualName = $proc.ProcessName.ToLower()
    $matchesExpected = $false
    foreach ($expected in $ExpectedProcessNames) {
        if ($actualName -like "*$($expected.ToLower())*") {
            $matchesExpected = $true
            break
        }
    }

    if (-not $matchesExpected) {
        Write-Host "      [SKIP] PID $ProcessId is named '$actualName' (not matching expected $ProcessName). Skipping to protect unrelated application." -ForegroundColor Yellow
        return
    }

    Write-Host "Stopping $ProcessName (PID $ProcessId)..." -ForegroundColor Yellow
    try {
        # First attempt graceful stop
        $proc.CloseMainWindow() | Out-Null
        Start-Sleep -Milliseconds 250
        if (-not $proc.HasExited) {
            Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
        }
        Write-Host "      [OK] $ProcessName stopped safely." -ForegroundColor Green
    } catch {
        Write-Host "      [WARNING] Could not cleanly terminate $ProcessName (PID $ProcessId): $_" -ForegroundColor DarkYellow
    }
}

if ($pidsContent -and $pidsContent.backend_pid) {
    Stop-TrackedProcess -ProcessId $pidsContent.backend_pid -ProcessName "FastAPI Backend" -ExpectedProcessNames @("python", "py")
}

if ($pidsContent -and $pidsContent.frontend_pid) {
    Stop-TrackedProcess -ProcessId $pidsContent.frontend_pid -ProcessName "Vite Frontend Dev Server" -ExpectedProcessNames @("node", "cmd")
}

# Fallback check: if port 8000 is still active with a SlothPilot instance, safely stop it
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -Method Get -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($res -and $res.status -eq "ok") {
        $conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn -and $conn.OwningProcess) {
            Stop-TrackedProcess -ProcessId $conn.OwningProcess -ProcessName "FastAPI Backend" -ExpectedProcessNames @("python", "py")
        }
    }
} catch {}

# Remove PID file
Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue


Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "SlothPilot AI services have been stopped safely." -ForegroundColor Green
Write-Host "SQLite database records and user settings are preserved." -ForegroundColor Gray
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""
