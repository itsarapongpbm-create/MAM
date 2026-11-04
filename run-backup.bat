@echo off
chcp 65001 >nul
title Giftory - Database Backup
echo =======================================================
echo    Starting Database Backup...
echo =======================================================
echo.
node scripts/backup-db.js
echo.
pause