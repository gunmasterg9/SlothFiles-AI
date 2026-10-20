# SlothPilot AI - Start Script
# Launches backend and frontend on loopback (127.0.0.1), records PIDs, and captures logs.

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
$logsDir = Join-Path $repoRoot ".logs"
$pidFile = Join-Path $repoRoot ".slothpilot.pids"

if (-not (Test-Path $venvPython)) {
    Write-Error "Virtual environment not found. Please run .\scripts\setup.ps1 first."
}

if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "Starting SlothPilot AI Services on Loopback (127.0.0.1)..." -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Start Backend FastAPI
$backendLog = Join-Path $logsDir "backend.log"
Write-Host "[1/2] Starting Backend service on http://127.0.0.1:8000..." -ForegroundColor Yellow

$backendStartInfo = New-Object System.Diagnostics.ProcessStartInfo
$backendStartInfo.FileName = $venvPython
$backendStartInfo.Arguments = "-m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --log-level info"
$backendStartInfo.WorkingDirectory = $repoRoot
$backendStartInfo.RedirectStandardOutput = $true
$backendStartInfo.RedirectStandardError = $true
$backendStartInfo.UseShellExecute = $false
$backendStartInfo.CreateNoWindow = $true

$backendProcess = New-Object System.Diagnostics.Process
$backendProcess.StartInfo = $backendStartInfo
$backendProcess.Start() | Out-Null

Register-ObjectEvent -InputObject $backendProcess -EventName "OutputDataReceived" -Action {
    if ($EventArgs.Data) { Add-Content -Path $using:backendLog -Value $EventArgs.Data }
} | Out-Null
Register-ObjectEvent -InputObject $backendProcess -EventName "ErrorDataReceived" -Action {
    if ($EventArgs.Data) { Add-Content -Path $using:backendLog -Value $EventArgs.Data }
} | Out-Null
$backendProcess.BeginOutputReadLine()
$backendProcess.BeginErrorReadLine()

Write-Host "      [OK] Backend started with PID $($backendProcess.Id). Logs: .logs\backend.log" -ForegroundColor Green

# 2. Start Frontend Vite Dev Server
$frontendLog = Join-Path $logsDir "frontend.log"
$frontendDir = Join-Path $repoRoot "frontend"
Write-Host "[2/2] Starting Frontend dashboard on http://127.0.0.1:5173..." -ForegroundColor Yellow

$frontendStartInfo = New-Object System.Diagnostics.ProcessStartInfo
$frontendStartInfo.FileName = "cmd.exe"
$frontendStartInfo.Arguments = '/c "npm.cmd run dev -- --host 127.0.0.1 --port 5173"'
$frontendStartInfo.WorkingDirectory = $frontendDir
$frontendStartInfo.RedirectStandardOutput = $true
$frontendStartInfo.RedirectStandardError = $true
$frontendStartInfo.UseShellExecute = $false
$frontendStartInfo.CreateNoWindow = $true

$frontendProcess = New-Object System.Diagnostics.Process
$frontendProcess.StartInfo = $frontendStartInfo
$frontendProcess.Start() | Out-Null

Register-ObjectEvent -InputObject $frontendProcess -EventName "OutputDataReceived" -Action {
    if ($EventArgs.Data) { Add-Content -Path $using:frontendLog -Value $EventArgs.Data }
} | Out-Null
Register-ObjectEvent -InputObject $frontendProcess -EventName "ErrorDataReceived" -Action {
    if ($EventArgs.Data) { Add-Content -Path $using:frontendLog -Value $EventArgs.Data }
} | Out-Null
$frontendProcess.BeginOutputReadLine()
$frontendProcess.BeginErrorReadLine()

Write-Host "      [OK] Frontend started with PID $($frontendProcess.Id). Logs: .logs\frontend.log" -ForegroundColor Green

# Save PIDs to file
$pidsData = @{
    backend_pid = $backendProcess.Id
    frontend_pid = $frontendProcess.Id
    started_at = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json

Set-Content -Path $pidFile -Value $pidsData

# 3. Wait for Health Check
Write-Host ""
Write-Host "Waiting for backend health confirmation..." -ForegroundColor Gray
$maxRetries = 20
$ready = $false
for ($i = 0; $i -lt $maxRetries; $i++) {
    Start-Sleep -Milliseconds 600
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -Method Get -TimeoutSec 1 -ErrorAction SilentlyContinue
        if ($res.status -eq "ok") {
            $ready = $true
            break
        }
    } catch {}
}

if ($ready) {
    Write-Host ""
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host "SlothPilot AI is live!" -ForegroundColor Cyan
    Write-Host "   Frontend Dashboard:  http://127.0.0.1:5173" -ForegroundColor Green
    Write-Host "   Backend API Docs:    http://127.0.0.1:8000/docs" -ForegroundColor Green
    Write-Host "   Health Endpoint:     http://127.0.0.1:8000/api/health" -ForegroundColor Green
    Write-Host ""
    Write-Host "To stop services: powershell -ExecutionPolicy Bypass -File .\scripts\stop.ps1" -ForegroundColor Gray
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "[WARNING] Backend did not respond to health checks within timeout. Check .logs\backend.log." -ForegroundColor DarkYellow
}
