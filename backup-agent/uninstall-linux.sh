#!/bin/bash
set -e

# Require root/sudo
if [ "$EUID" -ne 0 ]; then
    echo "[ERROR] Please run this uninstaller as root using sudo:"
    echo "        sudo bash uninstall-linux.sh"
    exit 1
fi

echo "==============================================================="
echo "     JW-WEBMAIL AUTOMATIC BACKUP LINUX UNINSTALLER"
echo "==============================================================="

# 1. Stop and disable systemd service
if systemctl is-active --quiet jw-backup-agent 2>/dev/null; then
    echo "Stopping jw-backup-agent service..."
    systemctl stop jw-backup-agent || true
fi

if systemctl is-enabled --quiet jw-backup-agent 2>/dev/null; then
    echo "Disabling jw-backup-agent service..."
    systemctl disable jw-backup-agent || true
fi

# 2. Remove systemd unit file
if [ -f "/etc/systemd/system/jw-backup-agent.service" ]; then
    echo "Removing systemd service file..."
    rm -f /etc/systemd/system/jw-backup-agent.service
    systemctl daemon-reload
fi

# 3. Remove files in /opt
rm -rf /opt/jw-mail-backup /opt/jw-backup-agent

echo ""
echo "[OK] Background service uninstalled."
echo "Note: Your backed-up email files in your physical storage were NOT deleted."
echo ""
