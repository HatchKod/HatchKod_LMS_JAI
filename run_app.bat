@echo off
echo ==========================================
echo    Starting HatchKod LMS Application
echo ==========================================

:: Change to the directory where the script is located
cd /d "%~dp0"

:: Start Backend in a new window
echo Starting Backend Server...
start "HatchKod Backend" cmd /k "cd backend && uvicorn server:app --reload"

:: Start Frontend in a new window
echo Starting Frontend Application...
start "HatchKod Frontend" cmd /k "cd frontend && npm start"

echo.
echo Both servers are starting in separate windows.
echo Keep those windows open while using the app!
echo.
pause
