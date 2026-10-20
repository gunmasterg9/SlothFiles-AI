# SlothPilot AI - Setup Script
# Verifies prerequisites, prepares virtual environment, and installs dependencies.
# Note: Does NOT silently download language models.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "SlothPilot AI: Environment Setup" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Python
Write-Host "[1/5] Checking Python installation..." -ForegroundColor Yellow
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    $pythonCmd = Get-Command py -ErrorAction SilentlyContinue
}

if (-not $pythonCmd) {
    Write-Error "Python 3.12+ was not found in PATH. Please install Python 3.12 and add it to your system PATH."
}

$pyVersion = & $pythonCmd.Source --version 2>&1
Write-Host "      [OK] Detected: $pyVersion" -ForegroundColor Green

# 2. Check Node.js and npm
Write-Host "[2/5] Checking Node.js and npm..." -ForegroundColor Yellow
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue

if (-not $nodeCmd -or -not $npmCmd) {
    Write-Error "Node.js (v18+) and npm were not found in PATH. Please install Node.js."
}

$nodeVersion = & $nodeCmd.Source --version
$npmVersion = & $npmCmd.Source --version
Write-Host "      [OK] Detected: Node $nodeVersion, npm $npmVersion" -ForegroundColor Green

# 3. Check Local Ollama
Write-Host "[3/5] Checking Ollama local AI runtime..." -ForegroundColor Yellow
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollamaCmd) {
    Write-Host "      [OK] Ollama CLI detected." -ForegroundColor Green
    try {
        $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($tags -and $tags.models) {
            $installed = ($tags.models | ForEach-Object { $_.name }) -join ", "
            Write-Host "      [OK] Ollama running on loopback. Installed models: $installed" -ForegroundColor Green
        } else {
            Write-Host "      [INFO] Ollama running on loopback with no models installed yet." -ForegroundColor DarkYellow
            Write-Host "      [INFO] Recommended candidate: 'ollama run qwen2.5:7b' (requires internet once to pull)." -ForegroundColor DarkYellow
        }
    } catch {
        Write-Host "      [INFO] Ollama is installed but not running at http://127.0.0.1:11434." -ForegroundColor DarkYellow
        Write-Host "      [INFO] Start Ollama before using local AI features, or use offline deterministic workflows." -ForegroundColor DarkYellow
    }
} else {
    Write-Host "      [INFO] Ollama CLI not detected in PATH. (SlothPilot will run in deterministic offline mode)" -ForegroundColor DarkYellow
}

# 4. Prepare Python Virtual Environment and Install Dependencies
Write-Host "[4/5] Setting up Python virtual environment and backend dependencies..." -ForegroundColor Yellow
$repoRoot = Split-Path -Parent $PSScriptRoot
$venvDir = Join-Path $repoRoot ".venv"
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "      Creating virtual environment at .venv..." -ForegroundColor Gray
    & $pythonCmd.Source -m venv $venvDir
}

Write-Host "      Upgrading pip and installing requirements.txt..." -ForegroundColor Gray
& $venvPython -m pip install --quiet --upgrade pip
& $venvPython -m pip install --quiet -r (Join-Path $repoRoot "requirements.txt")
Write-Host "      [OK] Backend dependencies installed successfully." -ForegroundColor Green

# 5. Install Frontend Dependencies
Write-Host "[5/5] Installing frontend dependencies..." -ForegroundColor Yellow
$frontendDir = Join-Path $repoRoot "frontend"
Push-Location $frontendDir
try {
    cmd.exe /c "npm.cmd install"
    Write-Host "      [OK] Frontend dependencies installed successfully." -ForegroundColor Green
} finally {
    Pop-Location
}

# 6. Copy default .env if missing
$envExample = Join-Path $repoRoot ".env.example"
$envTarget = Join-Path $repoRoot ".env"
if (-not (Test-Path $envTarget) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envTarget
    Write-Host "      [OK] Created .env from .env.example." -ForegroundColor Green
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "SlothPilot AI setup complete!" -ForegroundColor Cyan
Write-Host "  To launch:   powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1" -ForegroundColor Gray
Write-Host "  To verify:   powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1" -ForegroundColor Gray
Write-Host "  To stop:     powershell -ExecutionPolicy Bypass -File .\scripts\stop.ps1" -ForegroundColor Gray
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""
