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

install_node_26() {
    local NODE_MAJOR=26
    local NODESOURCE_KEYRING="/etc/apt/keyrings/nodesource.gpg"
    local NODESOURCE_LIST="/etc/apt/sources.list.d/nodesource.list"
    local NODE_PACKAGE_VERSION
    local NODE_VERSION
    local source_file

    echo ">>> Installing Node.js ${NODE_MAJOR}..."
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" | \
        gpg --dearmor --yes --output "$NODESOURCE_KEYRING"
    chmod a+r "$NODESOURCE_KEYRING"

    while IFS= read -r -d '' source_file; do
        if grep -qE 'deb[.]nodesource[.]com/node_[0-9]+[.]x' "$source_file"; then
            rm -f "$source_file"
        fi
    done < <(find /etc/apt/sources.list.d -maxdepth 1 -type f \( -name '*.list' -o -name '*.sources' \) -print0)

    printf 'deb [signed-by=%s] https://deb.nodesource.com/node_%s.x nodistro main\n' \
        "$NODESOURCE_KEYRING" "$NODE_MAJOR" > "$NODESOURCE_LIST"
    apt-get update
    NODE_PACKAGE_VERSION="$(apt-cache madison nodejs | awk '$3 ~ /^26\./ { print $3; exit }')"
    if [ -z "$NODE_PACKAGE_VERSION" ]; then
        echo "ERROR: NodeSource does not provide Node.js ${NODE_MAJOR} for this architecture."
        exit 1
    fi

    DEBIAN_FRONTEND=noninteractive apt-get install -y --allow-downgrades \
        "nodejs=${NODE_PACKAGE_VERSION}"
    if command -v corepack >/dev/null 2>&1; then
        corepack enable
        corepack install --global yarn@1.22.22
    else
        npm install --global yarn@1.22.22
    fi

    NODE_VERSION="$(node --version)"
    if [[ ! "$NODE_VERSION" =~ ^v26\. ]]; then
        echo "ERROR: Node.js ${NODE_MAJOR} installation failed; active version is $NODE_VERSION."
        exit 1
    fi

    echo "    Node.js $NODE_VERSION, npm $(npm --version), Yarn $(yarn --version)"
}

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
# Upgrade is necessary on Trixie to ensure kernel headers match
# Upgrade is necessary on Trixie to ensure kernel headers match, especially during t64 transition
DEBIAN_FRONTEND=noninteractive apt-get dist-upgrade -y
# Fix any broken dependencies from base image or previous runs
DEBIAN_FRONTEND=noninteractive apt-get --fix-broken install -y
apt-get install -y --no-install-recommends --fix-missing \
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
    gnupg \
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
    gosu \
    tini \
    tor \
    tzdata \
    util-linux \
    libyajl2 \
    zlib1g \
    zlib1g \
    zstd

install_node_26

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
             apt-get install -y --fix-missing mariadb-server mariadb-client libmariadb3 default-libmysqlclient-dev
             echo "--> Initializing MariaDB..."
             systemctl start mariadb
             # Create DB and User
             mysql -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};"
             mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
             mysql -e "GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';"
             mysql -e "FLUSH PRIVILEGES;"
        else
             echo "--> Installing MariaDB Client only..."
             apt-get install -y --fix-missing mariadb-client libmariadb3 default-libmysqlclient-dev
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
            apt-get install -y --fix-missing postgresql postgresql-contrib libpq-dev
            echo "--> Initializing PostgreSQL..."
            systemctl start postgresql
            # Create DB and User
            sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" || true
            sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" || true
        else
            echo "--> Installing PostgreSQL Client only..."
            apt-get install -y --fix-missing postgresql-client libpq-dev
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

# 11. CrowdSec IPS (Optional)
echo ""
echo "=== CrowdSec IPS (Optional) ==="
echo "CrowdSec detects and blocks malicious traffic using community threat intelligence."
echo "The Nginx Bouncer is already built-in. This installs the CrowdSec Agent locally."
echo ""
read -r -p "Install CrowdSec? [y/N] (Default: N): " cs_choice

