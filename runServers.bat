@echo off

cd backend
call env\Scripts\activate.bat

echo Starting Server A on port 5000...
start "Server A" cmd /k uvicorn app:app --host 0.0.0.0 --port 5000 --reload

cd ..
cd frontend

echo Starting frontend with npm...
start "Frontend" cmd /k npm run dev

echo All servers started successfully.
echo Close this window to stop all servers.

pause
