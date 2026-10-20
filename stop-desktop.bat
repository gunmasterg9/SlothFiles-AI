@echo off
setlocal
cd /d "%~dp0"
echo Stopping SlothPilot AI Desktop...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-desktop.ps1" %*
endlocal