if [[ "$cs_choice" =~ ^[Yy]$ ]]; then
    echo "--> Installing CrowdSec Agent..."
    curl -s https://install.crowdsec.net | bash
    apt-get install -y crowdsec

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

    # Install ShieldPM parser and collections
    echo "--> Installing CrowdSec parsers and collections..."
    
    # Download custom parser/collection from GitHub directly to target directories
    mkdir -p /etc/crowdsec/parsers/s01-parse/
    mkdir -p /etc/crowdsec/collections/
    
    wget -q -O /etc/crowdsec/parsers/s01-parse/shieldpm.yaml https://raw.githubusercontent.com/shedowe19/ShieldPM/develop/rootfs/etc/crowdsec/parser.yaml
    wget -q -O /etc/crowdsec/collections/shieldpm.yaml https://raw.githubusercontent.com/shedowe19/ShieldPM/develop/rootfs/etc/crowdsec/collection.yaml

    echo "  > Installed ShieldPM parser & collection"

    cscli hub update
    # Install standard collections/scenarios from hub
    cscli collections install crowdsecurity/base-http-scenarios 2>/dev/null || true
    cscli collections install crowdsecurity/http-cve 2>/dev/null || true
    cscli collections install crowdsecurity/appsec-virtual-patching 2>/dev/null || true
    cscli collections install crowdsecurity/appsec-generic-rules 2>/dev/null || true
    cscli collections install crowdsecurity/modsecurity 2>/dev/null || true
    cscli scenarios install crowdsecurity/nginx-req-limit-exceeded 2>/dev/null || true

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
        fi
        echo "  > CrowdSec installed and configured!"
        echo "  > Bouncer API Key: $CS_API_KEY"
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
    echo "--> Installing geoipupdate..."
    # Add MaxMind PPA and install
    apt-get install -y software-properties-common
    add-apt-repository -y ppa:maxmind/ppa 2>/dev/null || true
    apt-get update
    apt-get install -y geoipupdate || {
        # Fallback: direct download if PPA not available
        echo "  > PPA not available, trying direct install..."
        ARCH=$(dpkg --print-architecture)
        GEOIP_URL="https://github.com/maxmind/geoipupdate/releases/latest/download/geoipupdate_7.1.0_linux_${ARCH}.deb"
        curl -L -o /tmp/geoipupdate.deb "$GEOIP_URL" 2>/dev/null
        dpkg -i /tmp/geoipupdate.deb 2>/dev/null || apt-get install -f -y
        rm -f /tmp/geoipupdate.deb
    }

    # Prompt for MaxMind credentials
    echo ""
    echo "  Enter your MaxMind account details (from https://www.maxmind.com/en/accounts):"
    read -r -p "  Account ID: " GEOIP_ACCOUNT_ID
    read -r -p "  License Key: " GEOIP_LICENSE_KEY

    if [ -n "$GEOIP_ACCOUNT_ID" ] && [ -n "$GEOIP_LICENSE_KEY" ]; then
        # Write GeoIP config
        cat > /etc/GeoIP.conf << GEOIP_EOF
AccountID $GEOIP_ACCOUNT_ID
LicenseKey $GEOIP_LICENSE_KEY
EditionIDs GeoLite2-Country GeoLite2-City GeoLite2-ASN
DatabaseDirectory /data/nginx
GEOIP_EOF

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
echo "It runs as a sidecar proxy to filter traffic before it reaches Nginx."
echo ""
read -r -p "Install Anubis? [y/N] (Default: N): " anubis_choice

if [[ "$anubis_choice" =~ ^[Yy]$ ]]; then
    echo "--> Installing Anubis..."

    # Detect Architecture
    ARCH=$(dpkg --print-architecture)
    # Map Debian arch to Anubis binary naming (linux-amd64, linux-arm64)
    if [ "$ARCH" = "amd64" ]; then
        ANUBIS_ARCH="amd64"
    elif [ "$ARCH" = "arm64" ]; then
        ANUBIS_ARCH="arm64"
    else
        echo "  > Warning: Unsupported architecture $ARCH. Anubis might not work."
        ANUBIS_ARCH="$ARCH"
    fi

    VERSION="1.25.0"
    URL="https://github.com/TecharoHQ/anubis/releases/download/v${VERSION}/anubis-${VERSION}-linux-${ANUBIS_ARCH}.tar.gz"

    echo "  > Downloading from $URL..."
    curl -L -o /tmp/anubis.tar.gz "$URL"

    if [ -s /tmp/anubis.tar.gz ]; then
        tar -xzf /tmp/anubis.tar.gz -C /usr/local/bin --strip-components=2 "anubis-${VERSION}-linux-${ANUBIS_ARCH}/bin/anubis"
        rm /tmp/anubis.tar.gz
        chmod +x /usr/local/bin/anubis
        echo "  > Anubis installed to /usr/local/bin/anubis"

        # Enable in .env
        if grep -q "ANUBIS_ENABLED" "$ENV_FILE" 2>/dev/null; then
            sed -i "s|.*ANUBIS_ENABLED.*|ANUBIS_ENABLED=true|g" "$ENV_FILE"
        else
            echo "ANUBIS_ENABLED=true" >> "$ENV_FILE"
        fi
        echo "  > Enabled in $ENV_FILE"
    else
        echo "  > Download failed!"
    fi
