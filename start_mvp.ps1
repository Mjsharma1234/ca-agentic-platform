# CA Firm OS & Agentic Compliance Platform - PowerShell Launcher
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "       Starting CA Firm OS: Internal Ops Tracker & Automated Filings     " -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""

$RootPath = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "1. Starting Unified Backend & CA Firm OS (Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$RootPath\backend'; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

Write-Host "2. Starting Next.js Companion Frontend (Port 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$RootPath\frontend'; npm run dev"

Write-Host ""
Write-Host "Waiting 4 seconds for local servers to start..." -ForegroundColor Gray
Start-Sleep -Seconds 4

Write-Host "3. Launching CA Firm OS in Default Browser..." -ForegroundColor Green
Start-Process "http://localhost:8000"

Write-Host ""
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "Production Services Active:" -ForegroundColor Green
Write-Host " - CA Firm OS (Ops Tracker + Filings): http://localhost:8000" -ForegroundColor White
Write-Host " - Next.js Companion Portal:           http://localhost:3000" -ForegroundColor White
Write-Host " - Backend API & Swagger Docs:         http://localhost:8000/docs" -ForegroundColor White
Write-Host " - Deterministic Reco Engine:          http://localhost:8000/#/recon" -ForegroundColor White
Write-Host " - Human Gate G6/G7 Approvals:         http://localhost:8000/#/gates" -ForegroundColor White
Write-Host "=========================================================================" -ForegroundColor Cyan
