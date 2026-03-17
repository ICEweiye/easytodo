@echo off
setlocal

cd /d "%~dp0"

set "API_URL=http://127.0.0.1:8787/api/backup-db"
set "DB_FILE=planner-data.sqlite3"
set "TARGET_DIR=%~1"

if not defined TARGET_DIR (
    set /p TARGET_DIR=Input backup directory path (for example D:\PlannerDBBackups^): 
)

if not defined TARGET_DIR (
    echo [CANCEL] No target directory provided.
    exit /b 1
)

if not exist "%TARGET_DIR%" (
    mkdir "%TARGET_DIR%" >nul 2>nul
)

if not exist "%TARGET_DIR%" (
    echo [ERROR] Failed to create target directory: %TARGET_DIR%
    exit /b 1
)

set "BACKUP_DONE="
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop';" ^
    "$target=$env:TARGET_DIR;" ^
    "$payload=@{targetDir=$target} | ConvertTo-Json -Compress;" ^
    "$resp=Invoke-RestMethod -Uri $env:API_URL -Method Post -ContentType 'application/json' -Body $payload;" ^
    "if(-not $resp.ok){ throw 'Backup API returned failure'; }" ^
    "Write-Output ('BACKUP_OK ' + $resp.backupPath)" ^
    > "%TEMP%\\planner-db-backup-result.txt" 2>nul

if not errorlevel 1 (
    set "BACKUP_DONE=1"
    for /f "usebackq tokens=1,*" %%A in ("%TEMP%\\planner-db-backup-result.txt") do (
        if /i "%%A"=="BACKUP_OK" (
            echo Backup created: %%B
        )
    )
)

del /q "%TEMP%\\planner-db-backup-result.txt" >nul 2>nul

if defined BACKUP_DONE (
    exit /b 0
)

echo [WARN] Backup API not available. Falling back to direct file copy.

if not exist "%DB_FILE%" (
    echo [ERROR] Database file not found: %CD%\%DB_FILE%
    exit /b 1
)

for /f %%I in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyyMMdd-HHmmss')"') do set "TS=%%I"
set "DST=%TARGET_DIR%\planner-data-%TS%.sqlite3"

copy /Y "%DB_FILE%" "%DST%" >nul
if errorlevel 1 (
    echo [ERROR] Direct copy failed.
    exit /b 1
)

echo Backup created: %DST%
exit /b 0
