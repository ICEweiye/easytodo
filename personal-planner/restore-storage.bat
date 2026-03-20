@echo off
setlocal

cd /d "%~dp0"

if "%~1"=="" (
    echo Usage:
    echo   restore-storage.bat ^<backup-sqlite-path^>
    echo.
    echo Example:
    echo   restore-storage.bat backups\manual\planner-db-manual-YYYYMMDD-HHMMSS.sqlite3
    exit /b 1
)

for %%I in ("%~1") do set "SOURCE=%%~fI"
set "TARGET=planner-data.sqlite3"

if not exist "%SOURCE%" (
    echo [ERROR] Backup file not found: %SOURCE%
    exit /b 1
)

copy /Y "%SOURCE%" "%TARGET%" >nul || (
    echo [ERROR] Failed to write %TARGET%
    exit /b 1
)
if exist "%TARGET%-wal" del /f /q "%TARGET%-wal" >nul 2>nul
if exist "%TARGET%-shm" del /f /q "%TARGET%-shm" >nul 2>nul

echo Restored storage from:
echo   %SOURCE%
echo Current active storage:
echo   %CD%\%TARGET%

endlocal
exit /b 0
