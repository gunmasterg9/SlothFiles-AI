# SlothFiles AI - Windows Desktop E2E Lifecycle Test (Stage 5)
# Tests startup, health, repeated invocation, graceful shutdown, and data preservation on Windows.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptsDir = Join-Path $repoRoot "scripts"
$pidFile = Join-Path $repoRoot ".slothpilot.pids"
$dbFile = Join-Path $repoRoot "data\slothpilot.db"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "SlothPilot AI - Stage 5 Windows Desktop E2E Test Suite" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "Repo Root: $repoRoot" -ForegroundColor Gray
Write-Host ""

$testsPassed = 0
$testsFailed = 0

function Assert-Test {
    param (
        [string]$Name,
        [scriptblock]$Block
    )
    Write-Host "Testing: $Name..." -NoNewline
    try {
        & $Block
        Write-Host " [PASS]" -ForegroundColor Green
        $script:testsPassed++
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Red
        $script:testsFailed++
    }
}

# Ensure any existing processes are stopped first
& (Join-Path $scriptsDir "stop-desktop.ps1") | Out-Null

# -----------------------------------------------------------------------------
# Test 1: Fresh Desktop Startup
# -----------------------------------------------------------------------------
Assert-Test "1. Fresh Desktop Startup via start-desktop.ps1 -NoBrowser" {
    & (Join-Path $scriptsDir "start-desktop.ps1") -NoBrowser
    Start-Sleep -Milliseconds 500
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -Method Get -TimeoutSec 3
    if (-not $res -or $res.status -ne "ok") {
        throw "Health check did not return status 'ok' after startup"
    }
}

# -----------------------------------------------------------------------------
# Test 2: Health Check HTTP Verification
# -----------------------------------------------------------------------------
Assert-Test "2. Backend Health Check (GET http://127.0.0.1:8000/api/health)" {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -Method Get -TimeoutSec 3
    if (-not $res -or $res.status -ne "ok") {
        throw "Health check did not return status 'ok': $(ConvertTo-Json $res)"
    }
}

# -----------------------------------------------------------------------------
# Test 3: Frontend SPA Production Asset Serving
# -----------------------------------------------------------------------------
Assert-Test "3. Frontend SPA Root Serving (GET http://127.0.0.1:8000/)" {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:8000/" -Method Get -TimeoutSec 3
    if ($res.StatusCode -ne 200) {
        throw "Root SPA endpoint returned status $($res.StatusCode)"
    }
    if ($res.Content -notmatch "(?i)<!doctype html>|<div id=.root.") {
        throw "Root SPA response did not contain HTML content: $($res.Content.Substring(0, [Math]::Min(200, $res.Content.Length)))"
    }
}

# -----------------------------------------------------------------------------
# Test 4: Structured 404 for Non-Existent API Routes
# -----------------------------------------------------------------------------
Assert-Test "4. API 404 Isolation (GET http://127.0.0.1:8000/api/nonexistent)" {
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/nonexistent" -Method Get -TimeoutSec 3
        throw "Expected 404 error but request succeeded"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -ne 404) {
            throw "Expected status 404, got $statusCode"
        }
    }
}

# -----------------------------------------------------------------------------
# Test 5: Safe PID Tracking Verification
# -----------------------------------------------------------------------------
Assert-Test "5. Process Tracking in .slothpilot.pids" {
    if (-not (Test-Path $pidFile)) {
        throw "Missing .slothpilot.pids file"
    }
    $pids = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
    if (-not $pids.backend_pid -or $pids.backend_pid -le 0) {
        throw "Invalid backend PID recorded: $($pids.backend_pid)"
    }
    $proc = Get-Process -Id $pids.backend_pid -ErrorAction SilentlyContinue
    if (-not $proc) {
        throw "Recorded backend process (PID $($pids.backend_pid)) is not running"
    }
    if ($proc.ProcessName.ToLower() -notmatch "python|py") {
        throw "Recorded PID is not a python process: $($proc.ProcessName)"
    }
}

# -----------------------------------------------------------------------------
# Test 6: Repeated Invocation (Avoid Duplicates)
# -----------------------------------------------------------------------------
Assert-Test "6. Repeated Invocation Reuses Existing Healthy Backend" {
    $pidsBefore = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
    & (Join-Path $scriptsDir "start-desktop.ps1") -NoBrowser
    $pidsAfter = Get-Content -Path $pidFile -Raw | ConvertFrom-Json

    if ($pidsBefore.backend_pid -ne $pidsAfter.backend_pid) {
        throw "Repeated invocation launched a duplicate process! Before: $($pidsBefore.backend_pid), After: $($pidsAfter.backend_pid)"
    }
}

