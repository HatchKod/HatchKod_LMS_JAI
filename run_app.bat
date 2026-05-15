@echo off
echo ==========================================
echo    HatchKod LMS - Setup and Launcher
echo ==========================================
echo.

:: Change to the directory where the script is located
cd /d "%~dp0"

:: ---- CHECK: .env file ----
if not exist "backend\.env" (
    echo [WARNING] backend\.env file not found!
    echo.
    echo Please create backend\.env with your Supabase credentials.
    echo Copy the example below into a new file at: backend\.env
    echo.
    echo -----------------------------------------------
    echo SUPABASE_URL=https://your-project-id.supabase.co
    echo SUPABASE_KEY=your-supabase-anon-key
    echo JWT_SECRET=super-secret-jwt-key-change-me
    echo JWT_ALGORITHM=HS256
    echo ACCESS_TOKEN_MIN=1440
    echo ADMIN_EMAIL=admin@hatchkod.com
    echo ADMIN_PASSWORD=admin123
    echo -----------------------------------------------
    echo.
    pause
    exit
)

:: ---- INSTALL: Python backend dependencies ----
echo [1/3] Installing Python backend dependencies...
cd backend
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] pip install failed. Make sure Python is installed and in your PATH.
    pause
    exit
)
cd ..
echo Done.
echo.

:: ---- INSTALL: Node frontend dependencies ----
echo [2/3] Installing Node.js frontend dependencies...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed. Make sure Node.js is installed and in your PATH.
    pause
    exit
)
cd ..
echo Done.
echo.

:: ---- START: Both servers ----
echo [3/3] Starting servers...
echo.
start "HatchKod Backend" cmd /k "cd /d "%~dp0backend" && uvicorn server:app --reload"
start "HatchKod Frontend" cmd /k "cd /d "%~dp0frontend" && npm start"

echo Both servers are starting in separate windows.
echo Keep those windows open while using the app!
echo.
echo Opening website in 8 seconds...
timeout /t 8
start http://localhost:3000
echo.
pause