else
    echo "--> Skipping Anubis."
fi

# 14. OAuth2 Proxy (Optional)
echo ""
echo "=== OAuth2 Proxy (Optional) ==="
echo "OAuth2 Proxy protects your applications using an external OAuth2 provider."
echo "It handles authentication flow and passes user identity to the backend."
echo ""
read -r -p "Install OAuth2 Proxy? [y/N] (Default: N): " oauth2_choice

if [[ "$oauth2_choice" =~ ^[Yy]$ ]]; then
    echo "--> Installing OAuth2 Proxy..."

    # Detect Architecture
    ARCH=$(dpkg --print-architecture)
    # Map Debian arch to OAuth2 Proxy binary naming (linux-amd64, linux-arm64)
    if [ "$ARCH" = "amd64" ]; then
        OAUTH2_ARCH="amd64"
    elif [ "$ARCH" = "arm64" ]; then
        OAUTH2_ARCH="arm64"
    else
        echo "  > Warning: Unsupported architecture $ARCH. OAuth2 Proxy might not work."
        OAUTH2_ARCH="$ARCH"
    fi

    if [ "$SHOULD_UPDATE_OAUTH2" = true ]; then
        OAUTH2_VERSION="7.14.2"
        OAUTH2_TARBALL="oauth2-proxy-v${OAUTH2_VERSION}.linux-${OAUTH2_ARCH}.tar.gz"
        OAUTH2_URL="https://github.com/oauth2-proxy/oauth2-proxy/releases/download/v${OAUTH2_VERSION}/${OAUTH2_TARBALL}"
        
        OAUTH2_TMP_DIR=$(mktemp -d)
        OAUTH2_TAR="$OAUTH2_TMP_DIR/$OAUTH2_TARBALL"

        echo "  > Downloading OAuth2 Proxy $OAUTH2_VERSION ($OAUTH2_ARCH)..."
        curl -L -f -o "$OAUTH2_TAR" "$OAUTH2_URL" || true

        if [ -s "$OAUTH2_TAR" ]; then
            cd "$OAUTH2_TMP_DIR"
            if tar -xzf "$OAUTH2_TARBALL"; then
                EXTRACTED_BIN="oauth2-proxy-v${OAUTH2_VERSION}.linux-${OAUTH2_ARCH}/oauth2-proxy"
                if [ -f "$EXTRACTED_BIN" ]; then
                    mv "$EXTRACTED_BIN" /usr/local/bin/oauth2-proxy
                    chmod +x /usr/local/bin/oauth2-proxy
                    echo "  > OAuth2 Proxy installed successfully."
                else
                    echo "  ! Failed to locate extracted OAuth2 Proxy binary."
                fi
            else
                echo "  ! Failed to extract OAuth2 Proxy."
            fi
            cd - > /dev/null
        else
            echo "  ! Failed to download OAuth2 Proxy. Check internet connection."
        fi
        rm -rf "$OAUTH2_TMP_DIR"
    fi
else
    echo "--> Skipping OAuth2 Proxy."
fi

# 15. OpenAppSec WAF (Optional)
echo ""
echo "=== OpenAppSec WAF (Optional) ==="
echo "OpenAppSec is an AI-based Web Application Firewall (WAF) that protects"
echo "against OWASP Top 10 threats using machine learning."
echo "The Nginx attachment module is already built-in."
echo ""
read -r -p "Install OpenAppSec Agent? [y/N] (Default: N): " oas_choice

