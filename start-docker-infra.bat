@echo off
chcp 65001 >nul
title Giftory - Docker Infrastructure (PostgreSQL + MinIO)
echo ========================================================
echo    Starting Giftory Infrastructure (Step 1)
echo    - PostgreSQL 16 on port 5432
echo    - MinIO Object Storage (API: 9000, Web Console: 9001)
echo ========================================================
echo.
docker compose up -d
echo.
echo ========================================================
echo    Status Check:
echo ========================================================
docker compose ps
echo.
echo MinIO Web Console: http://localhost:9001
echo (User: minioadmin / Pass: minioadmin123)
echo.
pause
