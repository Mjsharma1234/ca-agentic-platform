# CA Agentic Compliance Platform - PowerShell Launcher
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "       Starting CA Agentic Compliance Platform (Local Working MVP)       " -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""

$RootPath = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "1. Starting FastAPI Deterministic Backend (Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$RootPath\ca-agentic-platform\backend'; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

Write-Host "2. Starting Next.js Web Application (Port 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$RootPath\ca-agentic-platform\frontend'; npm run dev"

Write-Host ""
Write-Host "Waiting 5 seconds for local servers to start..." -ForegroundColor Gray
Start-Sleep -Seconds 5

Write-Host "3. Launching Dashboard in Default Browser..." -ForegroundColor Green
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "Services Active:" -ForegroundColor Green
Write-Host " - Frontend UI:        http://localhost:3000"
Write-Host " - Backend Swagger:    http://localhost:8000/docs"
Write-Host " - Returns & Reco:     http://localhost:3000/returns"
Write-Host " - Human Gate G6:      http://localhost:3000/gates/G6-9845"
Write-Host "=========================================================================" -ForegroundColor Cyan
