@echo off
chcp 65001 >nul
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [Requesting Administrator privilege...]
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo =======================================================
echo   Opening Giftory Firewall Ports (3000 and 9000)
echo =======================================================
netsh advfirewall firewall delete rule name="Giftory Server Port 3000" >nul 2>&1
netsh advfirewall firewall add rule name="Giftory Server Port 3000" dir=in action=allow protocol=TCP localport=3000

netsh advfirewall firewall delete rule name="Giftory MinIO Port 9000" >nul 2>&1
netsh advfirewall firewall add rule name="Giftory MinIO Port 9000" dir=in action=allow protocol=TCP localport=9000

echo.
echo =======================================================
echo   [SUCCESS] Firewall ports 3000 and 9000 are opened!
echo   LAN URL for other devices in office:
echo   http://192.168.1.34:3000
echo =======================================================
echo.
pause