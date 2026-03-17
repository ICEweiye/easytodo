@echo off
setlocal

cd /d "%~dp0"

set "SOURCE=planner-data.sqlite3"
set "BACKUP_DIR=backups\manual"

if not exist "%SOURCE%" (
    echo [ERROR] SQLite DB not found: %CD%\%SOURCE%
    exit /b 1
)

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"

if not exist "%BACKUP_DIR%" (
    mkdir "%BACKUP_DIR%"
)

set "TARGET=%BACKUP_DIR%\planner-db-manual-%STAMP%.sqlite3"
copy /Y "%SOURCE%" "%TARGET%" >nul

echo Backup created:
echo   %CD%\%TARGET%

endlocal
