#!/usr/bin/env bash
set -Eeo pipefail
umask 077

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

INSTALLER_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
cd "$INSTALLER_DIR"

verify_prerequisites() {
    local command

    for command in apt-get bash chmod cp dirname mkdir sed sha256sum systemctl tar; do
        command -v "$command" >/dev/null 2>&1 || {
            echo "ERROR: Missing installer prerequisite: $command" >&2
            exit 1
        }
    done

    if [ -f SHA256SUMS ]; then
        sha256sum --check --strict SHA256SUMS
    else
        echo "ERROR: Native installer package has no SHA256SUMS manifest." >&2
        exit 1
    fi

    echo "    Verified the complete installer payload."
}

verify_prerequisites

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
apt-get install -y --no-install-recommends --fix-missing \
    libargon2-1 \
    bash \
    bash-completion \
    brotli \
    ca-certificates \
    coreutils \
    curl \
    build-essential \
    fcgiwrap \
    findutils \
    geoip-bin \
    goaccess \
    grep \
    gnupg \
    git \
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
    openssl \
    libpcre2-8-0 \
    python3 \
    python3-dev \
    gosu \
    tini \
    tor \
    tzdata \
    util-linux \
    libyajl2 \
    zlib1g \
    zlib1g \
    zstd

[ -f setup-node-apt.sh ] || {
    echo "ERROR: The verified installer payload has no setup-node-apt.sh." >&2
    exit 1
}
bash ./setup-node-apt.sh
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nodejs
npm install --global --ignore-scripts corepack@0.36.0
corepack enable
corepack install --global yarn@4.18.0
[[ "$(node --version)" =~ ^v24\. ]] || {
    echo "ERROR: Node.js 24 installation failed; active version is $(node --version)." >&2
    exit 1
}
[[ "$(corepack --version)" == "0.36.0" ]] || {
    echo "ERROR: Corepack 0.36.0 activation failed; active version is $(corepack --version)." >&2
    exit 1
}
[[ "$(yarn --version)" == "4.18.0" ]] || {
    echo "ERROR: Yarn 4.18.0 activation failed; active version is $(yarn --version)." >&2
    exit 1
}

# 2.1 Configure Locale (Interactive)
echo ">>> Configuring locales..."
echo "    Please select your desired system locale (e.g., en_US.UTF-8 or de_DE.UTF-8)."
dpkg-reconfigure locales

