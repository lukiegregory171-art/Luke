@echo off
title Jarvis AI Assistant
echo ============================================
echo  J.A.R.V.I.S. - Starting up...
echo ============================================
echo.

:: Activate virtual environment if it exists
if exist ".venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call .venv\Scripts\activate.bat
) else if exist "venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
)

:: Check Ollama is reachable
echo Checking Ollama...
curl -s http://localhost:11434 >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Ollama does not appear to be running.
    echo Please start Ollama from the system tray or run: ollama serve
    echo.
    pause
    exit /b 1
)
echo Ollama OK.
echo.

:: Launch Jarvis
python jarvis.py

:: If Python exits with an error, keep the window open
if %errorlevel% neq 0 (
    echo.
    echo Jarvis exited with an error. See jarvis.log for details.
    pause
)
