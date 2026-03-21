@echo off
setlocal enabledelayedexpansion

echo.
echo ============================================
echo   AI Blog Post Generator (Gemini 3 Flash)
echo ============================================
echo.

set /p topic="Enter the topic for your blog post: "

if "!topic!"=="" (
    echo [!] No topic entered. Generating a post about 'Technology trends in 2026'...
    set topic="Technology trends in 2026"
)

echo [i] Generating content using Gemini 3 Flash...
node scripts/generate-post.js "!topic!"

if %errorlevel% neq 0 (
    echo.
    echo [X] Error generating post. Please check your GEMINI_API_KEY in .env
) else (
    echo.
    echo [v] Post generated successfully! Check src/data/blog/
)

echo.
pause
