# Configuration

ShieldPM is configured via **Environment Variables**. No config file editing is required for basic setup — just set the variables and restart.

- **Docker:** Set them in `compose.yaml` under `services: app: environment:`.
- **Native / LXC:** Edit the file `/data/.env`.

---

## 🌍 General Settings

| Variable      | Description                                                                     | Default          |
| :------------ | :------------------------------------------------------------------------------ | :--------------- |
| `TZ`          | Timezone ([List](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)) | `Europe/Berlin`  |
| `PUID`        | User ID for file ownership                                                      | `0`              |
| `PGID`        | Group ID for file ownership                                                     | `0`              |
| `CSRF_SECRET` | Persistent CSRF secret (at least 32 characters); keep it outside source control | random per start |

## 🌐 Network & Ports

| Variable                | Description                                                                     | Default |
| :---------------------- | :------------------------------------------------------------------------------ | :------ |
| `NPM_PORT`              | Port for the Admin Web UI                                                       | `81`    |
| `HTTP_PORT`             | Port for HTTP traffic (public)                                                  | `80`    |
| `HTTPS_PORT`            | Port for HTTPS traffic (public)                                                 | `443`   |
| `GOA_PORT`              | Port for GoAccess Analytics Dashboard                                           | `91`    |
| `DISABLE_HTTP`          | Disable HTTP listener entirely (HTTPS only)                                     | `false` |
| `DISABLE_H3_QUIC`       | Disable HTTP/3 (QUIC) support                                                   | `false` |
| `HTTP3_ALT_SVC_PORT`    | Port advertised in the `Alt-Svc` header for HTTP/3                              | `443`   |
| `LISTEN_PROXY_PROTOCOL` | Enable HAProxy PROXY protocol support on port 80/443                            | `false` |
| `TRUST_PROXY`           | Express proxy trust policy; accepts only the validated values documented below. | `false` |

`TRUST_PROXY` affects client IP detection, rate limits and audit attribution. The application fails closed to `false`
when the variable is absent. The official Compose files explicitly set `1` because the image uses one local Nginx hop
and a `/data` bind mount hides its bundled environment file. The hardened parser accepts only `false` (direct backend
access) or `1` (that supported single-proxy topology); broad truthy values and arbitrary CIDRs are rejected. Forwarded
headers from an untrusted topology must not influence security decisions.

### IP Binding

Use these to restrict which IP addresses ShieldPM listens on:

| Variable               | Description                                  | Default         |
| :--------------------- | :------------------------------------------- | :-------------- |
| `IPV4_BINDING`         | Bind HTTP/HTTPS to a specific IPv4 address   | `0.0.0.0` (all) |
| `IPV6_BINDING`         | Bind HTTP/HTTPS to a specific IPv6 address   | `[::]` (all)    |
| `DISABLE_IPV6`         | Completely disable IPv6 listeners            | `false`         |
| `NPM_LISTEN_LOCALHOST` | Bind Admin UI to localhost only (127.0.0.1)  | `false`         |
| `GOA_LISTEN_LOCALHOST` | Bind Analytics to localhost only (127.0.0.1) | `false`         |

> [!TIP]
> Set `NPM_LISTEN_LOCALHOST=true` if you access the Admin UI through a reverse proxy or tunnel. This prevents direct access via port 81 from the network.

---

## 💾 Database Configuration

ShieldPM supports **three database backends**. SQLite is the default and works out of the box.

### SQLite (Default — No Configuration Required)

Data is stored in `/data/shieldpm/database.sqlite`. Best for small to medium installations.

### MySQL / MariaDB

| Variable            | Description                | Default |
| :------------------ | :------------------------- | :------ |
| `DB_MYSQL_HOST`     | Database hostname or IP    | —       |
| `DB_MYSQL_PORT`     | Database port              | `3306`  |
| `DB_MYSQL_USER`     | Database username          | —       |
| `DB_MYSQL_PASSWORD` | Database password          | —       |
| `DB_MYSQL_NAME`     | Database name              | —       |
| `DB_MYSQL_SSL`      | Use SSL for the connection | `false` |

