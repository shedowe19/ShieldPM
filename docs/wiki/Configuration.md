# Configuration

ShieldPM stores its migrated application options in the database and manages them through **Settings**. Certificate, Cloudflare IP-range, analytics retention and Nginx formatting options apply without restarting. Deployment configuration and the remaining environment-based options are configured below and generally require a restart.

- **Docker:** Set them in `compose.yaml` under the configured service's `environment:` (`shieldpm` in the main repository samples, `app` in `docker-compose.demo.yaml`). The main samples use host networking; the demo and other bridge deployments must publish the required ports, including `443/udp` for HTTP/3.
- **Native / LXC:** Edit the file `/data/.env`.

Set `TZ` to a valid timezone; startup validation rejects a missing or invalid value. At container startup, `/data/.env` is sourced after the Compose environment. If the same variable is set in both places, the value in `/data/.env` takes precedence. Keep each setting in one place to avoid surprises.

---

## 🌍 General Settings

| Variable      | Description                                                                                     | Default                               |
| :------------ | :---------------------------------------------------------------------------------------------- | :------------------------------------ |
| `TZ`          | Required valid timezone ([List](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones))  | Required                              |
| `PUID`        | User ID for file ownership                                                                      | `0`                                   |
| `PGID`        | Group ID for file ownership                                                                     | `0`                                   |
| `CSRF_SECRET` | Secret for CSRF token generation; set a stable random value to retain sessions across restarts. | Random on each backend start if unset |

## 🌐 Network & Ports

| Variable                | Description                                          | Default |
| :---------------------- | :--------------------------------------------------- | :------ |
| `NPM_PORT`              | Port for the Admin Web UI                            | `81`    |
| `HTTP_PORT`             | Port for HTTP traffic (public)                       | `80`    |
| `HTTPS_PORT`            | Port for HTTPS traffic (public)                      | `443`   |
| `GOA_PORT`              | Port for GoAccess Analytics Dashboard                | `91`    |
| `DISABLE_HTTP`          | Disable HTTP listener entirely (HTTPS only)          | `false` |
| `DISABLE_H3_QUIC`       | Disable HTTP/3 (QUIC) support                        | `false` |
| `HTTP3_ALT_SVC_PORT`    | Port advertised in the `Alt-Svc` header for HTTP/3   | `443`   |
| `LISTEN_PROXY_PROTOCOL` | Enable HAProxy PROXY protocol support on port 80/443 | `false` |

### IP Binding

Use these to restrict which IP addresses ShieldPM listens on:

| Variable               | Description                                  | Default         |
| :--------------------- | :------------------------------------------- | :-------------- |
| `IPV4_BINDING`         | Bind HTTP/HTTPS to a specific IPv4 address   | `0.0.0.0` (all) |
| `NPM_IPV4_BINDING`     | Bind the Admin UI to an IPv4 address         | `0.0.0.0` (all) |
| `GOA_IPV4_BINDING`     | Bind GoAccess to an IPv4 address             | `0.0.0.0` (all) |
| `IPV6_BINDING`         | Bind HTTP/HTTPS to a specific IPv6 address   | `[::]` (all)    |
| `NPM_IPV6_BINDING`     | Bind the Admin UI to an IPv6 address         | `[::]` (all)    |
| `GOA_IPV6_BINDING`     | Bind GoAccess to an IPv6 address             | `[::]` (all)    |
| `DISABLE_IPV6`         | Completely disable IPv6 listeners            | `false`         |
| `NPM_LISTEN_LOCALHOST` | Bind Admin UI to localhost only (127.0.0.1)  | `false`         |
| `GOA_LISTEN_LOCALHOST` | Bind Analytics to localhost only (127.0.0.1) | `false`         |

> [!TIP]
> Set `NPM_LISTEN_LOCALHOST=true` if you access the Admin UI through a reverse proxy or tunnel. This prevents direct access via port 81 from the network.

---

## 💾 Database Configuration

ShieldPM supports **three database backends**. SQLite is the default and works out of the box.

### SQLite (Default — No Configuration Required)

Data is stored in `/data/shieldpm/database.sqlite`. Best for small to medium installations. A legacy `/data/database.sqlite` is migrated on startup.

### MySQL / MariaDB

| Variable                           | Description                                              | Default |
| :--------------------------------- | :------------------------------------------------------- | :------ |
| `DB_MYSQL_HOST`                    | Database hostname or IP                                  | —       |
| `DB_MYSQL_PORT`                    | Database port                                            | `3306`  |
| `DB_MYSQL_USER`                    | Database username                                        | —       |
| `DB_MYSQL_PASSWORD`                | Database password                                        | —       |
| `DB_MYSQL_NAME`                    | Database name                                            | —       |
| `DB_MYSQL_SSL`                     | Use SSL for the connection                               | `false` |
| `DB_MYSQL_SSL_REJECT_UNAUTHORIZED` | Reject untrusted server certificates when SSL is enabled | `true`  |
| `DB_MYSQL_SSL_VERIFY_IDENTITY`     | Verify server identity when SSL is enabled               | `true`  |

