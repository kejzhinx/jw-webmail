@echo off
TITLE JW-Webmail Automatic Backup Service Installer
COLOR 0A

echo ===============================================================
echo      JW-WEBMAIL AUTOMATIC EMAIL BACKUP SERVICE INSTALLER       
echo ===============================================================
echo.
echo This one-time installer configures the Automatic Mail Backup
echo Service to run silently in the background whenever this PC boots.
echo.

:: 1. Verify Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required but not detected in PATH.
    echo Please install Node.js 18+ from https://nodejs.org and re-run this installer.
    pause
    exit /b 1
)

echo [OK] Node.js detected:
node -v
echo.

:: 2. Choose/Confirm Physical Backup Drive & Folder
set DEFAULT_PATH=D:\JW-Mail-Backup
if not exist "D:\" set DEFAULT_PATH=C:\JW-Mail-Backup

echo ---------------------------------------------------------------
echo PHYSICAL BACKUP STORAGE LOCATION
echo ---------------------------------------------------------------
echo Default location: %DEFAULT_PATH%
echo.
set /p USER_PATH="Press ENTER to accept [%DEFAULT_PATH%], or type your physical folder path: "
if "%USER_PATH%"=="" set USER_PATH=%DEFAULT_PATH%

echo.
echo Setting backup path to: %USER_PATH%
if not exist "%USER_PATH%" (
    mkdir "%USER_PATH%" 2>nul
    if exist "%USER_PATH%" (
        echo [OK] Created physical directory: %USER_PATH%
    ) else (
        echo [WARNING] Could not create directory immediately. Will be initialized on service start.
    )
)

:: 3. Update backup-service-config.json
cd /d "%~dp0"
node -e "const fs = require('fs'); const file = 'backup-service-config.json'; let c = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf-8')) : {}; c.backupPath = process.argv[1]; fs.writeFileSync(file, JSON.stringify(c, null, 2)); console.log('[OK] Configuration saved.');" "%USER_PATH%"

echo.
:: 4. Install Service Dependencies
echo Installing background service dependencies...
call npm install --production --no-audit --no-fund >nul 2>&1
echo [OK] Dependencies ready.

echo.
:: 5. Register Native Windows Background Task (Auto-start on PC boot)
echo Registering Windows Background Service (Auto-Start on Boot)...
schtasks /create /tn "JW_Mail_Automatic_Backup" /tr "wscript.exe \"%~dp0service-runner.vbs\"" /sc onstart /ru SYSTEM /f >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Registering user logon background service...
    schtasks /create /tn "JW_Mail_Automatic_Backup" /tr "wscript.exe \"%~dp0service-runner.vbs\"" /sc onlogon /f >nul 2>&1
)

:: 6. Launch Service Immediately
schtasks /run /tn "JW_Mail_Automatic_Backup" >nul 2>&1
if %errorlevel% neq 0 (
    start wscript.exe "%~dp0service-runner.vbs"
)

echo.
echo ===============================================================
echo     INSTALLATION COMPLETE - AUTOMATIC BACKUP IS RUNNING        
echo ===============================================================
echo.
echo  * Status:              RUNNING in background
echo  * Physical Location:   %USER_PATH%
echo  * Auto-Start on Boot:  ENABLED
echo  * Polling Interval:    Every 2 minutes (Automatic)
echo.
echo You do NOT need to open terminal or run any scripts manually.
echo The service will automatically start whenever your PC restarts.
echo.
echo You may safely close this window.
pause
