@echo off
chcp 65001 >nul
echo ====================================================================
echo  GPG LOGISTICS - TIỆN ÍCH SAO LƯU CƠ SỞ DỮ LIỆU ĐỘC LẬP
echo ====================================================================

set "SOURCE_DB=%~dp0data\cancellation_orders.db"
set "BACKUP_DIR=%USERPROFILE%\Documents\GPG_Database_Backups"

if not exist "%SOURCE_DB%" (
    echo [LOI] Khong tim thay file co so du lieu: %SOURCE_DB%
    pause
    exit /b 1
)

if not exist "%BACKUP_DIR%" (
    mkdir "%BACKUP_DIR%"
)

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set "dt=%%I"
set "YYYY=%dt:~0,4%"
set "MM=%dt:~4,2%"
set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%"
set "Min=%dt:~10,2%"
set "Sec=%dt:~12,2%"

set "BACKUP_FILE=%BACKUP_DIR%\cancellation_orders_backup_%YYYY%-%MM%-%DD%_%HH%%Min%%Sec%.db"

echo Dang sao chep co so du lieu sang thu muc sao luu...
copy /Y "%SOURCE_DB%" "%BACKUP_FILE%" >nul

if %ERRORLEVEL% equ 0 (
    echo.
    echo [THANH CONG] Da sao luu co so du lieu thanh cong!
    echo Vi tri file: %BACKUP_FILE%
    echo Thu muc:     %BACKUP_DIR%
    echo.
    explorer "%BACKUP_DIR%"
) else (
    echo.
    echo [LOI] Khong the sao chep co so du lieu sang %BACKUP_DIR%
)

echo ====================================================================
pause
