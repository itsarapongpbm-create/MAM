@echo off
cd /d "%~dp0"
chcp 65001 >nul
title MAM DESIGN AND SERVICE - Unified System Launcher
echo =======================================================
echo    MAM DESIGN AND SERVICE - ERP & Backoffice System
echo =======================================================
echo.
echo [1/3] Starting Docker Infrastructure (PostgreSQL 16 + MinIO)...
docker compose up -d >nul 2>&1

echo [2/3] Initializing MAM Server on Port 3000...
echo [3/3] Opening Browser...
echo.
echo =======================================================
echo   System Status: ONLINE & READY
echo =======================================================
echo   - Local Access:      http://localhost:3000
echo   - LAN / Wi-Fi Access: http://192.168.1.34:3000
echo =======================================================
echo   (Keep this window open while using the system)
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
node server/server.js
pause