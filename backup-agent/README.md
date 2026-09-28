# JW-Webmail Dedicated Host PC Backup Agent

This is a lightweight, secure, and production-ready Node.js Backup Agent designed to run as a background systemd daemon on a dedicated Linux Host PC (e.g., Ubuntu). It automatically, incrementally, and safely backs up your Bluehost IMAP mailboxes directly to the physical storage disk on the Host PC.

---

## 1. Directory Structure

```
backup-agent/
├── agent.mjs                # Standalone Node.js Agent Core Engine
├── package.json             # Engine and Dependency definitions
├── agent-config.example.json # Example configuration file
├── jw-backup-agent.service # Systemd Service configuration template
├── install-linux.sh         # Automatic installer (Requires root/sudo)
├── uninstall-linux.sh       # Automatic uninstaller (Requires root/sudo)
└── README.md                # This Guide
```

---

## 2. Installation & Quick Start

### Step 1: Copy folder to Host PC
Copy the entire `backup-agent` folder to your Linux host PC.

### Step 2: Run the Automated Installer
Execute the `install-linux.sh` script as root:
```bash
chmod +x install-linux.sh
sudo ./install-linux.sh
```

The installer will:
1. Verify Node.js and npm are installed.
2. Provision `/opt/jw-backup-agent`.
3. Auto-install all packages via `npm install`.
4. Configure `/etc/systemd/system/jw-backup-agent.service` with automatic crash-restarts and boot launch.
5. Enable and start the system service immediately.

---

## 3. Useful Commands

### Check Agent Service Status
```bash
sudo systemctl status jw-backup-agent
```

### View Real-Time Service Logs
```bash
sudo journalctl -u jw-backup-agent -f
```

### Restart the Service
```bash
sudo systemctl restart jw-backup-agent
```

### Stop the Service
```bash
sudo systemctl stop jw-backup-agent
```

---

## 4. Configuration Settings

The configuration is loaded from `/opt/jw-backup-agent/agent-config.json`. You can modify it directly to customize settings:

```json
{
  "serverUrl": "https://mail.playbook.com.ph",
  "registrationToken": "SECURITY_AUTH_REMOVED",
  "backupPath": "/srv/mail-storage",
  "heartbeatIntervalSeconds": 10,
  "imapHost": "mail.playbook.com.ph",
  "imapPort": 993,
  "imapSecure": true,
  "backupIntervalHours": 12,
  "mailboxCredentials": [
    {
      "email": "user@playbook.com.ph",
      "imapPass": "YOUR_SECURE_PASSWORD_HERE"
    }
  ],
  "logging": {
    "level": "info",
    "logToFile": true,
    "logFilePath": "/var/log/jw-backup-agent.log"
  }
}
```

*   **`serverUrl`**: The address of your running JW-Webmail backend server.
*   **`registrationToken`**: Set to `"SECURITY_AUTH_REMOVED"` as requested to disable token checks, or enter the admin-panel registration token.
*   **`backupPath`**: Physical directory where the `.eml` mail backups will be written (Defaults to `/srv/mail-storage`).
*   **`mailboxCredentials`**: Local secure password mapping array so mailbox passwords are **never** stored in Firestore or sent to the frontend.

---

## 5. Backup Storage Directory Format

Backups are saved to `/srv/mail-storage` (or your custom `backupPath`) in standard RFC822/EML format to ensure high recoverability and prevent proprietary vendor lock-in:

```
/srv/mail-storage/
├── user1@playbook.com.ph/
│   ├── INBOX/
│   │   ├── msg_uid_1.eml
│   │   ├── msg_uid_2.eml
│   │   └── sync_state.json
│   ├── Sent/
│   ├── Drafts/
│   └── Trash/
└── user2@playbook.com.ph/
```

-   **`sync_state.json`**: Preserves Folder UIDs, last synchronizations, and known message IDs to ensure robust, resumeable, and **incremental** backups that never duplicate downloads or overload Bluehost IMAP.
