@echo off
TITLE CA Firm OS: Internal Ops Tracker & Automated Filings
echo =========================================================================
echo        Starting CA Firm OS: Internal Ops Tracker & Automated Filings      
echo =========================================================================
echo.

cd /d "%~dp0backend"
start "CA Firm OS - Unified FastAPI Backend" cmd /k "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

timeout /t 3 >nul

echo Launching CA Firm OS in your default browser...
start http://localhost:8000

echo.
echo =========================================================================
echo Production Services Active:
echo  - CA Firm OS (Ops Tracker + Filings): http://localhost:8000
echo  - Interactive Swagger API Docs:       http://localhost:8000/docs
echo =========================================================================
pause
