@echo off
chcp 65001 >nul
title MAM DESIGN AND SERVICE - LAN Server (Port 3000)
echo =======================================================
echo   กำลังเปิดใช้งานระบบ MAM DESIGN AND SERVICE (LAN Mode)
echo =======================================================
cd /d "%~dp0"
node server/server.js
pause
