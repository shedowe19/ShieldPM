# Configuration

ShieldPM is configured via **Environment Variables**. No config file editing is required for basic setup — just set the variables and restart.

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

ShieldPM supports **SQLite**, **MySQL/MariaDB**, and **PostgreSQL**. A fresh
installation without existing data or explicit database configuration offers a
database chooser before account setup. SQLite is the default choice and needs no
separate server. Existing installations retain their selected database; a broken
or unreachable explicit configuration never opens a fresh-installation wizard.

Administrators can test and change the database under **Settings → Database**.
Credentials are saved privately in `/data/shieldpm/database.json` with mode `0600`,
separately from ordinary application settings and their audit log. Once you
explicitly select a database in the UI, that managed selection takes precedence
over legacy `/data/shieldpm/default.json` and `DB_MYSQL_*`/`DB_POSTGRES_*` variables.
Without a managed selection, existing configuration precedence is preserved.

### SQLite (Default Choice)

Fresh SQLite setup uses `/data/shieldpm/database.sqlite`. A later migration back
to SQLite creates a new `database-<operation-id>.sqlite` file and saves its selection;
it never reopens an old archival SQLite file. A legacy `/data/database.sqlite` is
moved during startup. The password-reset and vacuum commands resolve the active
selection and refuse to modify SQLite when a server database is selected.

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

The supported UI migration matrix is explicit:

| Source                      | Target                      |
| --------------------------- | --------------------------- |
| SQLite                      | MySQL/MariaDB or PostgreSQL |
| MySQL/MariaDB or PostgreSQL | Fresh SQLite                |

Direct MySQL/MariaDB ↔ PostgreSQL migration is not offered; use two separately
verified migrations through SQLite. The target must be an empty, dedicated
database. All other ShieldPM instances and external writers using either database
must be stopped and kept stopped: this is a single-instance maintenance operation.
A volume lock prevents another process sharing the same data volume from starting,
but cannot coordinate independent installations that share a server database.

After confirmation the backend restarts into a database-independent maintenance
service. This stops its background writers. The migration holds source write locks,
creates a private, flushed canonical export under
`/data/shieldpm/database-backups/`, copies bounded batches, and verifies every table
before atomically activating the target. Composite keys, session references,
login throttles and identity sequence high-water marks are preserved. Big integers,
JSON versus SQL NULL, booleans and timestamps are converted and checked without
silently accepting range or precision loss. Incompatible values abort activation.
MySQL/MariaDB requires transactional InnoDB tables and source lock permissions.

Failed copies preserve the source and may leave a partially initialized target;
retry with a new empty target. The operation screen lets you acknowledge a failure
before activation and return to the original database or setup chooser. Activation
uncertainty keeps the application in maintenance for verification. Once the target
is authoritative, returning to an older source would lose subsequent writes and
is never automatic: switching back is a new migration from the current database.

The standard Docker/native launcher restarts the backend for this transition;
unexpected exits retain their existing critical-service behavior. When running
`node index-dev.js` directly, restart the command after requesting a database
switch. Keep `/data` and its private journal/configuration across restarts. Do not
edit the journal to bypass an uncertain activation.

Existing unmanaged ENV-based SQLite-to-server imports remain compatible, including
composite domain-owner keys, the seeded claim lock and lazy login-throttle storage.
Upgrade the source schema with the current ShieldPM version before importing.
The old SQLite file is an archive after a successful switch, not a current backup.
The canonical migration export is not an encrypted instance-backup archive;
existing instance restore remains a separate, same-provider workflow. Continue
keeping independent backups of `/data` and external databases.

The isolated validation matrix covers SQLite 3.53.4, MariaDB 11.8.3, Oracle
MySQL 8.4.13 and PostgreSQL 17.6. Permanent tests exercise real provider copies and
cold-process round trips through the complete current migration chain, including
new writes before returning to SQLite. Other server versions and externally
extended schemas are not established by this matrix. Compatibility failures stop
activation rather than silently changing data.

---

