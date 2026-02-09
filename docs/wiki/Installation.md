# Installation

ShieldPM offers three deployment methods to suit your environment:
1.  **🐳 Docker (Recommended):** Best for most users. Easy updates, isolated environment.
2.  **📦 Native Installer:** Best for bare-metal Debian 13 (Trixie) servers.
3.  **🖥️ Proxmox LXC:** Best for Proxmox users (pre-configured container template).

---

## 1. 🐳 Docker (Recommended)

Requires Docker Engine and Docker Compose.

### Quick Start
1.  **Create a `compose.yaml` file:**
    ```yaml
    services:
      app:
        image: 'ghcr.io/shedowe19/shieldpm:latest'
        restart: unless-stopped
        ports:
          - '80:80'
          - '81:81'
          - '443:443'
        volumes:
          - ./data:/data
          - ./letsencrypt:/etc/letsencrypt
    ```

2.  **Start ShieldPM:**
    ```bash
    docker compose up -d
    ```

3.  **Access the Admin Panel:**
    Open `http://<your-ip>:81` in your browser.
    - **Email:** `admin@example.com`
    - **Password:** `changeme`

### Updating (Docker)
 simply pull the latest image and recreate the container:
```bash
docker compose pull
docker compose up -d
```

---

## 2. 📦 Native Installer (Debian 13 / Trixie)

This method installs ShieldPM directly onto a fresh Debian 13 system. It includes pre-compiled Nginx binaries with all modules (HTTP/3, ModSecurity, etc.), so **no compilation is required**.

### Prerequisites
- **OS:** Debian 13 (Trixie) - Fresh Install recommended.
- **Root Access**

