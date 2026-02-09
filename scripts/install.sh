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

# 1. User Creation (Skipped - Running as root)
# echo ">>> Creating 'shieldpm' user..."
# if ! id "shieldpm" &>/dev/null; then
#     useradd -r -s /bin/false -d /app shieldpm
# fi
# Add to video/render groups if needed for hardware acceleration (future proofing)
# usermod -aG video,render shieldpm 2>/dev/null || true

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
# chown -R shieldpm:shieldpm /app /data /html (Skipped - Running as root)

# Nginx needs special permissions to bind ports < 1024 without root
# setcap 'cap_net_bind_service=+ep' /usr/local/nginx/sbin/nginx

# 7. Libraries
echo ">>> Updating library paths..."
echo '/usr/local/lib' > /etc/ld.so.conf.d/shieldpm.conf
ldconfig

# 8. Symlinks
echo ">>> Creating symlinks..."
ln -sf /usr/local/nginx/sbin/nginx /usr/local/bin/nginx

# 9. Service Configuration
echo ">>> Configuring systemd service..."
# SPM_UID=$(id -u shieldpm)
# SPM_GID=$(id -g shieldpm)
SPM_UID=$(id -u root)
SPM_GID=$(id -g root)
echo "Configuring service to run as UID=$SPM_UID GID=$SPM_GID"

# Create /etc/default/shieldpm
echo "PUID=$SPM_UID" > /etc/default/shieldpm
echo "PGID=$SPM_GID" >> /etc/default/shieldpm

# Enable EnvironmentFile in systemd service
SERVICE_FILE=""
if [ -f "/etc/systemd/system/shieldpm.service" ]; then
    SERVICE_FILE="/etc/systemd/system/shieldpm.service"
elif [ -f "/usr/lib/systemd/system/shieldpm.service" ]; then
    SERVICE_FILE="/etc/systemd/system/shieldpm.service"
    cp "/usr/lib/systemd/system/shieldpm.service" "$SERVICE_FILE"
fi

if [ -n "$SERVICE_FILE" ]; then
    sed -i "s|# EnvironmentFile=-/etc/default/shieldpm|EnvironmentFile=-/etc/default/shieldpm|g" "$SERVICE_FILE"
    systemctl daemon-reload
    systemctl enable shieldpm.service
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
read -r -p "Enter choice [1-3] (Default: 1): " db_choice

# Ensure .env exists
if [ ! -f "$ENV_FILE" ]; then
    cp "/rootfs/data/.env" "$ENV_FILE" 2>/dev/null || true
    # If copy failed (because we are inside install script where rootfs is likely already at /), try /data/.env
    if [ ! -f "$ENV_FILE" ]; then
        echo "Creating default .env..."
        touch "$ENV_FILE"
    fi
fi

# Function to prompt for DB credentials
prompt_db_creds() {
    local default_host="127.0.0.1"
    local default_port="$1"
    local default_user="npm"
    local default_pass="npm"
    local default_name="npm"

    echo "  > SELECT SETUP MODE:"
    echo "    1) Local (Default): Install DB Server locally & use default credentials ($default_user/$default_pass)"
    echo "    2) Manual / External: Enter connection details manually"
    read -r -p "    Enter choice [1-2] (Default: 1): " db_mode

    if [[ "$db_mode" == "2" ]]; then
        read -r -p "    DB Host (Default: $default_host): " DB_HOST
        DB_HOST=${DB_HOST:-$default_host}
        read -r -p "    DB Port (Default: $default_port): " DB_PORT
        DB_PORT=${DB_PORT:-$default_port}
        read -r -p "    DB Name (Default: $default_name): " DB_NAME
        DB_NAME=${DB_NAME:-$default_name}
        read -r -p "    DB User (Default: $default_user): " DB_USER
        DB_USER=${DB_USER:-$default_user}
        read -r -p "    DB Password (Default: $default_pass): " DB_PASS
        DB_PASS=${DB_PASS:-$default_pass}
        
        # Don't install server if external (unless user wants to, but assume external means existing)
        if [[ "$DB_HOST" != "127.0.0.1" && "$DB_HOST" != "localhost" ]]; then
             INSTALL_LOCAL_DB=false
        else
             INSTALL_LOCAL_DB=true
        fi
    else
        DB_HOST=$default_host
        DB_PORT=$default_port
        DB_USER=$default_user
        DB_PASS=$default_pass
        DB_NAME=$default_name
        INSTALL_LOCAL_DB=true
    fi
}

