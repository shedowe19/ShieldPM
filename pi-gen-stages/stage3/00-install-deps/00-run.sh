#!/bin/bash -e
# Add Raspberry Pi repository for RPI-specific packages

echo "=== Adding Raspberry Pi Repository ==="

on_chroot << 'EOF'
# Add Raspberry Pi archive signing key
curl -fsSL https://archive.raspberrypi.com/debian/raspberrypi.gpg.key | gpg --dearmor -o /usr/share/keyrings/raspberrypi-archive-keyring.gpg

# Add Raspberry Pi repository
echo "deb [signed-by=/usr/share/keyrings/raspberrypi-archive-keyring.gpg] http://archive.raspberrypi.com/debian/ trixie main" > /etc/apt/sources.list.d/raspi.list

# Update package list
apt-get update
EOF

echo "Raspberry Pi repository added successfully"
