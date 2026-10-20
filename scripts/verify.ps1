# SlothPilot AI - Verification Script
# Runs end-to-end regression tests and frontend build.
# Returns exit code 0 on complete success, or nonzero on any failure.

$repoRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
$frontendDir = Join-Path $repoRoot "frontend"

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "SlothPilot AI: Running Complete Verification Suite" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify Python and Virtual Environment
Write-Host "[1/5] Verifying Python runtime and virtual environment..." -ForegroundColor Yellow
if (-not (Test-Path $venvPython)) {
    Write-Host "[FAIL] Virtual environment not found at .venv. Please run .\scripts\setup.ps1." -ForegroundColor Red
    exit 1
}
$pyVer = & $venvPython --version
Write-Host "      [OK] Runtime: $pyVer" -ForegroundColor Green

# 2. Verify Backend Tests
Write-Host ""
Write-Host "[2/5] Running Backend Pytest Test Suite..." -ForegroundColor Yellow
$backendTests = Join-Path $repoRoot "backend\tests"
& $venvPython -m pytest $backendTests -v
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[FAIL] Backend tests failed!" -ForegroundColor Red
    exit 1
}
Write-Host "      [OK] All backend unit, integration, and security tests passed." -ForegroundColor Green

# 3. Verify Frontend Production Build
Write-Host ""
Write-Host "[3/5] Running Frontend Production Build (TypeScript + Vite)..." -ForegroundColor Yellow
Push-Location $frontendDir
cmd.exe /c "npm.cmd run build"
$buildExit = $LASTEXITCODE
Pop-Location

if ($buildExit -ne 0) {
    Write-Host ""
    Write-Host "[FAIL] Frontend build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "      [OK] Frontend compiled successfully." -ForegroundColor Green

# 4. Verify Database Migration Files
Write-Host ""
Write-Host "[4/5] Verifying SQLite database migration files..." -ForegroundColor Yellow
$migrationFile = Join-Path $repoRoot "backend\app\db\migrations.py"
if (-not (Test-Path $migrationFile)) {
    Write-Host "[FAIL] Database migrations module missing!" -ForegroundColor Red
    exit 1
}
Write-Host "      [OK] Versioned database migrations present." -ForegroundColor Green

# 5. Verify Desktop Launcher Scripts
Write-Host ""
Write-Host "[5/5] Verifying Windows Desktop launcher and shutdown scripts..." -ForegroundColor Yellow
$launcherScripts = @(
    (Join-Path $repoRoot "start-desktop.bat"),
    (Join-Path $repoRoot "stop-desktop.bat"),
    (Join-Path $repoRoot "scripts\start-desktop.bat"),
    (Join-Path $repoRoot "scripts\stop-desktop.bat"),
    (Join-Path $repoRoot "scripts\start-desktop.ps1"),
    (Join-Path $repoRoot "scripts\stop-desktop.ps1")
)
foreach ($scriptPath in $launcherScripts) {
    if (-not (Test-Path $scriptPath)) {
        Write-Host "[FAIL] Missing desktop launcher script: $scriptPath" -ForegroundColor Red
        exit 1
    }
}
Write-Host "      [OK] All Windows Desktop launcher and batch wrapper scripts present." -ForegroundColor Green

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "ALL SLOTH PILOT AI VERIFICATION CHECKS PASSED (EXIT CODE 0)" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""
exit 0