### PostgreSQL

| Variable               | Description             | Default |
| :--------------------- | :---------------------- | :------ |
| `DB_POSTGRES_HOST`     | Database hostname or IP | —       |
| `DB_POSTGRES_PORT`     | Database port           | `5432`  |
| `DB_POSTGRES_USER`     | Database username       | —       |
| `DB_POSTGRES_PASSWORD` | Database password       | —       |
| `DB_POSTGRES_NAME`     | Database name           | —       |

### 🔄 Database Migrations

ShieldPM runs schema migrations for the **selected** database on startup. When you switch from SQLite to an empty MySQL/MariaDB or PostgreSQL database, it can import the existing `/data/shieldpm/database.sqlite` data automatically. The source SQLite file is **preserved** for recovery; it is not renamed to `.migrated`. Bring an older SQLite installation up to the current ShieldPM schema first, then configure the external database. An external database that already contains users is left unchanged. Back up both stores before switching; migration between MySQL and PostgreSQL is not automatic. A legacy SQLite file at `/data/database.sqlite` is moved into `/data/shieldpm/` during startup.

---

## Application Settings

Administrators manage these database settings in the UI:

| Location                           | Option                                | Allowed values                    | Default  |
| :--------------------------------- | :------------------------------------ | :-------------------------------- | :------- |
| **Settings → Certificates / ACME** | Certificate key type                  | `ecdsa` or `rsa`                  | `ecdsa`  |
| **Settings → Certificates / ACME** | Renewal check interval                | Whole hours from 1 to 12          | 12 hours |
| **Settings → Network**             | Automatic Cloudflare IP-range updates | Enabled or disabled               | Disabled |
| **Settings → Network**             | IP-range refresh interval             | 6 to 594 hours, in six-hour steps | 6 hours  |
| **Settings → Analytics**           | Detailed request retention            | Positive whole hours              | 24 hours |
| **Settings → Analytics**           | Aggregate retention                   | Positive whole days               | 35 days  |
| **Settings → Nginx**               | Automatic config formatting           | Enabled or disabled               | Enabled  |

**Settings → Analytics** manages detailed-log retention in whole hours (default **24**) and aggregate retention in whole days (default **35**). **Settings → Nginx** controls automatic configuration formatting (enabled by default). Retention values must be positive safe integers, up to `9007199254740991`, without an additional product limit or relationship between the two fields.

Retention changes are used by the next startup/hourly cleanup; saving does not immediately delete data. Both cutoffs must be usable dates with a positive year before either table is cleaned. An unusable policy or extreme period skips both deletions and logs an error. Formatting changes apply when a configuration is next generated; saving does not rewrite files or reload Nginx.

The key type applies to the next Let's Encrypt issuance or renewal, including existing Certbot lineages. Changing the check interval replaces the running timer; Certbot still decides when renewal is due. Enabling IP-range updates starts a background fetch and the periodic timer. Disabling them stops automatic updates and keeps the last known ranges.

On upgrade, `ACME_KEY_TYPE`, `CRT`, `SKIP_IP_RANGES` and `IPRT` are imported once when their database settings are first created; existing saved settings are preserved. Legacy renewal intervals are capped at 12 hours, and `IPRT` becomes a refresh interval of six hours times its valid multiplier. After creation, the database values are authoritative and these old variables no longer control runtime behavior. Remove them from deployment configuration after checking the migrated values in Settings.

On upgrade, `20260930000300_add_analytics_nginx_options` imports `ANALYTICS_DETAILED_RETENTION_HOURS`, `ANALYTICS_AGGREGATION_RETENTION_DAYS` and `DISABLE_NGINX_BEAUTIFIER` once for missing database settings. Existing saved choices are preserved. Legacy retention values use their previous integer parsing; missing or empty values keep the 24-hour/35-day defaults. Invalid nonempty values preserve history by importing a maximum safe integer and logging a warning, rather than silently shortening retention. Review and repair such values under **Settings → Analytics**. Formatting is disabled only when the old flag was exactly `true`. These variables no longer provide a runtime fallback after migration.

## 🔐 SSL & ACME (Let's Encrypt)

**Settings → Certificates / ACME** manages the CA directory, registration email, EAB credentials, terms agreement, CA TLS verification, Must-Staple, ACME/custom OCSP stapling and default TLS certificate in the database. Let's Encrypt production, verified CA TLS and the dummy default certificate (`0`) are the initial defaults; Must-Staple and OCSP are disabled.

Use **Settings → Certificates / ACME** to save the global **Standard** or **Short-lived** profile in ShieldPM. The database default is Standard, and a saved change applies immediately without restarting. New certificate dialogs use this default and allow an individual override; certificates with an explicit saved profile keep it. Legacy certificates without profile metadata use the global choice on renewal. The former `ACME_PROFILE` environment variable is ignored; remove it from existing configuration and review the saved choice in Settings after upgrading. See [SSL Certificates](SSL-Certificates).