### PostgreSQL

| Variable               | Description             | Default |
| :--------------------- | :---------------------- | :------ |
| `DB_POSTGRES_HOST`     | Database hostname or IP | —       |
| `DB_POSTGRES_PORT`     | Database port           | `5432`  |
| `DB_POSTGRES_USER`     | Database username       | —       |
| `DB_POSTGRES_PASSWORD` | Database password       | —       |
| `DB_POSTGRES_NAME`     | Database name           | —       |

### 🔄 Automatic Database Migration

If you switch from SQLite to MySQL/PostgreSQL:

1. ShieldPM detects the empty target database on startup
2. It finds the existing `/data/shieldpm/database.sqlite`
3. All data is automatically migrated to the new database
4. The old file is renamed to `database.sqlite.migrated`

> [!IMPORTANT]
> This only works for migrating **from SQLite to an external DB**. Migrating between MySQL and PostgreSQL is not supported automatically.

---

## 🔐 SSL & ACME (Let's Encrypt)

| Variable             | Description                                     | Default                  |
| :------------------- | :---------------------------------------------- | :----------------------- |
| `ACME_EMAIL`         | Email for Let's Encrypt registration            | —                        |
| `ACME_SERVER`        | Custom ACME server URL                          | Let's Encrypt Production |
| `ACME_EAB_KID`       | External Account Binding Key ID                 | —                        |
| `ACME_EAB_HMAC_KEY`  | External Account Binding HMAC Key               | —                        |
| `ACME_MUST_STAPLE`   | Enable OCSP Must-Staple extension               | `false`                  |
| `ACME_OCSP_STAPLING` | Enable OCSP Stapling                            | `false`                  |
| `ACME_KEY_TYPE`      | Key type: `rsa` or `ecdsa`                      | `ecdsa`                  |
| `DEFAULT_CERT_ID`    | ID of the default SSL certificate for all hosts | `0`                      |
| `CRT`                | Hours between certificate renewal checks        | `23`                     |

> [!WARNING]
> Set `ACME_EMAIL` to a monitored address. Some configured ACME providers require it, and it is needed for important
> expiry or account notices.

---

## 📊 Analytics & Logging

| Variable                           | Description                                                                       | Default                                 |
| :--------------------------------- | :-------------------------------------------------------------------------------- | :-------------------------------------- |
| `GOA`                              | Enable GoAccess Analytics dashboard (port `GOA_PORT`)                             | `false`                                 |
| `GOACLA`                           | Custom GoAccess command-line arguments                                            | See `.env` example                      |
| `LOGROTATE`                        | Enable log rotation (rotates daily)                                               | `false`                                 |
| `LOGROTATIONS`                     | Number of rotated log files to keep                                               | `3`                                     |
| `NGINX_LOG_NOT_FOUND`              | Log 404 errors in the access log                                                  | `false`                                 |
| `ANALYTICS_SPOOL_PATH`             | Durable NDJSON ingestion spool; must be a normalized absolute path below `/data/` | `/data/shieldpm/analytics-spool.ndjson` |
| `ANALYTICS_SPOOL_MAX_BYTES`        | Maximum spool size in bytes                                                       | `67108864`                              |
| `ANALYTICS_SPOOL_RECORD_MAX_BYTES` | Maximum size of one record in bytes                                               | `262144`                                |
| `ANALYTICS_SPOOL_BATCH_RECORDS`    | Maximum records replayed in one database transaction                              | `250`                                   |

The spool is fsync-backed and replayed after restart. A database ingestion ledger makes replay idempotent; successful
records are compacted only after the corresponding database transaction commits. If a limit is reached, ShieldPM
rejects additional analytics records instead of silently discarding older uncommitted data.

---

## ⚙️ Advanced Nginx

