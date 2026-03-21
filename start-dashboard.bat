@echo off
setlocal

echo.
echo ============================================
echo   AI Blog Dashboard Launcher (Gemini 3 Flash)
echo ============================================
echo.
echo [i] Starting server on http://localhost:3001
echo [i] Please wait, the browser will open automatically...
echo.

node scripts/dashboard-server.js

if %errorlevel% neq 0 (
    echo.
    echo [X] Error starting dashboard server. 
    echo [i] Make sure you have Node.js installed and dependencies are installed (npm install).
    echo [i] Also check your GEMINI_API_KEY in .env
    pause
)
