# Configuration

ShieldPM is configured via **Environment Variables**. No config file editing is required for basic setup — just set the variables and restart.

- **Docker:** Set them in `compose.yaml` under `services: app: environment:`.
- **Native / LXC:** Edit the file `/data/.env`.

---

## 🌍 General Settings

| Variable | Description | Default |
| :--- | :--- | :--- |
| `TZ` | Timezone ([List](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)) | `UTC` |
| `PUID` | User ID for file ownership | `0` |
| `PGID` | Group ID for file ownership | `0` |
| `CSRF_SECRET` | Secret for CSRF token generation. Set a random string for extra security. | Auto-generated |

## 🌐 Network & Ports

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NPM_PORT` | Port for the Admin Web UI | `81` |
| `HTTP_PORT` | Port for HTTP traffic (public) | `80` |
| `HTTPS_PORT` | Port for HTTPS traffic (public) | `443` |
| `GOA_PORT` | Port for GoAccess Analytics Dashboard | `91` |
| `DISABLE_HTTP` | Disable HTTP listener entirely (HTTPS only) | `false` |
| `DISABLE_H3_QUIC` | Disable HTTP/3 (QUIC) support | `false` |
| `HTTP3_ALT_SVC_PORT` | Port advertised in the `Alt-Svc` header for HTTP/3 | `443` |
| `LISTEN_PROXY_PROTOCOL` | Enable HAProxy PROXY protocol support on port 80/443 | `false` |

### IP Binding

Use these to restrict which IP addresses ShieldPM listens on:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `IPV4_BINDING` | Bind HTTP/HTTPS to a specific IPv4 address | `0.0.0.0` (all) |
| `IPV6_BINDING` | Bind HTTP/HTTPS to a specific IPv6 address | `[::]` (all) |
| `DISABLE_IPV6` | Completely disable IPv6 listeners | `false` |
| `NPM_LISTEN_LOCALHOST` | Bind Admin UI to localhost only (127.0.0.1) | `false` |
| `GOA_LISTEN_LOCALHOST` | Bind Analytics to localhost only (127.0.0.1) | `false` |

> [!TIP]
> Set `NPM_LISTEN_LOCALHOST=true` if you access the Admin UI through a reverse proxy or tunnel. This prevents direct access via port 81 from the network.

---

## 💾 Database Configuration

ShieldPM supports **three database backends**. SQLite is the default and works out of the box.

### SQLite (Default — No Configuration Required)

Data is stored in `/data/database.sqlite`. Best for small to medium installations.

### MySQL / MariaDB

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DB_MYSQL_HOST` | Database hostname or IP | — |
| `DB_MYSQL_PORT` | Database port | `3306` |
| `DB_MYSQL_USER` | Database username | — |
| `DB_MYSQL_PASSWORD` | Database password | — |
| `DB_MYSQL_NAME` | Database name | — |
| `DB_MYSQL_SSL` | Use SSL for the connection | `false` |