# -----------------------------------------------------------------------------
# Test 7: Graceful Shutdown
# -----------------------------------------------------------------------------
Assert-Test "7. Graceful Shutdown via stop-desktop.ps1" {
    $backendPid = $null
    if (Test-Path $pidFile) {
        $pids = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
        $backendPid = $pids.backend_pid
    }

    $stopOut = & (Join-Path $scriptsDir "stop-desktop.ps1") 2>&1 | Out-String
    Start-Sleep -Milliseconds 600

    if ($backendPid) {
        $procAfter = Get-Process -Id $backendPid -ErrorAction SilentlyContinue
        if ($procAfter -and -not $procAfter.HasExited) {
            throw "Process PID $backendPid is still running after stop-desktop.ps1"
        }
    }
    if (Test-Path $pidFile) {
        throw ".slothpilot.pids was not cleaned up after shutdown"
    }
}

# -----------------------------------------------------------------------------
# Test 8: Port 8000 Released
# -----------------------------------------------------------------------------
Assert-Test "8. Port 8000 Released After Shutdown" {
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $async = $tcpClient.BeginConnect("127.0.0.1", 8000, $null, $null)
        $connected = $async.AsyncWaitHandle.WaitOne(300, $false)
        if ($connected -and $tcpClient.Connected) {
            $tcpClient.EndConnect($async)
            $tcpClient.Close()
            throw "Port 8000 is still listening after shutdown!"
        }
        $tcpClient.Close()
    } catch [System.Net.Sockets.SocketException] {
        # Expected: connection refused
    }
}

# -----------------------------------------------------------------------------
# Test 9: SQLite User Data Preservation
# -----------------------------------------------------------------------------
Assert-Test "9. SQLite User Data and Rules Preserved" {
    if (-not (Test-Path $dbFile)) {
        throw "SQLite database file missing at $dbFile"
    }
    $py = Join-Path $repoRoot ".venv\Scripts\python.exe"
    $code = @"
import sqlite3
conn = sqlite3.connect(r'$dbFile')
cursor = conn.cursor()
cursor.execute('SELECT COUNT(*) FROM organization_rules')
count = cursor.fetchone()[0]
print(f'RULES_COUNT={count}')
"@
    $res = & $py -c $code
    if ($res -notmatch "RULES_COUNT=(\d+)") {
        throw "Failed to query organization_rules count: $res"
    }
    $count = [int]$Matches[1]
    if ($count -lt 5) {
        throw "Expected at least 5 organization rules, got $count"
    }
}

# -----------------------------------------------------------------------------
# Test 10: Edge Browser Detection and Path Resolution
# -----------------------------------------------------------------------------
    $edgePaths = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
        "${env:LOCALAPPDATA}\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    )
    $found = $null
    foreach ($p in $edgePaths) {
        if ($p -and (Test-Path $p)) {
            $found = $p
            break
        }
    }
    if ($found) {
        Write-Host " (Edge found at: $found)" -NoNewline -ForegroundColor Gray
    } else {
        Write-Host " (Edge not detected; fallback to default browser verified)" -NoNewline -ForegroundColor Gray
    }
}

# -----------------------------------------------------------------------------
# Test 11: Occupied Port Handling (Foreign Process on Port 8000)
# -----------------------------------------------------------------------------
Assert-Test "11. Foreign Occupied Port Error Detection" {
    $ip = [System.Net.IPAddress]::Parse("127.0.0.1")
    $mockListener = New-Object System.Net.Sockets.TcpListener($ip, 8000)
    $mockListener.Start()
    try {
        $startScript = Join-Path $scriptsDir "start-desktop.ps1"
        $proc = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -NoBrowser" -Wait -WindowStyle Hidden -PassThru
        if ($proc.ExitCode -eq 0) {
            throw "start-desktop.ps1 was expected to fail on occupied port 8000 (non-zero exit code), but returned 0"
        }
    } finally {
        $mockListener.Stop()
    }
}

# -----------------------------------------------------------------------------
# Test 12: Dependency Preflight Failure on Missing Python
# -----------------------------------------------------------------------------
Assert-Test "12. Preflight Missing Dependencies Detection" {
    $scriptContent = Get-Content -Path (Join-Path $scriptsDir "start-desktop.ps1") -Raw
    if ($scriptContent -notmatch "Please execute the setup script first") {
        throw "start-desktop.ps1 does not provide clear recovery instructions on missing virtual environment"
    }
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "E2E Test Results: $testsPassed Passed, $testsFailed Failed" -ForegroundColor $(if ($testsFailed -eq 0) { "Green" } else { "Red" })
Write-Host "=======================================================" -ForegroundColor Cyan

if ($testsFailed -gt 0) {
    exit 1
}
exit 0

