# SlothFiles AI - Desktop Launcher Script (Phase 4)
# Starts FastAPI backend (and optionally Vite dev server), monitors health,
# and opens the application in a standalone Microsoft Edge app window.

[CmdletBinding()]
param (
    [switch]$Dev,
    [switch]$NoBrowser,
    [switch]$ForceBrowser,
    [switch]$Wait,
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"

# 1. Reliable Repository Root Resolution
$scriptDirectory = Split-Path -Parent $PSScriptRoot
if (Test-Path (Join-Path $scriptDirectory "backend\app\main.py")) {
    $repoRoot = $scriptDirectory
} elseif (Test-Path (Join-Path $PSScriptRoot "backend\app\main.py")) {
    $repoRoot = $PSScriptRoot
} else {
    $repoRoot = (Get-Item -Path $PSScriptRoot).Parent.FullName
}

$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
$logsDir = Join-Path $repoRoot ".logs"
$pidFile = Join-Path $repoRoot ".slothpilot.pids"
$frontendDir = Join-Path $repoRoot "frontend"
$frontendDist = Join-Path $repoRoot "frontend\dist\index.html"

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "        SlothPilot AI - Desktop Launcher (MVP)         " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "Repository Root: $repoRoot" -ForegroundColor Gray
Write-Host "Launcher Mode:   $(if ($Dev) { 'Development (Vite + FastAPI)' } else { 'Production (FastAPI Bundle)' })" -ForegroundColor Gray
Write-Host ""

# Ensure logs directory exists
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

# 2. Dependency Preflight Verification
Write-Host "[1/4] Verifying dependencies and runtime environment..." -ForegroundColor Yellow

if (-not (Test-Path $venvPython)) {
    Write-Host ""
    Write-Host "[ERROR] Python virtual environment not found at .venv." -ForegroundColor Red
    Write-Host "        Please execute the setup script first: .\scripts\setup.ps1" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

if (-not $Dev) {
    # Check if production bundle is built
    if (-not (Test-Path $frontendDist)) {
        Write-Host "      [NOTICE] Compiled frontend distribution not found at frontend\dist." -ForegroundColor DarkYellow
        Write-Host "               Attempting to build production bundle now..." -ForegroundColor Yellow
        Push-Location $frontendDir
        try {
            cmd.exe /c "npm.cmd run build"
            if ($LASTEXITCODE -ne 0 -or -not (Test-Path $frontendDist)) {
                Write-Host "[ERROR] Frontend build failed. Run 'cd frontend && npm run build' manually." -ForegroundColor Red
                exit 1
            }
            Write-Host "      [OK] Frontend production bundle compiled successfully." -ForegroundColor Green
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "      [OK] Frontend production bundle verified." -ForegroundColor Green
    }
} else {
    # In dev mode, check node_modules
    $nodeModules = Join-Path $frontendDir "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Host "[ERROR] frontend\node_modules not found. Run .\scripts\setup.ps1 first." -ForegroundColor Red
        exit 1
    }
    Write-Host "      [OK] Development environment verified." -ForegroundColor Green
}

# Helper function to check if port is occupied
function Test-PortOccupied {
    param ([int]$Port)
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $asyncResult = $tcpClient.BeginConnect("127.0.0.1", $Port, $null, $null)
        $waitSuccess = $asyncResult.AsyncWaitHandle.WaitOne(350, $false)
        if ($waitSuccess -and $tcpClient.Connected) {
            $tcpClient.EndConnect($asyncResult)
            $tcpClient.Close()
            return $true
        }
        $tcpClient.Close()
        return $false
    } catch {
        return $false
    }
}

# Helper function to inspect process holding a port
function Get-PortProcessInfo {
    param ([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn -and $conn.OwningProcess) {
            $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($p) {
                return "$($p.ProcessName) (PID $($conn.OwningProcess))"
            }
            return "PID $($conn.OwningProcess)"
        }
    } catch {}
    return "Unknown process"
}

# Helper function to test SlothPilot health endpoint
function Test-SlothPilotHealth {
    param ([string]$BaseUrl)
    try {
        $healthUrl = "$BaseUrl/api/health"
        $res = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 1 -ErrorAction SilentlyContinue
        return ($res -and $res.status -eq "ok")
    } catch {
        return $false
    }
}

# 3. Start or Reuse FastAPI Backend
Write-Host "[2/4] Checking backend service status on 127.0.0.1:$BackendPort..." -ForegroundColor Yellow
$backendBaseUrl = "http://127.0.0.1:$BackendPort"
$backendPid = $null
$backendProc = $null
$backendStartedByLauncher = $false

if (Test-PortOccupied -Port $BackendPort) {
    if (Test-SlothPilotHealth -BaseUrl $backendBaseUrl) {
        Write-Host "      [OK] SlothPilot AI backend is already running on $backendBaseUrl." -ForegroundColor Green
        Write-Host "           Reusing existing backend instance (no duplicate process created)." -ForegroundColor Gray
    } else {
        $procInfo = Get-PortProcessInfo -Port $BackendPort
        Write-Host ""
        Write-Host "[ERROR] Port $BackendPort is occupied by another process: $procInfo." -ForegroundColor Red
        Write-Host "        Please free port $BackendPort before launching SlothPilot AI." -ForegroundColor Yellow
        Write-Host ""
        exit 1
    }
} else {
    Write-Host "      Starting new FastAPI backend on $backendBaseUrl..." -ForegroundColor Gray
    $backendLog = Join-Path $logsDir "backend.log"
    $backendErrLog = Join-Path $logsDir "backend_err.log"

    $backendProc = Start-Process -FilePath $venvPython `
        -ArgumentList "-m uvicorn backend.app.main:app --host 127.0.0.1 --port $BackendPort --log-level info" `
        -WorkingDirectory $repoRoot `
        -RedirectStandardOutput $backendLog `
        -RedirectStandardError $backendErrLog `
        -WindowStyle Hidden `
        -PassThru

    $backendPid = $backendProc.Id
    $backendStartedByLauncher = $true
    Write-Host "      [OK] Backend started (PID $backendPid). Logs: .logs\backend.log" -ForegroundColor Green
}

# 4. Start Frontend Dev Server (only if -Dev switch is supplied)
$frontendPid = $null
$frontendProc = $null
$frontendStartedByLauncher = $false
if ($Dev) {
    Write-Host "[3/4] Starting frontend development server on 127.0.0.1:$FrontendPort..." -ForegroundColor Yellow
    if (Test-PortOccupied -Port $FrontendPort) {
        $procInfo = Get-PortProcessInfo -Port $FrontendPort
        Write-Host "      [OK] Port $FrontendPort is already active ($procInfo). Reusing server." -ForegroundColor Green
    } else {
        $frontendLog = Join-Path $logsDir "frontend.log"
        $frontendErrLog = Join-Path $logsDir "frontend_err.log"

        $frontendProc = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c `"npm.cmd run dev -- --host 127.0.0.1 --port $FrontendPort`"" `
            -WorkingDirectory $frontendDir `
            -RedirectStandardOutput $frontendLog `
            -RedirectStandardError $frontendErrLog `
            -WindowStyle Hidden `
            -PassThru

        $frontendPid = $frontendProc.Id
        $frontendStartedByLauncher = $true
        Write-Host "      [OK] Frontend dev server started (PID $frontendPid). Logs: .logs\frontend.log" -ForegroundColor Green
    }

    # Wait for dev server to start listening
    Write-Host "      Waiting for frontend dev server..." -ForegroundColor Gray
    $devReady = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 400
        if (Test-PortOccupied -Port $FrontendPort) {
            $devReady = $true
            break
        }
    }
    if ($devReady) {
        Write-Host "      [OK] Frontend dev server confirmed ready." -ForegroundColor Green
    } else {
        Write-Host "      [WARNING] Frontend dev server did not bind to port within timeout." -ForegroundColor DarkYellow
    }
} else {
    Write-Host "[3/4] Using production bundle served directly by FastAPI backend." -ForegroundColor Green
}

# 5. Wait for Health Confirmation
Write-Host "Waiting for backend health check..." -ForegroundColor Gray
$maxTries = 30
$backendReady = $false
for ($i = 0; $i -lt $maxTries; $i++) {
    Start-Sleep -Milliseconds 400
    if (Test-SlothPilotHealth -BaseUrl $backendBaseUrl) {
        $backendReady = $true
        break
    }
}

if (-not $backendReady) {
    Write-Host ""
    Write-Host "[ERROR] Backend service failed to respond to health check within timeout." -ForegroundColor Red
    Write-Host "        Inspect recent logs at: .logs\backend.log" -ForegroundColor Yellow
    if ($backendStartedByLauncher -and $backendPid) {
        Stop-Process -Id $backendPid -Force -ErrorAction SilentlyContinue
    }
    if ($frontendStartedByLauncher -and $frontendPid) {
        Stop-Process -Id $frontendPid -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

# 6. Save Process Tracking File
$existingPids = $null
if (Test-Path $pidFile) {
    try {
        $existingPids = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
    } catch {}
}

$trackedBackendPid = if ($backendStartedByLauncher) { $backendPid } elseif ($existingPids -and $existingPids.backend_pid) { $existingPids.backend_pid } else { $null }
$trackedFrontendPid = if ($frontendStartedByLauncher) { $frontendPid } elseif ($existingPids -and $existingPids.frontend_pid) { $existingPids.frontend_pid } else { $null }

if (-not $trackedBackendPid) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn -and $conn.OwningProcess) {
            $trackedBackendPid = [int]$conn.OwningProcess
        }
    } catch {}
}

$targetAppUrl = if ($Dev) { "http://127.0.0.1:$FrontendPort" } else { "http://127.0.0.1:$BackendPort/" }

# Find Edge Executable
function Find-EdgeExecutable {
    $candidates = [System.Collections.Generic.List[string]]::new()
    $pf86 = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ProgramFilesX86)
    if ($pf86) { $candidates.Add((Join-Path $pf86 "Microsoft\Edge\Application\msedge.exe")) }
    $pf = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ProgramFiles)
    if ($pf) { $candidates.Add((Join-Path $pf "Microsoft\Edge\Application\msedge.exe")) }
    $localApp = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData)
    if ($localApp) { $candidates.Add((Join-Path $localApp "Microsoft\Edge\Application\msedge.exe")) }
    $candidates.Add("C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
    $candidates.Add("C:\Program Files\Microsoft\Edge\Application\msedge.exe")

    foreach ($cand in $candidates) {
        if ($cand -and (Test-Path $cand)) {
            return $cand
        }
    }
    $cmd = Get-Command msedge.exe -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }
    return $null
}

# 7. Launch Desktop Window
Write-Host "[4/4] Launching desktop application window..." -ForegroundColor Yellow
$edgePid = $null

if (-not $NoBrowser) {
    $edgeExe = if ($ForceBrowser) { $null } else { Find-EdgeExecutable }
    if ($edgeExe) {
        Write-Host "      [OK] Opening Edge standalone application window..." -ForegroundColor Green
        $edgeProcess = Start-Process -FilePath $edgeExe -ArgumentList "--app=`"$targetAppUrl`"", "--window-size=1280,840" -PassThru
        $edgePid = $edgeProcess.Id
    } else {
        Write-Host "      [INFO] Microsoft Edge was not found or -ForceBrowser was specified." -ForegroundColor Yellow
        Write-Host "             Opening application in your default web browser." -ForegroundColor Gray
        Start-Process $targetAppUrl
    }
}

# Record launcher metadata
$pidsData = @{
    backend_pid = $trackedBackendPid
    frontend_pid = $trackedFrontendPid
    edge_pid = $edgePid
    mode = if ($Dev) { "development" } else { "production" }
    target_url = $targetAppUrl
    started_at = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json

Set-Content -Path $pidFile -Value $pidsData

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "SlothPilot AI Desktop is running!" -ForegroundColor Cyan
Write-Host "   Application URL:   $targetAppUrl" -ForegroundColor Green
Write-Host "   Backend API Docs:  $backendBaseUrl/docs" -ForegroundColor Green
Write-Host "   Health Status:     OK (http://127.0.0.1:$BackendPort/api/health)" -ForegroundColor Green
Write-Host ""
Write-Host "Note: Closing the Edge window leaves the backend active in background mode." -ForegroundColor DarkGray
Write-Host "To shut down:  powershell -ExecutionPolicy Bypass -File .\scripts\stop-desktop.ps1" -ForegroundColor Yellow
Write-Host "              or double-click stop-desktop.bat" -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# 8. Optional Attached Console Wait Mode
if ($Wait) {
    Write-Host "Running in attached mode. Press 'Q' or Ctrl+C to stop SlothPilot AI..." -ForegroundColor Cyan
    try {
        while ($true) {
            Start-Sleep -Milliseconds 500
            try {
                if ([Console]::KeyAvailable) {
                    $key = [Console]::ReadKey($true)
                    if ($key.Key -eq [ConsoleKey]::Q) {
                        Write-Host ""
                        Write-Host "Stopping SlothPilot AI Desktop..." -ForegroundColor Yellow
                        break
                    }
                }
            } catch {
                # Non-interactive fallback
                if ($backendStartedByLauncher -and $backendProc -and $backendProc.HasExited) {
                    break
                }
            }
        }
    } finally {
        $stopScript = Join-Path $PSScriptRoot "stop-desktop.ps1"
        if (Test-Path $stopScript) {
            & $stopScript
        }
    }
}