The CA default applies to new certificates. Existing certificates keep their original CA/account during renewal and revocation; saved issuer metadata is checked against their Certbot lineage. Registration is performed when needed by the backend, and failures leave the UI accessible. EAB credentials can be retained, replaced together or explicitly cleared; the encrypted HMAC secret is never returned by GET, audit or GitOps export.

OCSP/default-certificate changes regenerate, test and reload Nginx, rolling back the setting and configuration if activation fails. Other fields apply to the next certificate operation without a restart or forced renewal. Let's Encrypt no longer supports Must-Staple or OCSP; see the [SSL guide](SSL-Certificates) for official references and provider-specific options.

On upgrade, the ACME-options migration imports `ACME_SERVER`, `ACME_EMAIL`, `ACME_EAB_KID`, `ACME_EAB_HMAC_KEY`, `ACME_MUST_STAPLE`, `ACME_OCSP_STAPLING`, `ACME_SERVER_TLS_VERIFY`, `CUSTOM_OCSP_STAPLING` and `DEFAULT_CERT_ID` only when creating a missing settings row. Saved database settings are preserved. Invalid legacy server/email/EAB combinations can be repaired in the UI. These retired variables no longer control runtime behavior; remove them after reviewing the migrated settings.

---

## 📊 Analytics & Logging

| Variable              | Description                                                                     | Default            |
| :-------------------- | :------------------------------------------------------------------------------ | :----------------- |
| `GOA`                 | Enable GoAccess Analytics dashboard (port `GOA_PORT`); also enables `LOGROTATE` | `false`            |
| `GOACLA`              | Custom GoAccess command-line arguments                                          | See `.env` example |
| `LOGROTATE`           | Enable log rotation (rotates daily)                                             | `false`            |
| `LOGROTATIONS`        | Number of rotated log files to keep                                             | `3`                |
| `NGINX_LOG_NOT_FOUND` | Log 404 errors to the container log                                             | `false`            |

---

## ⚙️ Advanced Nginx

| Variable                        | Description                                                                              | Default              |
| :------------------------------ | :--------------------------------------------------------------------------------------- | :------------------- |
| `NGINX_WORKER_PROCESSES`        | Number of Nginx worker processes                                                         | `auto` (= CPU cores) |
| `NGINX_WORKER_CONNECTIONS`      | Max connections per worker                                                               | `512`                |
| `NGINX_QUIC_BPF`                | Enable BPF for QUIC (requires privileged)                                                | `false`              |
| `NGINX_DISABLE_PROXY_BUFFERING` | Disable proxy buffering globally                                                         | `false`              |
| `NGINX_404_REDIRECT`            | Redirect 404 hosts to the default site                                                   | `false`              |
| `NGINX_HSTS_SUBDOMAINS`         | Include subdomains in HSTS header when enabled                                           | `true`               |
| `X_FRAME_OPTIONS`               | X-Frame-Options header value                                                             | `sameorigin`         |
| `FULLCLEAN`                     | Remove selected unused runtime/log data during startup; it does not rebuild host configs | `false`              |
| `REGENERATE_ALL`                | Remove generated host `.conf` files during startup so the backend can regenerate them    | `false`              |

---

## 🐘 PHP

| Variable     | Description                                                  | Default |
| :----------- | :----------------------------------------------------------- | :------ |
| `PHP82`      | Enable PHP 8.2 FPM                                           | `false` |
| `PHP82_APKS` | Additional PHP 8.2 packages                                  | —       |
| `PHP83`      | Enable PHP 8.3 FPM                                           | `false` |
| `PHP83_APKS` | Additional PHP 8.3 packages                                  | —       |
| `PHP84`      | Enable PHP 8.4 FPM                                           | `false` |
| `PHP84_APKS` | Additional PHP 8.4 packages                                  | —       |
| `PHP_APKS`   | Shared optional packages when any PHP-FPM version is enabled | —       |

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

| Variable                 | Description                                                                             | Default           |
| :----------------------- | :-------------------------------------------------------------------------------------- | :---------------- |
| `INITIAL_ADMIN_EMAIL`    | With `INITIAL_ADMIN_PASSWORD`, create the first admin instead of using the Setup Wizard | —                 |
| `INITIAL_ADMIN_PASSWORD` | With `INITIAL_ADMIN_EMAIL`, password for the first admin; both values are required      | —                 |
| `INITIAL_DEFAULT_PAGE`   | Default page for undefined hostnames (`444` = close connection)                         | `congratulations` |
| `ENABLE_PRERUN`          | Run executable `*.sh` scripts from `/data/prerun/` before startup                       | `false`           |

---

## 🐳 Docker-Specific

| Variable         | Description                                                  | Default |
| :--------------- | :----------------------------------------------------------- | :------ |
| `DOCKER_HOSTS`   | Additional Docker hosts for Auto-Discovery (comma-separated) | —       |
| `TOR_ENABLED`    | Enable the Tor daemon for Onion Services                     | `true`  |
| `ANUBIS_ENABLED` | Enable the Anubis AI Firewall                                | `true`  |

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
