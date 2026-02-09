#!/bin/bash
set -e

# ShieldPM Generic Installer (Linux AMD64/ARM64)
# (c) 2026 Shedowe
# 
# This script is bundled with the shieldpm-install-linux-*.tar.gz package.
# The tarball already contains pre-built binaries from the nginx-binaries release.

echo "=== ShieldPM Installer ==="

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

# 1. Create User
echo ">>> Creating 'shieldpm' user..."
if ! id "shieldpm" &>/dev/null; then
    useradd -r -s /bin/false -d /app shieldpm
fi
# Add to video/render groups if needed for hardware acceleration (future proofing)
usermod -aG video,render shieldpm 2>/dev/null || true

# 2. Install Runtime Dependencies
echo ">>> Installing runtime dependencies..."
apt-get update
apt-get install -y --no-install-recommends \
    libargon2-1 \
    bash \
    bash-completion \
    brotli \
    ca-certificates \
    coreutils \
    curl \
    fcgiwrap \
    findutils \
    geoip-bin \
    goaccess \
    grep \
    jq \
    libatomic1 \
    libssl3 \
    libedit2 \
    libldap-common \
    liblua5.1-0 \
    libmaxminddb0 \
    libxml2 \
    liblmdb0 \
    logrotate \
    lua-cjson \
    libluajit-5.1-2 \
    nano \
    nodejs \
    openssl \
    libpcre2-8-0 \
    python3 \
    gosu \
    tini \
    tor \
    tzdata \
    util-linux \
    libyajl2 \
    zlib1g \
    zstd

# 3. Copy Pre-built Binaries (Nginx, Certbot, Cloudflared, Libs)
echo ">>> Installing pre-built binaries..."
# The tarball structure already mirrors the final filesystem layout
if [ -d "usr" ]; then
    cp -r usr/* /usr/
fi

# 4. Copy Application Files
echo ">>> Copying application files..."
cp -r app /
cp -r html /

# 5. Copy Rootfs Overlays (Systemd service, scripts, configs)
echo ">>> Installing system configs..."
if [ -d "rootfs" ]; then
    cp -r rootfs/* /
fi

# 6. Permissions
echo ">>> Setting permissions..."
chmod +x /usr/local/nginx/sbin/nginx
chmod +x /usr/local/bin/*

# Create data directories
mkdir -p /data/shieldpm /data/nginx /data/tls /data/access /data/logs /data/tor
chown -R shieldpm:shieldpm /app /data /html

# Nginx needs special permissions to bind ports < 1024 without root
setcap 'cap_net_bind_service=+ep' /usr/local/nginx/sbin/nginx

# 7. Libraries
echo ">>> Updating library paths..."
echo '/usr/local/lib' > /etc/ld.so.conf.d/shieldpm.conf
ldconfig

# 8. Symlinks
echo ">>> Creating symlinks..."
ln -sf /usr/local/nginx/sbin/nginx /usr/local/bin/nginx

# 9. Service Configuration
echo ">>> Configuring systemd service..."
SPM_UID=$(id -u shieldpm)
SPM_GID=$(id -g shieldpm)
echo "Configuring service to run as UID=$SPM_UID GID=$SPM_GID"

# Create /etc/default/shieldpm
echo "PUID=$SPM_UID" > /etc/default/shieldpm
echo "PGID=$SPM_GID" >> /etc/default/shieldpm

# Enable EnvironmentFile in systemd service
SERVICE_FILE=""
if [ -f "/etc/systemd/system/shieldpm.service" ]; then
    SERVICE_FILE="/etc/systemd/system/shieldpm.service"
elif [ -f "/usr/lib/systemd/system/shieldpm.service" ]; then
    SERVICE_FILE="/usr/lib/systemd/system/shieldpm.service"
    ln -sf "$SERVICE_FILE" /etc/systemd/system/shieldpm.service
fi

if [ -n "$SERVICE_FILE" ]; then
    sed -i "s|# EnvironmentFile=-/etc/default/shieldpm|EnvironmentFile=-/etc/default/shieldpm|g" "$SERVICE_FILE"
    systemctl daemon-reload
    systemctl enable shieldpm.service
    echo "Service enabled. Run 'systemctl start shieldpm' to start."
    echo "Service enabled. Run 'systemctl start shieldpm' to start."
else
    echo "WARNING: shieldpm.service not found."
fi

# 10. Database Configuration (Interactive)
ENV_FILE="/data/.env"
echo ""
echo "=== Database Configuration ==="
echo "Select the database engine for ShieldPM:"
echo "1) SQLite (Default, easiest setup)"
echo "2) MySQL / MariaDB (Recommended for production)"
echo "3) PostgreSQL"
echo ""
read -p "Enter choice [1-3] (Default: 1): " db_choice

# Ensure .env exists
if [ ! -f "$ENV_FILE" ]; then
    cp "/rootfs/data/.env" "$ENV_FILE" 2>/dev/null || true
    # If copy failed (because we are inside install script where rootfs is likely already at /), try /data/.env
    if [ ! -f "$ENV_FILE" ]; then
        echo "Creating default .env..."
        touch "$ENV_FILE"
    fi
fi

case "$db_choice" in
    2)
        echo "--> Configuring for MySQL/MariaDB..."
        sed -i 's/^# DB_MYSQL_/DB_MYSQL_/g' "$ENV_FILE"
        sed -i 's/^DB_POSTGRES_/# DB_POSTGRES_/g' "$ENV_FILE"
        sed -i 's/^DB_SQLITE_/# DB_SQLITE_/g' "$ENV_FILE"
        echo "  > MySQL options enabled in $ENV_FILE. Please edit the file to set credentials!"
        ;;
    3)
        echo "--> Configuring for PostgreSQL..."
        sed -i 's/^# DB_POSTGRES_/DB_POSTGRES_/g' "$ENV_FILE"
        sed -i 's/^DB_MYSQL_/# DB_MYSQL_/g' "$ENV_FILE"
        sed -i 's/^DB_SQLITE_/# DB_SQLITE_/g' "$ENV_FILE"
        echo "  > PostgreSQL options enabled in $ENV_FILE. Please edit the file to set credentials!"
        ;;
    *)
        echo "--> Configuring for SQLite (Default)..."
        # SQLite is default, ensure others are commented out
        sed -i 's/^DB_MYSQL_/# DB_MYSQL_/g' "$ENV_FILE"
        sed -i 's/^DB_POSTGRES_/# DB_POSTGRES_/g' "$ENV_FILE"
        # Ensure SQLite path is uncommented if present (or just rely on default)
        sed -i 's/^# DB_SQLITE_FILE/DB_SQLITE_FILE/g' "$ENV_FILE"
        ;;
esac

echo "=== Installation Complete ==="
echo "You can now reboot or start the service manually with:"
echo "  systemctl start shieldpm"
