@echo off
cd /d "%~dp0"

if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

echo Starting AI Blog Dashboard...
start "AI Blog Dashboard" node scripts/dashboard-server.js
timeout /t 2 /nobreak >nul
start "" http://localhost:3001
exit
