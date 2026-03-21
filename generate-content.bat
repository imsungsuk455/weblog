@echo off
setlocal enabledelayedexpansion

echo.
echo ============================================
echo   AI Blog Post Generator (Gemini 3 Flash)
echo ============================================
echo.

if not exist node_modules (
    echo [!] node_modules directory not found.
    echo [i] Installing dependencies...
    cmd /c npm install
)

set /p topic="Enter the topic for your blog post: "
set /p cat="Enter the category (default: others): "

if "!topic!"=="" (
    echo [!] No topic entered. Generating a post about 'Technology trends in 2026'...
    set topic="Technology trends in 2026"
)
if "!cat!"=="" (
    set cat="others"
)

echo [i] Generating content using Gemini 3 Flash...
node scripts/generate-post.js "!topic!" "" "!cat!"

if %errorlevel% neq 0 (
    echo.
    echo [X] Error generating post. Please check your GEMINI_API_KEY in .env
) else (
    echo.
    echo [v] Post generated successfully! Check src/data/blog/
)

echo.
pause