### Installation
1.  **Download the Installer:**
    Get the latest `shieldpm-install-linux-<arch>.tar.gz` from [GitHub Releases](https://github.com/shedowe19/ShieldPM/releases).
    
    *Example (for AMD64):*
    ```bash
    wget https://github.com/shedowe19/ShieldPM/releases/latest/download/shieldpm-install-linux-amd64.tar.gz
    ```

2.  **Extract and Run:**
    ```bash
    tar -xzf shieldpm-install-linux-amd64.tar.gz
    sudo ./install.sh
    ```

3.  **Access:**
    Open `http://<your-ip>:81`.

### Updating (Native)
ShieldPM includes a self-updating utility. Run:
```bash
update-shieldpm
# OR simply
update
```
This command will:
1.  Check GitHub for updates.
2.  Upgrade system packages (`apt upgrade`).
3.  Update ShieldPM code.
4.  (Optional) Update Nginx binaries.

---

## 3. 🖥️ Proxmox LXC

For Proxmox users, we provide a pre-built LXC template based on Debian 13.

### Installation
1.  **Download Template:**
    Get `shieldpm-lxc-template-<arch>.tar.gz` from [GitHub Releases](https://github.com/shedowe19/ShieldPM/releases).
2.  **Upload to Proxmox:**
    Go to `local (pve) > CT Templates > Upload`.
3.  **Create CT:**
    Create a new container using this template.
4.  **Important Setting:**
    In the container **Options**, enable **Nesting**.
5.  **Start:**
    Boot the container. ShieldPM allows access via `http://<IP>:81` immediately.

### Updating (LXC)
Open the container console and run:
```bash
update
```

> [!WARNING]
> The **HTTP/3 BPF** feature (`NGINX_QUIC_BPF=true`) requires a **Privileged Container**. It is disabled by default and not available in unprivileged containers.

---

## ⚙️ Configuration (Environment Variables)

ShieldPM is configured via environment variables.
- **Docker:** Set them in `compose.yaml` under `services: app: environment:`.
- **Native / LXC:** Edit the file `/data/.env`.

### Reference Table

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DB_SQLITE_FILE` | `/data/shieldpm/database.sqlite` | Path to SQLite database file. |
| `DB_MYSQL_HOST` | - | MySQL Hostname. Triggers MySQL mode if set. |
| `DB_MYSQL_PORT` | `3306` | MySQL Port. |
| `DB_MYSQL_USER` | - | MySQL Username. |
| `DB_MYSQL_PASSWORD` | - | MySQL Password. |
| `DB_MYSQL_NAME` | - | MySQL Database Name. |
| `DB_MYSQL_SSL` | `false` | Enable SSL for MySQL connection (`true`/`false`). |
| `DB_POSTGRES_HOST` | - | PostgreSQL Hostname. Triggers Postgres mode if set. |
| `DB_POSTGRES_PORT` | `5432` | PostgreSQL Port. |
| `DB_POSTGRES_USER` | - | PostgreSQL Username. |
| `DB_POSTGRES_PASSWORD` | - | PostgreSQL Password. |
| `DB_POSTGRES_NAME` | - | PostgreSQL Database Name. |
| `DISABLE_IPV6` | `false` | Disable IPv6 support in Nginx (`true`/`false`). |
| `LOG_LEVEL` | `info` | API Log Level (`debug`, `info`, `warn`, `error`). |
| `WAF_MODSECURITY` | `false` | Enable ModSecurity globally (`true`/`false`). |
| `DEMO_MODE` | `false` | Enable read-only Demo Mode (`true`/`false`). |
| `DATA_PATH` | `/data` | Base path for data storage (Native/LXC only). |

### Example `.env` File
You can copy this into `/data/.env` (Native/LXC) or adapt for `compose.yaml`.

```dotenv
# ==============================================================================
# ShieldPM LXC Configuration (.env)
# ------------------------------------------------------------------------------
# ⚠️ WARNING: THIS IS A TEST RUN CONFIGURATION ⚠️
#
# This file is loaded automatically by the ShieldPM LXC container.
# Uncomment variables to enable features.
# ==============================================================================

# --- System Settings ---
TZ=Europe/Berlin
# PUID=0
# PGID=0
# CSRF_SECRET=your-secure-random-secret

# --- Network & Ports ---
# NPM_PORT=81
# GOA_PORT=91
# HTTP_PORT=80
# HTTPS_PORT=443
# HTTP3_ALT_SVC_PORT=443
# DISABLE_HTTP=false
# LISTEN_PROXY_PROTOCOL=false
# DISABLE_H3_QUIC=false

# --- Bindings ---
# IPV4_BINDING=127.0.0.1
# NPM_IPV4_BINDING=127.0.0.1
# GOA_IPV4_BINDING=127.0.0.1
# IPV6_BINDING=[::1]
# NPM_IPV6_BINDING=[::1]
# GOA_IPV6_BINDING=[::1]
# DISABLE_IPV6=true
# NPM_LISTEN_LOCALHOST=true
# GOA_LISTEN_LOCALHOST=true

# --- Database Connection (SQLite by default) ---
# DB_MYSQL_HOST=127.0.0.1
# DB_MYSQL_PORT=3306
# DB_MYSQL_USER=npm
# DB_MYSQL_PASSWORD=npm
# DB_MYSQL_NAME=npm
# DB_MYSQL_SSL=false
# DB_MYSQL_SSL_REJECT_UNAUTHORIZED=true
# DB_MYSQL_SSL_VERIFY_IDENTITY=true

# DB_POSTGRES_HOST=127.0.0.1
# DB_POSTGRES_PORT=5432
# DB_POSTGRES_USER=npm
# DB_POSTGRES_PASSWORD=npm
# DB_POSTGRES_NAME=npm

# --- ACME & SSL ---
# ACME_EMAIL=your-email
# ACME_SERVER=https://acme-v02.api.letsencrypt.org/directory
# ACME_EAB_KID=123456789abcdef
# ACME_EAB_HMAC_KEY=123456789abcdef
# ACME_MUST_STAPLE=true
# ACME_OCSP_STAPLING=true
# ACME_PROFILE=shortlived
# ACME_KEY_TYPE=rsa
# ACME_SERVER_TLS_VERIFY=false

# DEFAULT_CERT_ID=1
# CUSTOM_OCSP_STAPLING=true
# CRT=72

# --- Analytics & Logging ---
# LOGROTATE=true
# LOGROTATIONS=7
# NGINX_LOG_NOT_FOUND=true
# GOA=true
# GOACLA=--agent-list --real-os --double-decode --anonymize-ip --anonymize-level=2 --keep-last=7 --with-output-resolver --no-query-string

# --- PHP Options ---
# PHP82=true
# PHP82_APKS=php8.2-curl php8.2-openssl
# PHP83=true
# PHP83_APKS=php8.3-curl php8.3-openssl
# PHP84=true
# PHP84_APKS=php8.4-curl php8.4-openssl

# --- Advanced Nginx ---
# NGINX_QUIC_BPF=true
# NGINX_DISABLE_PROXY_BUFFERING=true
# NGINX_404_REDIRECT=true
# NGINX_HSTS_SUBDOMAINS=false
# X_FRAME_OPTIONS=deny
# NGINX_WORKER_PROCESSES=8
# NGINX_WORKER_CONNECTIONS=1024
# DISABLE_NGINX_BEAUTIFIER=true
# FULLCLEAN=true
# SKIP_IP_RANGES=false
# IPRT=3

# --- OpenAppSec ---
# NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true
# NGINX_LOAD_GEOIP2_MODULE=true
# NGINX_LOAD_NJS_MODULE=true
# NGINX_LOAD_NTLM_MODULE=true
# NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE=true
# DOCKER_HOSTS=tcp://10.10.10.1:2375,tcp://10.10.10.2:2375

# --- Initialization ---
# INITIAL_ADMIN_EMAIL=<initial@email.tld>
# INITIAL_ADMIN_PASSWORD=<initial-password>
# INITIAL_DEFAULT_PAGE=444
# ENABLE_PRERUN=true

# --- Tor Onion Services ---
# TOR_ENABLED=true
```
