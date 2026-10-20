@echo off
setlocal
cd /d "%~dp0"
echo Starting SlothPilot AI Desktop...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-desktop.ps1" %*
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] SlothPilot AI launcher exited with error code %ERRORLEVEL%.
    pause
)
endlocal