## 🔐 SSL & ACME (Let's Encrypt)

| Variable                 | Description                                                                                               | Default                  |
| :----------------------- | :-------------------------------------------------------------------------------------------------------- | :----------------------- |
| `ACME_EMAIL`             | ACME registration email; recommended for Let's Encrypt and required for ZeroSSL/Google Public CA with EAB | —                        |
| `ACME_SERVER`            | Custom ACME server URL                                                                                    | Let's Encrypt Production |
| `ACME_EAB_KID`           | External Account Binding Key ID                                                                           | —                        |
| `ACME_EAB_HMAC_KEY`      | External Account Binding HMAC Key                                                                         | —                        |
| `ACME_MUST_STAPLE`       | Enable OCSP Must-Staple extension                                                                         | `false`                  |
| `ACME_OCSP_STAPLING`     | Enable OCSP Stapling                                                                                      | `false`                  |
| `ACME_PROFILE`           | Optional ACME profile name                                                                                | `none`                   |
| `ACME_KEY_TYPE`          | Key type: `rsa` or `ecdsa`                                                                                | `ecdsa`                  |
| `ACME_SERVER_TLS_VERIFY` | Verify the ACME server TLS certificate                                                                    | `true`                   |
| `CUSTOM_OCSP_STAPLING`   | Enable OCSP Stapling for custom certificates                                                              | `false`                  |
| `DEFAULT_CERT_ID`        | Default certificate ID for otherwise unmatched hosts (`0` uses the dummy certificate)                     | `0`                      |
| `CRT`                    | Hours between certificate renewal checks                                                                  | `23`                     |

> [!WARNING]
> Set `ACME_EMAIL` for account notices and to use providers that require it. For Let's Encrypt, the runtime can register without an email; ZeroSSL requires one, and EAB settings must include an email.

---

## 📊 Analytics & Logging

**Traffic Flow** is configured under **Settings → Traffic Flow**. Flow and desired
live measurement default to on; native Nginx support is required for actual live
rates. Client display offers anonymized networks (default), individual IP addresses
(explicit choice), or hidden identity. Existing `TRAFFIC_FLOW_*` environment
preferences are imported once, then saved settings take precedence. These controls
apply to Traffic Flow only; historical Analytics, access logs and GoAccess remain
separate. See [Analytics](./Analytics.md#live-traffic-flow-experimental).

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
| `DISABLE_NGINX_BEAUTIFIER`      | Legacy ignored setting; generated Nginx configuration is always preserved unchanged      | ignored              |
| `FULLCLEAN`                     | Remove selected unused runtime/log data during startup; it does not rebuild host configs | `false`              |
| `REGENERATE_ALL`                | Remove generated host `.conf` files during startup so the backend can regenerate them    | `false`              |
| `SKIP_IP_RANGES`                | Skip fetching real IP ranges (Cloudflare, etc.)                                          | `true`               |
| `IPRT`                          | Multiplier for the 6-hour Cloudflare IP-range refresh interval when fetching is enabled  | `1`                  |

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

`GEOIP_AUTO_UPDATE` defaults to `true`: every startup prepares the latest Country, City, and ASN databases before services start, independently of module loading. Set it to `false` for offline or custom databases. See [GeoIP setup](./Analytics.md#enabling-geoip-country-statistics).

| Variable                                  | Description                              | Default |
| :---------------------------------------- | :--------------------------------------- | :------ |
| `GEOIP_AUTO_UPDATE`                       | Prepare Country/City/ASN data at startup | `true`  |
| `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE` | Load OpenAppSec WAF module               | `false` |
| `NGINX_LOAD_GEOIP2_MODULE`                | Load GeoIP2 module                       | `false` |
| `NGINX_LOAD_NJS_MODULE`                   | Load Nginx JavaScript (njs) module       | `false` |
| `NGINX_LOAD_NTLM_MODULE`                  | Load NTLM authentication module          | `false` |
| `NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE`  | Load virtual host traffic status module  | `false` |

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
