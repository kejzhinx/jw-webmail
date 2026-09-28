#!/bin/bash
set -e

# Require root/sudo
if [ "$EUID" -ne 0 ]; then
    echo "[ERROR] Please run this installer as root using sudo:"
    echo "        sudo bash install-linux.sh"
    exit 1
fi

echo "==============================================================="
echo "      JW-WEBMAIL AUTOMATIC EMAIL BACKUP SERVICE INSTALLER      "
echo "==============================================================="
echo ""
echo "This one-time installer configures the Automatic Mail Backup"
echo "Service to run silently in the background whenever this PC boots."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed on this host!"
    echo "        Please install Node.js 18+ and try again."
    exit 1
fi

echo "[OK] Node.js $(node -v) detected."

# Backup path selection
DEFAULT_PATH="/mnt/jw-mail-backup"
TARGET_PATH="${1:-}"

if [ -z "$TARGET_PATH" ]; then
    echo "---------------------------------------------------------------"
    echo "PHYSICAL BACKUP STORAGE LOCATION"
    echo "---------------------------------------------------------------"
    echo "Default location: $DEFAULT_PATH"
    echo ""
    read -r -p "Press ENTER to accept [$DEFAULT_PATH], or enter your physical folder path: " USER_INPUT
    TARGET_PATH="${USER_INPUT:-$DEFAULT_PATH}"
fi

echo "[OK] Physical Backup Path: $TARGET_PATH"
mkdir -p "$TARGET_PATH"

INSTALL_DIR="/opt/jw-mail-backup"
echo "Installing service into: $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cp "$SCRIPT_DIR/agent.mjs" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/uninstall-linux.sh" "$INSTALL_DIR/"

CONFIG_FILE="$INSTALL_DIR/backup-service-config.json"
if [ -f "$SCRIPT_DIR/backup-service-config.json" ]; then
    cp "$SCRIPT_DIR/backup-service-config.json" "$CONFIG_FILE"
else
    cat <<EOF > "$CONFIG_FILE"
{
  "serviceName": "JW-Mail-Backup-Service",
  "backupPath": "$TARGET_PATH",
  "serverUrl": "http://localhost:3000",
  "registrationToken": "SECURITY_AUTH_REMOVED",
  "syncIntervalSeconds": 120,
  "minFreeSpaceGb": 1.0,
  "heartbeatIntervalSeconds": 15
}
EOF
fi

# Update backupPath in config
node -e "
const fs = require('fs');
const file = '$CONFIG_FILE';
let c = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf-8')) : {};
c.backupPath = '$TARGET_PATH';
fs.writeFileSync(file, JSON.stringify(c, null, 2));
"

# Install dependencies
echo "Installing service dependencies..."
cd "$INSTALL_DIR"
npm install --production --no-audit --no-fund > /dev/null 2>&1
echo "[OK] Dependencies ready."

# Setup systemd service
SERVICE_FILE="/etc/systemd/system/jw-backup-agent.service"
echo "Configuring systemd service ($SERVICE_FILE)..."

NODE_BIN=$(command -v node)

cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=JW-Webmail Automatic Email Backup Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_BIN $INSTALL_DIR/agent.mjs
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable jw-backup-agent
systemctl restart jw-backup-agent

echo ""
echo "==============================================================="
echo "     INSTALLATION COMPLETE - AUTOMATIC BACKUP IS RUNNING        "
echo "==============================================================="
echo ""
echo "  * Status:              RUNNING in background (systemd)"
echo "  * Physical Location:   $TARGET_PATH"
echo "  * Auto-Start on Boot:  ENABLED"
echo "  * Polling Interval:    Every 2 minutes (Automatic)"
echo ""
echo "The service will automatically start whenever your PC restarts."
echo "You do NOT need to run any terminal commands or scripts daily."
echo ""