case "$db_choice" in
    2)
        echo "--> Configuring for MySQL/MariaDB..."
        prompt_db_creds "3306"

        if [ "$INSTALL_LOCAL_DB" = true ]; then
             echo "--> Installing MariaDB Server & Client..."
             apt-get update
             apt-get install -y mariadb-server mariadb-client libmariadb3 default-libmysqlclient-dev
             echo "--> Initializing MariaDB..."
             systemctl start mariadb
             # Create DB and User
             mysql -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};"
             mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
             mysql -e "GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';"
             mysql -e "FLUSH PRIVILEGES;"
        else
             echo "--> Installing MariaDB Client only..."
             apt-get install -y mariadb-client libmariadb3 default-libmysqlclient-dev
        fi

        # Update .env
        sed -i 's/^# DB_MYSQL_/DB_MYSQL_/g' "$ENV_FILE"
        sed -i 's/^DB_POSTGRES_/# DB_POSTGRES_/g' "$ENV_FILE"
        sed -i 's/^DB_SQLITE_/# DB_SQLITE_/g' "$ENV_FILE"

        # Set values
        sed -i "s|^DB_MYSQL_HOST=.*|DB_MYSQL_HOST=${DB_HOST}|g" "$ENV_FILE"
        sed -i "s|^DB_MYSQL_PORT=.*|DB_MYSQL_PORT=${DB_PORT}|g" "$ENV_FILE"
        sed -i "s|^DB_MYSQL_USER=.*|DB_MYSQL_USER=${DB_USER}|g" "$ENV_FILE"
        sed -i "s|^DB_MYSQL_PASSWORD=.*|DB_MYSQL_PASSWORD=${DB_PASS}|g" "$ENV_FILE"
        sed -i "s|^DB_MYSQL_NAME=.*|DB_MYSQL_NAME=${DB_NAME}|g" "$ENV_FILE"
        
        echo "  > MySQL configured in $ENV_FILE."
        ;;
    3)
        echo "--> Configuring for PostgreSQL..."
        prompt_db_creds "5432"

        if [ "$INSTALL_LOCAL_DB" = true ]; then
            echo "--> Installing PostgreSQL Server & Client..."
            apt-get update
            apt-get install -y postgresql postgresql-contrib libpq-dev
            echo "--> Initializing PostgreSQL..."
            systemctl start postgresql
            # Create DB and User
            sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" || true
            sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" || true
        else
            echo "--> Installing PostgreSQL Client only..."
            apt-get install -y postgresql-client libpq-dev
        fi

        # Update .env
        sed -i 's/^# DB_POSTGRES_/DB_POSTGRES_/g' "$ENV_FILE"
        sed -i 's/^DB_MYSQL_/# DB_MYSQL_/g' "$ENV_FILE"
        sed -i 's/^DB_SQLITE_/# DB_SQLITE_/g' "$ENV_FILE"

        # Set values
        sed -i "s|^DB_POSTGRES_HOST=.*|DB_POSTGRES_HOST=${DB_HOST}|g" "$ENV_FILE"
        sed -i "s|^DB_POSTGRES_PORT=.*|DB_POSTGRES_PORT=${DB_PORT}|g" "$ENV_FILE"
        sed -i "s|^DB_POSTGRES_USER=.*|DB_POSTGRES_USER=${DB_USER}|g" "$ENV_FILE"
        sed -i "s|^DB_POSTGRES_PASSWORD=.*|DB_POSTGRES_PASSWORD=${DB_PASS}|g" "$ENV_FILE"
        sed -i "s|^DB_POSTGRES_NAME=.*|DB_POSTGRES_NAME=${DB_NAME}|g" "$ENV_FILE"

        echo "  > PostgreSQL configured in $ENV_FILE."
        ;;
    *)
        echo "--> Configuring for SQLite (Default)..."
        # SQLite is default, just ensure others are commented out
        sed -i 's/^DB_MYSQL_/# DB_MYSQL_/g' "$ENV_FILE"
        sed -i 's/^DB_POSTGRES_/# DB_POSTGRES_/g' "$ENV_FILE"
        ;;
esac

echo "=== Starting ShieldPM ==="
echo "--> Starting service to run initial migrations..."
systemctl start shieldpm

echo "--> Waiting 20 seconds for migrations to complete..."
sleep 20

echo "--> Restarting ShieldPM to load final configuration..."
systemctl restart shieldpm

echo "=== Installation Complete ==="
echo "ShieldPM is running. Access it at http://<your-ip>:81"
