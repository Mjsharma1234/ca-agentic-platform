@echo off
TITLE CA Agentic Compliance Platform - MVP Launcher
echo =========================================================================
echo        Starting CA Agentic Compliance Platform (Local Working MVP)
echo =========================================================================
echo.
echo 1. Starting FastAPI Deterministic Backend (Port 8000)...
start "CA Backend (FastAPI)" cmd /k "cd /d %~dp0ca-agentic-platform\backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo 2. Starting Next.js Web Application (Port 3000)...
start "CA Frontend (Next.js)" cmd /k "cd /d %~dp0ca-agentic-platform\frontend && npm run dev"

echo.
echo Waiting 5 seconds for services to initialize...
timeout /t 5 /nobreak >nul

echo 3. Opening Dashboard in Browser...
start http://localhost:3000

echo.
echo =========================================================================
echo Platform services are running:
echo - Frontend UI:        http://localhost:3000
echo - Backend Swagger:    http://localhost:8000/docs
echo - Returns & Reco:     http://localhost:3000/returns
echo - Human Gate G6:      http://localhost:3000/gates/G6-9845
echo =========================================================================
echo Keep the backend and frontend terminal windows open while using the app.
pause
