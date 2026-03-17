@echo off
setlocal

cd /d "%~dp0"

set "HOST=127.0.0.1"
set "PORT=8787"
set "URL=http://%HOST%:%PORT%/index.html"
set "API_URL=http://%HOST%:%PORT%/api/storage"
set "DB_FILE=planner-data.sqlite3"
set "DB_BACKUP_DIR=backups\db"
set "LEGACY_JSON=.planner-shared-storage.json"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is required but was not found in PATH.
    echo Install Node.js and try again.
    pause
    exit /b 1
)

if not exist "%DB_BACKUP_DIR%" (
    mkdir "%DB_BACKUP_DIR%"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%API_URL%' -UseBasicParsing -TimeoutSec 1 ^| Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
    start "" "%URL%"
    exit /b 0
)

start "" "%URL%"
echo Starting planner server on %HOST%:%PORT% ...
echo Keep this window open while using the planner.
echo SQLite DB file: %CD%\%DB_FILE%
echo SQLite backups folder: %CD%\%DB_BACKUP_DIR%
if exist "%LEGACY_JSON%" (
    echo Legacy JSON found: %CD%\%LEGACY_JSON%
    echo It will be auto-migrated to SQLite on first server start.
)
echo.

node dev-server.js

endlocal
