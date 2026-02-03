#!/bin/bash
set -e

# ShieldPM Generic Installer (Linux AMD64/ARM64)
# (c) 2026 Shedowe

echo "=== ShieldPM Installer ==="

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit
fi

# 1. Create User
echo ">>> Creating 'shieldpm' user..."
if ! id "shieldpm" &>/dev/null; then
    useradd -r -s /bin/false -d /app shieldpm
fi
# Add to video/render groups if needed for hardware acceleration (future proofing)
usermod -aG video,render shieldpm 2>/dev/null || true

# 2. Install Dependencies
echo ">>> Installing runtime dependencies..."
apt-get update
# Dependencies matching those in Dockerfile runtime stage + common RPI tools
apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    iproute2 \
    iptables \
    tzdata \
    git \
    nodejs \
    python3 \
    python3-pip \
    python3-venv \
    libcap2-bin \
    tor \
    wget \
    sqlite3 \
    jq \
    gosu \
    tini

# Libs for Nginx/Lua (Must match what we linked against)
# Trixie/Bookworm package names might vary slightly, aiming for broad compatibility
apt-get install -y --no-install-recommends \
    libssl-dev \
    libpcre2-8-0 \
    zlib1g \
    libxml2 \
    libmaxminddb0 \
    liblmdb0 \
    libyajl2 \
    libgeoip1 \
    libluajit-5.1-2 \
    liblua5.1-0 \
    lua-cjson \
    libatomic1

# 3. Copy Files
echo ">>> Copying application files..."
cp -r app /
cp -r html /
cp -r usr/local/nginx /usr/local/
# Copy binaries but exclude python/pip related (we install them natively)
mkdir -p /usr/local/bin
find usr/local/bin -type f -not -name "python*" -not -name "pip*" -exec cp {} /usr/local/bin/ \;
cp -r usr/local/lib/* /usr/local/lib/

# 4. Setup Python Venv (Certbot)
echo ">>> Setting up Certbot venv..."
python3 -m venv /usr/local/certbot-venv
/usr/local/certbot-venv/bin/pip install --upgrade pip
# Install Certbot and plugins matching Dockerfile requirements
# (We might need a requirements.txt, or we just install valid versions)
/usr/local/certbot-venv/bin/pip install \
    certbot \
    certbot-dns-cloudflare \
    certbot-dns-route53 \
    certbot-dns-google \
    certbot-dns-digitalocean \
    certbot-dns-ovh \
    certbot-dns-rfc2136 \
    certbot-dns-linode

ln -sf /usr/local/certbot-venv/bin/certbot /usr/local/bin/certbot
# cp -r rootfs/* / # rootfs contains /etc overlays etc.
if [ -d "rootfs" ]; then
    cp -r rootfs/* /
fi

# 4. Permissions
echo ">>> Setting permissions..."
# Ensure nginx binary is executable
chmod +x /usr/local/nginx/sbin/nginx
# Ensure scripts are executable (update-shieldpm etc.)
chmod +x /usr/local/bin/*
# Permissions for /data directory (will be created if not exists)
mkdir -p /data/shieldpm /data/nginx /data/tls /data/access /data/logs /data/tor
chown -R shieldpm:shieldpm /app /data /html
# Nginx needs special permissions to bind ports < 1024 without root
setcap 'cap_net_bind_service=+ep' /usr/local/nginx/sbin/nginx

# 5. Libraries
echo ">>> Updating library paths..."
echo '/usr/local/lib' > /etc/ld.so.conf.d/shieldpm.conf
ldconfig

# 6. Service & User Context
echo ">>> Configuration Service..."
# Get shieldpm UID/GID
SPM_UID=$(id -u shieldpm)
SPM_GID=$(id -g shieldpm)
echo "Configuring service to run as UID=$SPM_UID GID=$SPM_GID"

# Create /etc/default/shieldpm
echo "PUID=$SPM_UID" > /etc/default/shieldpm
echo "PGID=$SPM_GID" >> /etc/default/shieldpm

# Enable EnvironmentFile in systemd service
if [ -f "/etc/systemd/system/shieldpm.service" ]; then
    sed -i "s|# EnvironmentFile=-/etc/default/shieldpm|EnvironmentFile=-/etc/default/shieldpm|g" /etc/systemd/system/shieldpm.service
    
    echo ">>> Enabling systemd service..."
    systemctl daemon-reload
    systemctl enable shieldpm.service
    echo "Service enabled. Run 'systemctl start shieldpm' to start."
else
    # Fallback check in /usr/lib/systemd/system/ (where we copied it from rootfs)
     if [ -f "/usr/lib/systemd/system/shieldpm.service" ]; then
        sed -i "s|# EnvironmentFile=-/etc/default/shieldpm|EnvironmentFile=-/etc/default/shieldpm|g" /usr/lib/systemd/system/shieldpm.service
        # Symlink if not in /etc
        ln -sf /usr/lib/systemd/system/shieldpm.service /etc/systemd/system/shieldpm.service
        
        systemctl daemon-reload
        systemctl enable shieldpm.service
        echo "Service enabled. Run 'systemctl start shieldpm' to start."
    else
        echo "WARNING: shieldpm.service not found."
    fi
fi

echo "=== Installation Complete ==="
echo "You can now reboot or start the service manually."
