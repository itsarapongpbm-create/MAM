@echo off
chcp 65001 >nul
:: ตรวจสอบสิทธิ์ Administrator หากยังไม่ได้รันแบบ Admin ให้ขอสิทธิ์อัตโนมัติ
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo กำลังขอสิทธิ์ผู้ดูแลระบบ (Administrator) เพื่อเปิดพอร์ต 3000 ใน Windows Firewall...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo =======================================================
echo   กำลังเปิดพอร์ต TCP 3000 ใน Windows Defender Firewall
echo =======================================================
netsh advfirewall firewall delete rule name="MAM Server Port 3000" >nul 2>&1
netsh advfirewall firewall add rule name="MAM Server Port 3000" dir=in action=allow protocol=TCP localport=3000
echo.
echo [สำเร็จ] เปิดพอร์ต 3000 สำหรับเครื่องอื่นในวงแลน/Wi-Fi เรียบร้อยแล้ว!
echo.
pause
