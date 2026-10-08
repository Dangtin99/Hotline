@echo off
chcp 65001 >nul
title Cloudflare Tunnel - Logistics Cancellation Analytics (Port 5050)
echo ======================================================================
echo   KHỞI CHẠY ĐƯỜNG HẦM CLOUDFLARE TUNNEL (PORT 5050)
echo ======================================================================
echo.
echo [1/2] Kiểm tra Backend Node.js (Port 5050)...
netstat -ano | findstr :5050 | findstr LISTENING > nul
if %errorlevel% neq 0 (
    echo [*] Backend chưa chạy. Đang khởi động Backend...
    start "Logistics Backend" cmd /k "cd /d %~dp0 && npm start"
    timeout /t 3 /nobreak > nul
) else (
    echo [OK] Backend đang hoạt động trên port 5050.
)
echo.
echo [2/2] Đang khởi chạy Cloudflare Tunnel kết nối http://localhost:5050...
echo ----------------------------------------------------------------------
echo Tìm dòng có đường dẫn dạng: https://xxxx.trycloudflare.com bên dưới
echo ----------------------------------------------------------------------
echo.
if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:5050
) else if exist "%~dp0cloudflared.exe" (
    "%~dp0cloudflared.exe" tunnel --url http://localhost:5050
) else (
    cloudflared tunnel --url http://localhost:5050
)
pause