# 3. Copy Pre-built Binaries (Nginx, Certbot, Cloudflared, Libs)
echo ">>> Installing pre-built binaries..."
# The tarball structure already mirrors the final filesystem layout
if [ -d "usr" ]; then
    cp -r usr/* /usr/
fi

# 4. Copy Application Files
echo ">>> Copying application files..."
for application_directory in /app /html; do
    if [ -d "$application_directory" ] && \
        [ -n "$(find "$application_directory" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
        echo "ERROR: $application_directory is not empty. Use update-shieldpm for an existing installation." >&2
        exit 1
    fi
done
cp -a app /
cp -a html /

# 5. Copy Rootfs Overlays (Systemd service, scripts, configs)
echo ">>> Installing system configs..."
if [ -d "rootfs" ]; then
    # /data is persistent operator state and must never be overwritten by the installer overlay.
    tar --create --directory rootfs --exclude='./data' --file - . | tar --extract --directory / --file -
fi

for bundled_binary in anubis oauth2-proxy; do
    if [ -f "/app/$bundled_binary" ] && [ ! -L "/app/$bundled_binary" ]; then
        install -m 0755 "/app/$bundled_binary" "/usr/local/bin/$bundled_binary"
    fi
done

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
    cp "$INSTALLER_DIR/rootfs/data/.env" "$ENV_FILE"
fi
chmod 0600 "$ENV_FILE"
install -d -m 0700 /data/shieldpm/secrets

set_env_value() {
    local key="$1"
    local value="$2"
    local temporary
    local found=false

    [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || return 1
    temporary=$(mktemp "${ENV_FILE}.XXXXXXXX")
    while IFS= read -r line || [ -n "$line" ]; do
        if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?#?[[:space:]]*${key}= ]]; then
            if [ "$found" = false ]; then
                printf '%s=%s\n' "$key" "$value" >> "$temporary"
                found=true
            fi
        else
            printf '%s\n' "$line" >> "$temporary"
        fi
    done < "$ENV_FILE"
    if [ "$found" = false ]; then
        printf '%s=%s\n' "$key" "$value" >> "$temporary"
    fi
    chmod 0600 "$temporary"
    mv -f "$temporary" "$ENV_FILE"
}

disable_env_prefix() {
    local prefix="$1"
    local temporary
    temporary=$(mktemp "${ENV_FILE}.XXXXXXXX")
    while IFS= read -r line || [ -n "$line" ]; do
        if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?${prefix}[A-Z0-9_]*= ]]; then
            printf '# %s\n' "$line" >> "$temporary"
        else
            printf '%s\n' "$line" >> "$temporary"
        fi
    done < "$ENV_FILE"
    chmod 0600 "$temporary"
    mv -f "$temporary" "$ENV_FILE"
}

validate_database_fields() {
    [[ "$DB_HOST" =~ ^[A-Za-z0-9._:-]{1,253}$ ]] || {
        echo "ERROR: Invalid database host." >&2
        exit 1
    }
    [[ "$DB_PORT" =~ ^[0-9]{1,5}$ ]] && [ "$DB_PORT" -ge 1 ] && [ "$DB_PORT" -le 65535 ] || {
        echo "ERROR: Invalid database port." >&2
        exit 1
    }
    [[ "$DB_USER" =~ ^[A-Za-z_][A-Za-z0-9_.-]{0,62}$ ]] || {
        echo "ERROR: Invalid database user name." >&2
        exit 1
    }
    [[ "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_.-]{0,62}$ ]] || {
        echo "ERROR: Invalid database name." >&2
        exit 1
    }
    [ -n "$DB_PASS" ] || {
        echo "ERROR: Database passwords must not be empty." >&2
        exit 1
    }
}

# Function to prompt for DB credentials
prompt_db_creds() {
    local default_host="127.0.0.1"
    local default_port="$1"
    local default_user="shieldpm"
    local default_name="shieldpm"

    echo "  > SELECT SETUP MODE:"
    echo "    1) Local (Default): Install a local DB server with a generated random password"
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
        read -r -s -p "    DB Password: " DB_PASS
        echo
        
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
        DB_NAME=$default_name
        DB_PASS=$(openssl rand -hex 24)
        INSTALL_LOCAL_DB=true
    fi
    validate_database_fields
}

case "$db_choice" in
    2)
        echo "--> Configuring for MySQL/MariaDB..."
        prompt_db_creds "3306"

        if [ "$INSTALL_LOCAL_DB" = true ]; then
             echo "--> Installing MariaDB Server & Client..."
             apt-get update
             apt-get install -y --fix-missing mariadb-server mariadb-client libmariadb3 default-libmysqlclient-dev
             echo "--> Initializing MariaDB..."
             systemctl start mariadb
             DB_PASS_SQL=$(printf '%s' "$DB_PASS" | sed -e 's/\\/\\\\/g' -e "s/'/''/g")
             mysql --batch <<MYSQL_SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS_SQL}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS_SQL}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS_SQL}';
ALTER USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS_SQL}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
MYSQL_SQL
        else
             echo "--> Installing MariaDB Client only..."
             apt-get install -y --fix-missing mariadb-client libmariadb3 default-libmysqlclient-dev
        fi

        disable_env_prefix DB_MYSQL_
        disable_env_prefix DB_POSTGRES_
        DB_SECRET_FILE=/data/shieldpm/secrets/db_mysql_password
        printf '%s' "$DB_PASS" > "$DB_SECRET_FILE"
        chmod 0600 "$DB_SECRET_FILE"
        set_env_value DB_MYSQL_HOST "$DB_HOST"
        set_env_value DB_MYSQL_PORT "$DB_PORT"
        set_env_value DB_MYSQL_USER "$DB_USER"
        set_env_value DB_MYSQL_PASSWORD_FILE "$DB_SECRET_FILE"
        set_env_value DB_MYSQL_NAME "$DB_NAME"
        unset DB_PASS DB_PASS_SQL
        
        echo "  > MySQL configured in $ENV_FILE."
        ;;
    3)
        echo "--> Configuring for PostgreSQL..."
        prompt_db_creds "5432"

        if [ "$INSTALL_LOCAL_DB" = true ]; then
            echo "--> Installing PostgreSQL Server & Client..."
            apt-get update
             apt-get install -y --fix-missing postgresql postgresql-contrib libpq-dev
             echo "--> Initializing PostgreSQL..."
             systemctl start postgresql
             DB_PASS_SQL=$(printf '%s' "$DB_PASS" | sed "s/'/''/g")
             if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
                 runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c \
                     "ALTER USER \"${DB_USER}\" WITH PASSWORD '${DB_PASS_SQL}';"
             else
                 runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c \
                     "CREATE USER \"${DB_USER}\" WITH PASSWORD '${DB_PASS_SQL}';"
             fi
             if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
                 runuser -u postgres -- createdb --owner "$DB_USER" "$DB_NAME"
             fi
        else
            echo "--> Installing PostgreSQL Client only..."
            apt-get install -y --fix-missing postgresql-client libpq-dev
        fi

        disable_env_prefix DB_MYSQL_
        disable_env_prefix DB_POSTGRES_
        DB_SECRET_FILE=/data/shieldpm/secrets/db_postgres_password
        printf '%s' "$DB_PASS" > "$DB_SECRET_FILE"
        chmod 0600 "$DB_SECRET_FILE"
        set_env_value DB_POSTGRES_HOST "$DB_HOST"
        set_env_value DB_POSTGRES_PORT "$DB_PORT"
        set_env_value DB_POSTGRES_USER "$DB_USER"
        set_env_value DB_POSTGRES_PASSWORD_FILE "$DB_SECRET_FILE"
        set_env_value DB_POSTGRES_NAME "$DB_NAME"
        unset DB_PASS DB_PASS_SQL

        echo "  > PostgreSQL configured in $ENV_FILE."
        ;;
    *)
        echo "--> Configuring for SQLite (Default)..."
        disable_env_prefix DB_MYSQL_
        disable_env_prefix DB_POSTGRES_
        ;;
esac

# 11. CrowdSec IPS (Optional)
echo ""
echo "=== CrowdSec IPS (Optional) ==="
echo "CrowdSec detects and blocks malicious traffic using community threat intelligence."
echo "The Nginx Bouncer is already built-in. This installs the CrowdSec Agent locally."
echo ""
read -r -p "Install CrowdSec? [y/N] (Default: N): " cs_choice

if [[ "$cs_choice" =~ ^[Yy]$ ]]; then
    echo "--> Installing CrowdSec Agent from the configured signed APT repositories..."
    apt-get install -y --no-install-recommends crowdsec || {
        echo "ERROR: CrowdSec is unavailable in the configured signed APT repositories." >&2
        echo "Configure CrowdSec's official signed repository separately, then run the installer again." >&2
        exit 1
    }

    # Create acquis with native log paths (/data/nginx/ instead of Docker's /opt/shieldpm/nginx/)
    ACQUIS_DIR="/etc/crowdsec/acquis.d"
    mkdir -p "$ACQUIS_DIR"
    cat > "$ACQUIS_DIR/shieldpm.yaml" << 'ACQUIS_EOF'
filenames:
  - /data/nginx/json_access.log
  - /data/nginx/error.log
labels:
  type: shieldpm
ACQUIS_EOF

    # Install the parser and collection from the already checksummed release payload.
    echo "--> Installing verified ShieldPM CrowdSec configuration..."
    install -d -m 0755 /etc/crowdsec/parsers/s01-parse /etc/crowdsec/collections
    install -m 0644 "$INSTALLER_DIR/rootfs/etc/crowdsec/parser.yaml" \
        /etc/crowdsec/parsers/s01-parse/shieldpm.yaml
    install -m 0644 "$INSTALLER_DIR/rootfs/etc/crowdsec/collection.yaml" \
        /etc/crowdsec/collections/shieldpm.yaml

    echo "  > Installed ShieldPM parser & collection"

    # Generate bouncer API key and auto-configure
    echo "--> Configuring CrowdSec Bouncer..."
    CS_API_KEY=$(cscli bouncers add shieldpm-bouncer -o raw 2>/dev/null || echo "")
    if [ -n "$CS_API_KEY" ]; then
        # Ensure crowdsec.conf exists (start.sh provisions it, but we run before first start)
        mkdir -p /data/crowdsec
        if [ ! -f /data/crowdsec/crowdsec.conf ]; then
            cp /usr/local/nginx/conf/conf.d/include/crowdsec.conf /data/crowdsec/crowdsec.conf 2>/dev/null || true
        fi
        if [ -f /data/crowdsec/crowdsec.conf ]; then
            sed -i "s|^API_KEY=.*|API_KEY=$CS_API_KEY|g" /data/crowdsec/crowdsec.conf
            sed -i "s|^API_URL=.*|API_URL=http://127.0.0.1:8080|g" /data/crowdsec/crowdsec.conf
            sed -i "s|^ENABLED.*|ENABLED=true|g" /data/crowdsec/crowdsec.conf
            chmod 0600 /data/crowdsec/crowdsec.conf
        fi
        echo "  > CrowdSec installed and configured!"
        echo "  > The generated bouncer key was written to the private CrowdSec config."
    else
        echo "  > CrowdSec installed but bouncer key generation failed."
        echo "  > After startup, run: cscli bouncers add shieldpm-bouncer"
        echo "  > Then set API_KEY in /data/crowdsec/crowdsec.conf"
    fi

    systemctl enable crowdsec
    systemctl start crowdsec
    echo "  > CrowdSec Agent is running."
else
    echo "--> Skipping CrowdSec (can be installed later)."
fi

# 12. GeoIP Database Updates (Optional)
echo ""
echo "=== GeoIP Database Updates (Optional) ==="
echo "MaxMind GeoIP databases enable geographic analytics and country-based blocking."
echo "This installs 'geoipupdate' to automatically download GeoLite2 databases."
echo "Requires a free MaxMind account: https://www.maxmind.com/en/geolite2/signup"
echo ""
read -r -p "Install GeoIP Update? [y/N] (Default: N): " geoip_choice

if [[ "$geoip_choice" =~ ^[Yy]$ ]]; then
    echo "--> Installing geoipupdate from the configured signed APT repositories..."
    apt-get install -y --no-install-recommends geoipupdate || {
        echo "ERROR: geoipupdate is unavailable in the configured signed APT repositories." >&2
        exit 1
    }

    # Prompt for MaxMind credentials
    echo ""
    echo "  Enter your MaxMind account details (from https://www.maxmind.com/en/accounts):"
    read -r -p "  Account ID: " GEOIP_ACCOUNT_ID
    read -r -s -p "  License Key: " GEOIP_LICENSE_KEY
    echo

    if [ -n "$GEOIP_ACCOUNT_ID" ] && [ -n "$GEOIP_LICENSE_KEY" ]; then
        # Write GeoIP config
        cat > /etc/GeoIP.conf << GEOIP_EOF
AccountID $GEOIP_ACCOUNT_ID
LicenseKey $GEOIP_LICENSE_KEY
EditionIDs GeoLite2-Country GeoLite2-City GeoLite2-ASN
DatabaseDirectory /data/nginx
GEOIP_EOF
        chmod 0600 /etc/GeoIP.conf

        # Run initial download
        echo "--> Downloading GeoIP databases to /data/nginx/..."
        mkdir -p /data/nginx
        geoipupdate -v 2>&1 || echo "  > Initial download failed. Check your credentials."

        # Setup weekly cron job (every Wednesday at 3 AM)
        cat > /etc/cron.d/geoipupdate << 'CRON_EOF'
# GeoIP Database Update (weekly)
0 3 * * 3 root /usr/bin/geoipupdate > /dev/null 2>&1
CRON_EOF
        chmod 644 /etc/cron.d/geoipupdate

        echo "  > GeoIP configured! Databases will auto-update weekly."
        echo "  > Files: /data/nginx/GeoLite2-Country.mmdb, GeoLite2-City.mmdb, GeoLite2-ASN.mmdb"
        echo "  > Enable in ShieldPM: set NGINX_LOAD_GEOIP2_MODULE=true in /data/.env"
    else
        echo "  > Skipped: No credentials provided. Configure manually in /etc/GeoIP.conf"
    fi
else
    echo "--> Skipping GeoIP Update (can be installed later)."
fi

# 13. Anubis AI Firewall (Optional)
echo ""
echo "=== Anubis AI Firewall (Optional) ==="
echo "Anubis weighs the soul of incoming HTTP requests to stop AI crawlers."
echo "The checksummed release payload already contains its pinned binary."
echo ""
read -r -p "Enable Anubis? [y/N] (Default: N): " anubis_choice

if [[ "$anubis_choice" =~ ^[Yy]$ ]]; then
    [ -x /usr/local/bin/anubis ] || {
        echo "ERROR: Verified Anubis binary is missing from the release payload." >&2
        exit 1
    }
    set_env_value ANUBIS_ENABLED true
    echo "  > Anubis enabled in $ENV_FILE"
else
    set_env_value ANUBIS_ENABLED false
    echo "--> Anubis remains disabled."
fi

# 14. OAuth2 Proxy
echo ""
echo "=== OAuth2 Proxy ==="
echo "OAuth2 Proxy protects your applications using an external OAuth2 provider."
echo "Its pinned binary is installed but starts only for an assigned OAuth2 access list."
[ -x /usr/local/bin/oauth2-proxy ] || {
    echo "ERROR: Verified OAuth2 Proxy binary is missing from the release payload." >&2
    exit 1
}

# 15. OpenAppSec WAF (Optional)
echo ""
echo "=== OpenAppSec WAF (Optional) ==="
echo "OpenAppSec is an AI-based Web Application Firewall (WAF) that protects"
echo "against OWASP Top 10 threats using machine learning."
echo "The Nginx attachment module is already built-in."
echo ""
read -r -p "Enable a pre-installed OpenAppSec Agent? [y/N] (Default: N): " oas_choice

if [[ "$oas_choice" =~ ^[Yy]$ ]]; then
    command -v open-appsec-ctl >/dev/null 2>&1 || {
        echo "ERROR: OpenAppSec is not installed." >&2
        echo "Install it separately through a reviewed, signed vendor package; this installer never executes a mutable remote script." >&2
        exit 1
    }
    set_env_value NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE true
    echo "  > Enabled the module for the existing OpenAppSec installation."
else
    set_env_value NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE false
    echo "--> OpenAppSec remains disabled."
fi

echo "=== Starting ShieldPM ==="
echo "--> Starting service to run initial migrations..."
systemctl start shieldpm

frontend_port=$(sed -n 's/^[[:space:]]*NPM_PORT=\([0-9][0-9]*\)[[:space:]]*$/\1/p' "$ENV_FILE" | tail -n 1)
frontend_port=${frontend_port:-81}
echo "--> Waiting up to 120 seconds for migrations and all health checks..."
health_deadline=$((SECONDS + 120))
until systemctl is-active --quiet shieldpm && \
      curl --fail --silent --show-error --max-time 3 --unix-socket /run/shieldpm.sock \
          http://localhost/ | jq -e '.status == "OK"' >/dev/null && \
      nginx -tq >/dev/null 2>&1 && \
      [ -s /html/frontend/index.html ] && \
      curl --fail --silent --show-error --max-time 3 "http://127.0.0.1:${frontend_port}/" >/dev/null; do
    if [ "$SECONDS" -ge "$health_deadline" ]; then
        systemctl --no-pager --full status shieldpm || true
        journalctl --no-pager -u shieldpm -n 100 || true
        echo "ERROR: ShieldPM did not become healthy within 120 seconds." >&2
        exit 1
    fi
    sleep 1
done

echo "=== Installation Complete ==="
echo "ShieldPM is installed. A system reboot is recommended to apply all changes."
read -p "Reboot now? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    reboot
else
    echo "Please reboot manually to ensure all services start correctly."
    echo "Access ShieldPM at http://<your-ip>:81"
fi
