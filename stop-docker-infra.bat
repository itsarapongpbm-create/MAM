@echo off
chcp 65001 >nul
title Giftory - Stop Docker Infrastructure
echo Stopping PostgreSQL and MinIO containers...
docker compose down
echo All containers stopped cleanly.
pause
