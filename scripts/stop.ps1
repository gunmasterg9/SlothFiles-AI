# SlothPilot AI - Stop Script
# Safely terminates only the backend and frontend processes recorded in .slothpilot.pids.
# Does NOT touch unrelated user processes.

$ErrorActionPreference = "SilentlyContinue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $repoRoot ".slothpilot.pids"

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "Stopping SlothPilot AI Services..." -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $pidFile)) {
    Write-Host "[INFO] No active SlothPilot .slothpilot.pids file found. Services may not be running." -ForegroundColor Yellow
    exit 0
}

try {
    $pidsContent = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
} catch {
    Write-Host "[WARNING] Could not parse .slothpilot.pids file. Removing stale file." -ForegroundColor Yellow
    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
    exit 0
}

function Stop-SpecificProcess {
    param ([int]$pidToStop, [string]$name, [string[]]$expectedNames)
    if ($pidToStop -gt 0) {
        $proc = Get-Process -Id $pidToStop -ErrorAction SilentlyContinue
        if ($proc) {
            $pname = $proc.ProcessName.ToLower()
            $matched = $false
            foreach ($exp in $expectedNames) {
                if ($pname -like "*$($exp.ToLower())*") { $matched = $true; break }
            }
            if (-not $matched) {
                Write-Host "      [SKIP] PID $pidToStop is '$pname' (not matching $name). Skipped to protect unrelated process." -ForegroundColor Yellow
                return
            }
            Write-Host "Stopping $name (PID $pidToStop)..." -ForegroundColor Yellow
            $proc.CloseMainWindow() | Out-Null
            Start-Sleep -Milliseconds 250
            if (-not $proc.HasExited) {
                Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue
            }
            Write-Host "      [OK] $name terminated safely." -ForegroundColor Green
        } else {
            Write-Host "      [INFO] $name (PID $pidToStop) was already stopped." -ForegroundColor Gray
        }
    }
}

if ($pidsContent.backend_pid) {
    Stop-SpecificProcess -pidToStop $pidsContent.backend_pid -name "FastAPI Backend" -expectedNames @("python", "py")
}

if ($pidsContent.frontend_pid) {
    Stop-SpecificProcess -pidToStop $pidsContent.frontend_pid -name "Vite Frontend Server" -expectedNames @("node", "cmd")
}

# Clean up PID record file
Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "All SlothPilot AI services stopped." -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""
