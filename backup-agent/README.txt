===============================================================
 JW-WEBMAIL AUTOMATIC EMAIL BACKUP SERVICE (ONE-TIME INSTALLER)
===============================================================

ARCHITECTURE:
Bluehost Mail Server -> Automatic Backup Service on Host PC -> Physical Local Storage Drive

ONE-TIME INSTALLATION:
----------------------
Windows Host PC:
1. Double-click "install-windows.bat" (Run as administrator if prompted).
2. Enter or accept your physical backup drive/folder (e.g. D:\JW-Mail-Backup).
3. The installer installs the background service, configures auto-start on boot,
   and starts the automatic backup immediately.
4. Close the window. That's it!

Linux Host PC:
1. Run: sudo bash install-linux.sh
2. Follow the prompt to choose your physical mount path (e.g. /mnt/jw-mail-backup).
3. The systemd service "jw-backup-agent" will be enabled and started automatically.

HOW IT WORKS:
-------------
* Runs automatically in the background 24/7.
* Auto-starts on PC restart or system reboot without opening any terminal.
* Polls Bluehost IMAP every 2 minutes for new emails.
* Safely downloads and verifies emails and attachments into RFC822 (.eml) format.
* Preserves original emails on Bluehost server.
* Pre-checks physical disk space before downloading.
* Prevents duplicates using stable Message-ID & IMAP UID index.

UNINSTALLATION:
---------------
Windows: Double-click uninstall-windows.bat
Linux:   sudo bash uninstall-linux.sh