### PostgreSQL

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DB_POSTGRES_HOST` | Database hostname or IP | — |
| `DB_POSTGRES_PORT` | Database port | `5432` |
| `DB_POSTGRES_USER` | Database username | — |
| `DB_POSTGRES_PASSWORD` | Database password | — |
| `DB_POSTGRES_NAME` | Database name | — |

### 🔄 Automatic Database Migration

If you switch from SQLite to MySQL/PostgreSQL:

1. ShieldPM detects the empty target database on startup
2. It finds the existing `database.sqlite` in `/data`
3. All data is automatically migrated to the new database
4. The old file is renamed to `database.sqlite.migrated`

> [!IMPORTANT]
> This only works for migrating **from SQLite to an external DB**. Migrating between MySQL and PostgreSQL is not supported automatically.

---

## 🔐 SSL & ACME (Let's Encrypt)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `ACME_EMAIL` | Email for Let's Encrypt registration | — |
| `ACME_SERVER` | Custom ACME server URL | Let's Encrypt Production |
| `ACME_EAB_KID` | External Account Binding Key ID | — |
| `ACME_EAB_HMAC_KEY` | External Account Binding HMAC Key | — |
| `ACME_MUST_STAPLE` | Enable OCSP Must-Staple extension | `false` |
| `ACME_OCSP_STAPLING` | Enable OCSP Stapling | `true` |
| `ACME_KEY_TYPE` | Key type: `rsa` or `ec` | `ec` |
| `DEFAULT_CERT_ID` | ID of the default SSL certificate for all hosts | — |
| `CRT` | Certificate renewal threshold in hours | `72` |

> [!WARNING]
> You **must** set `ACME_EMAIL` to use Let's Encrypt certificates. Without it, certificate requests will fail.

---

## 📊 Analytics & Logging

| Variable | Description | Default |
| :--- | :--- | :--- |
| `GOA` | Enable GoAccess Analytics dashboard (port `GOA_PORT`) | `false` |
| `GOACLA` | Custom GoAccess command-line arguments | See `.env` example |
| `LOGROTATE` | Enable log rotation (rotates daily) | `false` |
| `LOGROTATIONS` | Number of rotated log files to keep | `7` |
| `NGINX_LOG_NOT_FOUND` | Log 404 errors in the access log | `true` |

---

## ⚙️ Advanced Nginx

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NGINX_WORKER_PROCESSES` | Number of Nginx worker processes | `auto` (= CPU cores) |
| `NGINX_WORKER_CONNECTIONS` | Max connections per worker | `1024` |
| `NGINX_QUIC_BPF` | Enable BPF for QUIC (requires privileged) | `false` |
| `NGINX_DISABLE_PROXY_BUFFERING` | Disable proxy buffering globally | `false` |
| `NGINX_404_REDIRECT` | Redirect 404 hosts to the default site | `false` |
| `NGINX_HSTS_SUBDOMAINS` | Include subdomains in HSTS header | `false` |
| `X_FRAME_OPTIONS` | X-Frame-Options header value | `sameorigin` |
| `DISABLE_NGINX_BEAUTIFIER` | Disable automatic formatting of Nginx configs | `false` |
| `FULLCLEAN` | Run a full config cleanup on startup | `false` |
| `SKIP_IP_RANGES` | Skip setting real IP ranges (Cloudflare, etc.) | `false` |
| `IPRT` | IP Ranges refresh interval in hours | `3` |

---

## 🐘 PHP

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PHP82` | Enable PHP 8.2 FPM | `false` |
| `PHP82_APKS` | Additional PHP 8.2 packages | — |
| `PHP83` | Enable PHP 8.3 FPM | `false` |
| `PHP83_APKS` | Additional PHP 8.3 packages | — |
| `PHP84` | Enable PHP 8.4 FPM | `false` |
| `PHP84_APKS` | Additional PHP 8.4 packages | — |

> [!TIP]
> See the [PHP Hosting](PHP-Hosting) wiki page for a complete guide on hosting PHP applications.

---

## 🧩 Module Loading

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE` | Load OpenAppSec WAF module | `false` |
| `NGINX_LOAD_GEOIP2_MODULE` | Load GeoIP2 module | `false` |
| `NGINX_LOAD_NJS_MODULE` | Load Nginx JavaScript (njs) module | `false` |
| `NGINX_LOAD_NTLM_MODULE` | Load NTLM authentication module | `false` |
| `NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE` | Load virtual host traffic status module | `false` |

---

## 🚀 Initialization

| Variable | Description | Default |
| :--- | :--- | :--- |
| `INITIAL_ADMIN_EMAIL` | Override the default admin email on first start | `admin@example.com` |
| `INITIAL_ADMIN_PASSWORD` | Override the default admin password on first start | `changeme` |
| `INITIAL_DEFAULT_PAGE` | Default page for undefined hostnames (`444` = close connection) | `congratulations` |
| `ENABLE_PRERUN` | Execute `/data/prerun.sh` before startup | `false` |

---

## 🐳 Docker-Specific

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DOCKER_HOSTS` | Additional Docker hosts for Auto-Discovery (comma-separated) | — |
| `TOR_ENABLED` | Enable the Tor daemon for Onion Services | `true` |
| `ANUBIS_ENABLED` | Enable the Anubis AI Firewall | `true` |

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
