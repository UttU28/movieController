@echo off
echo Starting Movie Controller Services...
echo.

REM Check and kill any existing services on our ports
echo Checking and cleaning existing services...
echo.

REM Kill any processes using port 8008
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8008" 2^>nul') do (
    echo Stopping process on port 8008 (PID: %%a)
    taskkill /f /pid %%a >nul 2>&1
)

REM Kill any processes using port 8009
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8009" 2^>nul') do (
    echo Stopping process on port 8009 (PID: %%a
    taskkill /f /pid %%a >nul 2>&1
)

REM Kill any existing Movie Controller processes
taskkill /f /im python.exe /fi "WINDOWTITLE eq Backend - FastAPI*" >nul 2>&1
taskkill /f /im uvicorn.exe >nul 2>&1
taskkill /f /im node.exe /fi "WINDOWTITLE eq Frontend - Next.js*" >nul 2>&1

echo ✅ Ports cleared and ready for new services
echo.

REM Check if Python virtual environment exists
if not exist "backend\env\Scripts\activate.bat" (
    echo Error: Python virtual environment not found!
    echo Please run: cd backend && python -m venv env && env\Scripts\activate && pip install -r requirements.txt
    pause
    exit /b 1
)

REM Check if Node.js dependencies are installed
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

echo.
echo Starting Backend (FastAPI)...
echo Backend will be available at: http://localhost:8009
echo.

REM Start backend silently in background
cd backend
call env\Scripts\activate.bat
start /b "Backend - FastAPI" cmd /c "uvicorn app:app --host 0.0.0.0 --port 8009 --reload"

REM Wait a moment and check if backend started successfully
timeout /t 3 /nobreak >nul
netstat -an | findstr ":8009" >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Backend failed to start on port 8009
    echo Stopping all services and cleaning up...
    goto cleanup
)

echo.
echo Building Frontend (Next.js)...
echo.

REM Build the frontend first
cd ..\frontend
echo Building Next.js application...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ Frontend build failed
    echo Stopping all services and cleaning up...
    goto cleanup
)

echo.
echo Starting Frontend (Next.js)...
echo Frontend will be available at: http://localhost:8008
echo.

REM Start frontend silently in background
start /b "Frontend - Next.js" cmd /c "npm run dev"

REM Wait a moment and check if frontend started successfully
timeout /t 8 /nobreak >nul
netstat -an | findstr ":8008" >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Frontend failed to start on port 8008
    echo Stopping all services and cleaning up...
    goto cleanup
)

echo.
echo Services are starting...
echo.
echo Backend: http://localhost:8009
echo Frontend: http://localhost:8008
echo.
echo Both services are running silently in the background
echo.
echo To view backend logs, open a new terminal and run:
echo cd backend && env\Scripts\activate && uvicorn app:app --host 0.0.0.0 --port 8009 --reload
echo.
echo To view frontend logs, open a new terminal and run:
echo cd frontend && npm run dev
echo.
echo.
echo.
echo Services are running successfully!
echo.
echo To stop all services and cleanup, press any key
echo Services will continue running if you close this terminal
echo.
pause > nul

:cleanup
echo.
echo Stopping all services and cleaning up...
echo.

REM Stop backend processes
taskkill /f /im python.exe /fi "WINDOWTITLE eq Backend - FastAPI*" >nul 2>&1
taskkill /f /im uvicorn.exe >nul 2>&1

REM Stop frontend processes
taskkill /f /im node.exe /fi "WINDOWTITLE eq Frontend - Next.js*" >nul 2>&1

REM Kill any processes using our ports
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8008" 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8009" 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo ✅ All services stopped and ports freed
echo.
echo Press any key to exit
pause > nul
exit /b 0