if [[ "$oas_choice" =~ ^[Yy]$ ]]; then
    echo "--> Downloading OpenAppSec installer..."
    cd /tmp
    wget -q https://downloads.openappsec.io/open-appsec-install && chmod +x open-appsec-install

    # Ask about cloud portal
    echo ""
    echo "  OpenAppSec can be managed via the Cloud Portal (https://my.openappsec.io)"
    echo "  or locally via a policy file. Cloud management requires a Deployment Profile Token."
    echo ""
    read -r -p "  Enter AGENT_TOKEN (leave empty for local-only mode): " OAS_AGENT_TOKEN

    echo "--> Running OpenAppSec installer (agent only)..."
    # Run installer — ShieldPM already has the Nginx attachment module compiled in
    if [ -n "$OAS_AGENT_TOKEN" ]; then
        ./open-appsec-install --auto --token "$OAS_AGENT_TOKEN" || {
            echo "  > Automatic install failed, trying manual mode..."
            ./open-appsec-install --manual || true
        }
        echo "  > Connected to Cloud Portal with provided token."
    else
        ./open-appsec-install --auto || {
            echo "  > Automatic install failed, trying manual mode..."
            ./open-appsec-install --manual || true
        }

        # Create default local_policy.yaml for standalone mode
        APPSEC_CONF_DIR="/etc/cp/conf"
        mkdir -p "$APPSEC_CONF_DIR"
        if [ ! -f "$APPSEC_CONF_DIR/local_policy.yaml" ]; then
            cat > "$APPSEC_CONF_DIR/local_policy.yaml" << 'APPSEC_EOF'
# OpenAppSec Local Policy for ShieldPM
# Docs: https://docs.openappsec.io/
policies:
  default:
    mode: detect-learn
    practices:
      - web-attacks:
          override-mode: detect-learn
          minimum-confidence: medium
      - anti-bot:
          override-mode: detect-learn
          injected-URIs: []
          validated-URIs: []
    triggers:
      - log:
          verbosity: standard
          extendedLogging: true
          logToAgent: true
          logToCloud: false
APPSEC_EOF
            echo "  > Created default policy at $APPSEC_CONF_DIR/local_policy.yaml"
            echo "  > Default mode: detect-learn (logs only, does not block)"
            echo "  > Change to 'prevent-learn' to enable active blocking"
        fi
    fi

    # Ask about Advanced ML Model
    echo ""
    echo "  OpenAppSec offers an Advanced ML Model with improved detection accuracy."
    echo "  Download it from: https://my.openappsec.io or https://downloads.openappsec.io"
    echo ""
    read -r -p "  Path to Advanced Model .tgz (leave empty to skip): " OAS_MODEL_PATH

    if [ -n "$OAS_MODEL_PATH" ] && [ -f "$OAS_MODEL_PATH" ]; then
        mkdir -p /etc/cp/conf
        cp "$OAS_MODEL_PATH" /etc/cp/conf/open-appsec-advanced-model.tgz
        echo "  > Advanced Model installed at /etc/cp/conf/open-appsec-advanced-model.tgz"
    elif [ -n "$OAS_MODEL_PATH" ]; then
        echo "  > File not found: $OAS_MODEL_PATH — skipping Advanced Model."
    fi

    # Enable the Nginx module in .env
    if grep -q "NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE" "$ENV_FILE" 2>/dev/null; then
        sed -i "s|.*NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE.*|NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true|g" "$ENV_FILE"
    else
        echo "NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true" >> "$ENV_FILE"
    fi

    echo "  > OpenAppSec Agent installed!"
    echo "  > Manage with: open-appsec-ctl"
    if [ -z "$OAS_AGENT_TOKEN" ]; then
        echo "  > Policy file: /etc/cp/conf/local_policy.yaml"
        echo "  > Apply changes: open-appsec-ctl --apply-policy"
    else
        echo "  > Cloud Portal: https://my.openappsec.io"
    fi

    rm -f /tmp/open-appsec-install
else
    echo "--> Skipping OpenAppSec (can be installed later)."
fi

echo "=== Starting ShieldPM ==="
echo "--> Starting service to run initial migrations..."
systemctl start shieldpm

echo "--> Waiting 20 seconds for migrations to complete..."
sleep 20

echo "--> Restarting ShieldPM to load final configuration..."
systemctl restart shieldpm

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
