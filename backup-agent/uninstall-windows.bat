@echo off
TITLE Uninstall JW-Webmail Automatic Backup Service
COLOR 0C

echo ===============================================================
echo     UNINSTALL JW-WEBMAIL AUTOMATIC BACKUP SERVICE              
echo ===============================================================
echo.
echo Stopping background service...
schtasks /end /tn "JW_Mail_Automatic_Backup" >nul 2>&1

echo Removing scheduled background task...
schtasks /delete /tn "JW_Mail_Automatic_Backup" /f >nul 2>&1

echo [OK] Background service removed.
echo Note: Your backed-up email files in your physical storage were NOT deleted.
echo.
pause
