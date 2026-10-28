@echo off
title AI Agent Office - Dev Servers

echo Starting ai-office-ui...
start "" /b cmd /c "cd /d "%~dp0ai-office-ui" && npm run dev"

echo Starting backend...
start "" /b cmd /c "cd /d "%~dp0backend" && npm run dev"

echo.
echo Both development servers are running in this window.
echo.
pause