| Variable                        | Description                                    | Default              |
| :------------------------------ | :--------------------------------------------- | :------------------- |
| `NGINX_WORKER_PROCESSES`        | Number of Nginx worker processes               | `auto` (= CPU cores) |
| `NGINX_WORKER_CONNECTIONS`      | Max connections per worker                     | `512`                |
| `NGINX_QUIC_BPF`                | Enable BPF for QUIC (requires privileged)      | `false`              |
| `NGINX_DISABLE_PROXY_BUFFERING` | Disable proxy buffering globally               | `false`              |
| `NGINX_404_REDIRECT`            | Redirect 404 hosts to the default site         | `false`              |
| `NGINX_HSTS_SUBDOMAINS`         | Include subdomains in HSTS header              | `true`               |
| `X_FRAME_OPTIONS`               | X-Frame-Options header value                   | `sameorigin`         |
| `DISABLE_NGINX_BEAUTIFIER`      | Disable automatic formatting of Nginx configs  | `false`              |
| `FULLCLEAN`                     | Run a full config cleanup on startup           | `false`              |
| `SKIP_IP_RANGES`                | Skip setting real IP ranges (Cloudflare, etc.) | `true`               |
| `IPRT`                          | IP Ranges refresh interval in hours            | `1`                  |

---

## 🐘 PHP

| Variable     | Description                 | Default |
| :----------- | :-------------------------- | :------ |
| `PHP82`      | Enable PHP 8.2 FPM          | `false` |
| `PHP82_APKS` | Additional PHP 8.2 packages | —       |
| `PHP83`      | Enable PHP 8.3 FPM          | `false` |
| `PHP83_APKS` | Additional PHP 8.3 packages | —       |
| `PHP84`      | Enable PHP 8.4 FPM          | `false` |
| `PHP84_APKS` | Additional PHP 8.4 packages | —       |

> [!TIP]
> See the [PHP Hosting](PHP-Hosting) wiki page for a complete guide on hosting PHP applications.

---

## 🧩 Module Loading

| Variable                                  | Description                             | Default |
| :---------------------------------------- | :-------------------------------------- | :------ |
| `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE` | Load OpenAppSec WAF module              | `false` |
| `NGINX_LOAD_GEOIP2_MODULE`                | Load GeoIP2 module                      | `false` |
| `NGINX_LOAD_NJS_MODULE`                   | Load Nginx JavaScript (njs) module      | `false` |
| `NGINX_LOAD_NTLM_MODULE`                  | Load NTLM authentication module         | `false` |
| `NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE`  | Load virtual host traffic status module | `false` |

---

## 🚀 Initialization

| Variable                         | Description                                                                                       | Default           |
| :------------------------------- | :------------------------------------------------------------------------------------------------ | :---------------- |
| `INITIAL_ADMIN_SETUP_TOKEN`      | Explicit one-time ownership token with at least 256 bits of randomness                            | generated         |
| `INITIAL_ADMIN_SETUP_TOKEN_FILE` | Path to a regular token file with mode `0600` or stricter; preferred for orchestrated deployments | —                 |
| `INITIAL_DEFAULT_PAGE`           | Default page for undefined hostnames (`444` = close connection)                                   | `congratulations` |
| `ENABLE_PRERUN`                  | Execute `/data/prerun.sh` before startup                                                          | `false`           |

When neither setup-token variable is provided, ShieldPM creates
`/data/shieldpm/initial-admin-setup-token`. The first user can only be created when the exact token is supplied through
the `X-ShieldPM-Setup-Token` request header. Claim and user creation are one database transaction, so racing requests
cannot create two initial administrators. The generated token file is removed after a successful claim. Never put the
token in a URL, image, log or committed Compose file; use a mounted secret file where possible.

---

## 🐳 Docker-Specific

| Variable         | Description                                                  | Default |
| :--------------- | :----------------------------------------------------------- | :------ |
| `DOCKER_HOSTS`   | Additional Docker hosts for Auto-Discovery (comma-separated) | —       |
| `TOR_ENABLED`    | Enable the Tor daemon for Onion Services                     | `true`  |
| `ANUBIS_ENABLED` | Enable the Anubis AI Firewall                                | `true`  |

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
