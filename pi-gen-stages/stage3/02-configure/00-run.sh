#!/bin/bash -e
# Configure ShieldPM for Raspberry Pi

echo "=== Configuring ShieldPM ==="

# Copy rootfs overlays (systemd units, configs, scripts)
# These files should be placed in the files/ subdirectory
if [ -d "${STAGE_WORK_DIR}/02-configure/files" ]; then
    cp -rv "${STAGE_WORK_DIR}/02-configure/files/"* "${ROOTFS_DIR}/" || true
fi

on_chroot << EOF
# Create symlinks
ln -sf /usr/local/nginx/sbin/nginx /usr/local/bin/nginx
ln -sf /app/password-reset.js /usr/local/bin/password-reset.js
ln -sf /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js
ln -sf /app/index.js /usr/local/bin/index.js
ln -sf /usr/local/bin/update-shieldpm /usr/bin/update

# Make scripts executable
chmod +x /usr/local/bin/* 2>/dev/null || true

# Create required directories
mkdir -p /var/log/nginx
mkdir -p /data/shieldpm
mkdir -p /data/nginx
mkdir -p /data/tls
mkdir -p /data/access
mkdir -p /data/logs

# Mask systemd units that don't work in containerized/minimal environments
# (These are less aggressive than LXC since we have full hardware access)
systemctl mask systemd-logind.service || true

# Enable ShieldPM service
systemctl enable shieldpm.service || true

# Enable SSH
systemctl enable ssh || true

# Set hostname
echo "shieldpm" > /etc/hostname

# Update /etc/hosts
sed -i 's/raspberrypi/shieldpm/g' /etc/hosts || true
echo "127.0.1.1 shieldpm" >> /etc/hosts

# Set LD_LIBRARY_PATH for ModSecurity
echo '/usr/local/lib' > /etc/ld.so.conf.d/shieldpm.conf
ldconfig

# Enable IP forwarding (useful for proxy)
echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.d/99-shieldpm.conf
echo 'net.ipv6.conf.all.forwarding=1' >> /etc/sysctl.d/99-shieldpm.conf

EOF

echo "ShieldPM configuration complete!"
