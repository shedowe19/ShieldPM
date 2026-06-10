# Configuration

ShieldPM is configured primarily through environment variables. This page is generated from the current `compose.yaml`, `compose.easy.yaml`, and `rootfs/.env.example` in ShieldPM **4.3.2**.

- **Docker:** set variables under `services.shieldpm.environment` in `compose.yaml`.
- **Native / LXC:** set variables in `/data/.env`.
- Secrets are described by name only. Do **not** publish real values.

---

## System

| Variable      | Example / Default | Description                                                                                 | Source         |
| :------------ | :---------------- | :------------------------------------------------------------------------------------------ | :------------- |
| `CSRF_SECRET` | `<secret>`        | Min 32 chars. Generate: openssl rand -hex 32                                                | `compose.yaml` |
| `PGID`        | `0`               | Group ID (≥99 or 0), default: 0                                                             | `compose.yaml` |
| `PUID`        | `0`               | User ID (≥99 or 0), default: 0                                                              | `compose.yaml` |
| `TZ`          | `Europe/Berlin`   | Timezone for ShieldPM and optional sidecar services. Set to a valid tz database identifier. | `compose.yaml` |

## Ports & Network

| Variable                | Example / Default | Description                           | Source         |
| :---------------------- | :---------------- | :------------------------------------ | :------------- |
| `DISABLE_H3_QUIC`       | `false`           | Fully disable HTTP/3 + QUIC           | `compose.yaml` |
| `DISABLE_HTTP`          | `false`           | Stop listening on port 80             | `compose.yaml` |
| `GOA_PORT`              | `91`              | GoAccess port, default: 91            | `compose.yaml` |
| `HTTP3_ALT_SVC_PORT`    | `443`             | Alt-Svc port for HTTP/3, default: 443 | `compose.yaml` |
| `HTTPS_PORT`            | `443`             | HTTPS port (TCP+UDP), default: 443    | `compose.yaml` |
| `HTTP_PORT`             | `80`              | HTTP port, default: 80                | `compose.yaml` |
| `LISTEN_PROXY_PROTOCOL` | `false`           | Use PROXY protocol (disables H3)      | `compose.yaml` |
| `NPM_PORT`              | `81`              | UI port, default: 81                  | `compose.yaml` |

## Bind Addresses

| Variable               | Example / Default | Description                     | Source         |
| :--------------------- | :---------------- | :------------------------------ | :------------- |
| `DISABLE_IPV6`         | `true`            | Fully disable IPv6              | `compose.yaml` |
| `GOA_IPV4_BINDING`     | `127.0.0.1`       | IPv4 bind for GoAccess only     | `compose.yaml` |
| `GOA_IPV6_BINDING`     | `[::1]`           | IPv6 bind for GoAccess only     | `compose.yaml` |
| `GOA_LISTEN_LOCALHOST` | `true`            | Bind GoAccess to localhost only | `compose.yaml` |
| `IPV4_BINDING`         | `127.0.0.1`       | IPv4 bind for all hosts         | `compose.yaml` |
| `IPV6_BINDING`         | `[::1]`           | IPv6 bind for all hosts         | `compose.yaml` |
| `NPM_IPV4_BINDING`     | `127.0.0.1`       | IPv4 bind for UI only           | `compose.yaml` |
| `NPM_IPV6_BINDING`     | `[::1]`           | IPv6 bind for UI only           | `compose.yaml` |
| `NPM_LISTEN_LOCALHOST` | `true`            | Bind UI to localhost only       | `compose.yaml` |

## Database

| Variable                           | Example / Default | Description                                                                  | Source         |
| :--------------------------------- | :---------------- | :--------------------------------------------------------------------------- | :------------- |
| `DB_MYSQL_HOST`                    | `127.0.0.1`       | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `DB_MYSQL_NAME`                    | `npm`             | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `DB_MYSQL_PASSWORD`                | `<secret>`        | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `DB_MYSQL_PORT`                    | `3306`            | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `DB_MYSQL_SSL`                     | `false`           | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `DB_MYSQL_SSL_REJECT_UNAUTHORIZED` | `true`            | Reject unauthorized MySQL/MariaDB TLS certificates.                          | `compose.yaml` |
| `DB_MYSQL_SSL_VERIFY_IDENTITY`     | `true`            | Verify MySQL/MariaDB certificate identity/hostname.                          | `compose.yaml` |
| `DB_MYSQL_USER`                    | `npm`             | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `DB_POSTGRES_HOST`                 | `127.0.0.1`       | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `DB_POSTGRES_NAME`                 | `npm`             | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `DB_POSTGRES_PASSWORD`             | `<secret>`        | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `DB_POSTGRES_PORT`                 | `5432`            | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `DB_POSTGRES_USER`                 | `npm`             | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |

## Database service

| Variable              | Example / Default | Description                                                                                                                 | Source         |
| :-------------------- | :---------------- | :-------------------------------------------------------------------------------------------------------------------------- | :------------- |
| `MYSQL_DATABASE`      | `npm`             | Configured by this deployment option. See the compose reference for context.                                                | `compose.yaml` |
| `MYSQL_PASSWORD`      | `<secret>`        | Configured by this deployment option. See the compose reference for context.                                                | `compose.yaml` |
| `MYSQL_ROOT_PASSWORD` | `<secret>`        | Configured by this deployment option. See the compose reference for context.                                                | `compose.yaml` |
| `MYSQL_USER`          | `npm`             | Configured by this deployment option. See the compose reference for context.                                                | `compose.yaml` |
| `POSTGRES_DB`         | `npm`             | PostgreSQL database name for the optional ShieldPM database service. OpenAppSec's optional DB uses its own service context. | `compose.yaml` |
| `POSTGRES_PASSWORD`   | `<secret>`        | PostgreSQL password for optional Postgres services. Keep secret and match the consuming service.                            | `compose.yaml` |
| `POSTGRES_USER`       | `npm` / `appsec`  | PostgreSQL user. ShieldPM DB examples use `npm`; OpenAppSec DB examples use `appsec`.                                       | `compose.yaml` |

## SSL & ACME

| Variable                 | Example / Default                                | Description                                                                  | Source         |
| :----------------------- | :----------------------------------------------- | :--------------------------------------------------------------------------- | :------------- |
| `ACME_EAB_HMAC_KEY`      | `<secret>`                                       | External Account Binding HMAC                                                | `compose.yaml` |
| `ACME_EAB_KID`           | `123456789abcdef`                                | External Account Binding key                                                 | `compose.yaml` |
| `ACME_EMAIL`             | `your-email`                                     | Recommended (required for ZeroSSL/Google)                                    | `compose.yaml` |
| `ACME_KEY_TYPE`          | `rsa`                                            | Key type: ecdsa (default) or rsa                                             | `compose.yaml` |
| `ACME_MUST_STAPLE`       | `true`                                           | Enable must-staple extension                                                 | `compose.yaml` |
| `ACME_OCSP_STAPLING`     | `true`                                           | Enable OCSP stapling                                                         | `compose.yaml` |
| `ACME_PROFILE`           | `shortlived`                                     | ACME profile, default: none                                                  | `compose.yaml` |
| `ACME_SERVER`            | `https://acme-v02.api.letsencrypt.org/directory` | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `ACME_SERVER_TLS_VERIFY` | `false`                                          | Verify ACME server TLS cert                                                  | `compose.yaml` |
| `CRT`                    | `72`                                             | Hours between cert renewal checks, default: 23                               | `compose.yaml` |
| `CUSTOM_OCSP_STAPLING`   | `true`                                           | OCSP stapling for custom certs                                               | `compose.yaml` |
| `DEFAULT_CERT_ID`        | `1`                                              | Use cert ID instead of dummy certs                                           | `compose.yaml` |

## Logging & Analytics

| Variable              | Example / Default                                                                                                                  | Description                                                                  | Source         |
| :-------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------- | :------------- |
| `GOA`                 | `true`                                                                                                                             | Enable GoAccess (implies LOGROTATE=true)                                     | `compose.yaml` |
| `GOACLA`              | `--agent-list --real-os --double-decode --anonymize-ip --anonymize-level=2 --keep-last=7 --with-output-resolver --no-query-string` | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `LOGROTATE`           | `true`                                                                                                                             | Enable access logs + daily rotation                                          | `compose.yaml` |
| `LOGROTATIONS`        | `7`                                                                                                                                | Keep N rotated logs, default: 3                                              | `compose.yaml` |
| `NGINX_LOG_NOT_FOUND` | `true`                                                                                                                             | Log 404s to docker logs                                                      | `compose.yaml` |

## GeoIP service

| Variable                  | Example / Default                             | Description                             | Source         |
| :------------------------ | :-------------------------------------------- | :-------------------------------------- | :------------- |
| `GEOIPUPDATE_ACCOUNT_ID`  | `<your-account-id>`                           | MaxMind GeoIP account ID.               | `compose.yaml` |
| `GEOIPUPDATE_EDITION_IDS` | `GeoLite2-Country GeoLite2-City GeoLite2-ASN` | GeoIP databases to download.            | `compose.yaml` |
| `GEOIPUPDATE_FREQUENCY`   | `24`                                          | GeoIP update interval in hours.         | `compose.yaml` |
| `GEOIPUPDATE_LICENSE_KEY` | `<secret>`                                    | MaxMind GeoIP license key. Keep secret. | `compose.yaml` |

## PHP

| Variable     | Example / Default            | Description                                                                  | Source         |
| :----------- | :--------------------------- | :--------------------------------------------------------------------------- | :------------- |
| `PHP82`      | `true`                       | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `PHP82_APKS` | `php8.2-curl php8.2-openssl` | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `PHP83`      | `true`                       | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `PHP83_APKS` | `php8.3-curl php8.3-openssl` | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `PHP84`      | `true`                       | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `PHP84_APKS` | `php8.4-curl php8.4-openssl` | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |

## Advanced Nginx

| Variable                        | Example / Default | Description                                   | Source         |
| :------------------------------ | :---------------- | :-------------------------------------------- | :------------- |
| `DISABLE_NGINX_BEAUTIFIER`      | `true`            | Skip config beautification                    | `compose.yaml` |
| `FULLCLEAN`                     | `true`            | Remove unused config folders                  | `compose.yaml` |
| `IPRT`                          | `3`               | Hours between IP range updates, default: 1    | `compose.yaml` |
| `NGINX_404_REDIRECT`            | `true`            | Redirect 404 → /                              | `compose.yaml` |
| `NGINX_DISABLE_PROXY_BUFFERING` | `true`            | Disable proxy buffering globally              | `compose.yaml` |
| `NGINX_HSTS_SUBDOMAINS`         | `false`           | HSTS for subdomains, default: true            | `compose.yaml` |
| `NGINX_QUIC_BPF`                | `true`            | Requires cap_add: BPF, PERFMON, NET_ADMIN     | `compose.yaml` |
| `NGINX_WORKER_CONNECTIONS`      | `1024`            | default: 512                                  | `compose.yaml` |
| `NGINX_WORKER_PROCESSES`        | `8`               | default: auto                                 | `compose.yaml` |
| `SKIP_IP_RANGES`                | `false`           | Skip Cloudflare IP range fetch, default: true | `compose.yaml` |
| `X_FRAME_OPTIONS`               | `deny`            | deny \| sameorigin \| none                    | `compose.yaml` |

## Nginx Modules

| Variable                                  | Example / Default | Description                                      | Source         |
| :---------------------------------------- | :---------------- | :----------------------------------------------- | :------------- |
| `NGINX_LOAD_GEOIP2_MODULE`                | `true`            | GeoIP2 module                                    | `compose.yaml` |
| `NGINX_LOAD_NJS_MODULE`                   | `true`            | njs (JavaScript) module                          | `compose.yaml` |
| `NGINX_LOAD_NTLM_MODULE`                  | `true`            | NTLM auth module                                 | `compose.yaml` |
| `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE` | `true`            | OpenAppSec WAF (requires ipc: host + shm-volume) | `compose.yaml` |
| `NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE`  | `true`            | VHost traffic stats                              | `compose.yaml` |

## Docker Discovery

| Variable       | Example / Default                             | Description                    | Source         |
| :------------- | :-------------------------------------------- | :----------------------------- | :------------- |
| `DOCKER_HOSTS` | `tcp://10.10.10.1:2375,tcp://10.10.10.2:2375` | Additional remote Docker hosts | `compose.yaml` |

## Initialization

| Variable                 | Example / Default     | Description                                                                  | Source         |
| :----------------------- | :-------------------- | :--------------------------------------------------------------------------- | :------------- |
| `ENABLE_PRERUN`          | `true`                | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `INITIAL_ADMIN_EMAIL`    | `<initial@email.tld>` | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `INITIAL_ADMIN_PASSWORD` | `<secret>`            | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |
| `INITIAL_DEFAULT_PAGE`   | `444`                 | Configured by this deployment option. See the compose reference for context. | `compose.yaml` |

## Feature Toggles

| Variable         | Example / Default | Description                                                | Source         |
| :--------------- | :---------------- | :--------------------------------------------------------- | :------------- |
| `ANUBIS_ENABLED` | `true`            | Enable or disable the embedded Anubis AI firewall process. | `code`         |
| `TOR_ENABLED`    | `true`            | default: true                                              | `compose.yaml` |

## CrowdSec service

| Variable      | Example / Default                                                                                                                                                                 | Description                          | Source         |
| :------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------- | :------------- |
| `COLLECTIONS` | `crowdsecurity/nginx crowdsecurity/base-http-scenarios crowdsecurity/http-cve crowdsecurity/modsecurity crowdsecurity/appsec-virtual-patching crowdsecurity/appsec-generic-rules` | CrowdSec collections to install/use. | `compose.yaml` |
| `USE_WAL`     | `true`                                                                                                                                                                            | Enable SQLite WAL mode for CrowdSec. | `compose.yaml` |

## OpenAppSec service

| Variable              | Example / Default           | Description                                                              | Source         |
| :-------------------- | :-------------------------- | :----------------------------------------------------------------------- | :------------- |
| `AGENT_TOKEN`         | —                           | OpenAppSec deployment profile token. Keep secret.                        | `compose.yaml` |
| `LEARNING_HOST`       | `openappsec-smartsync`      | OpenAppSec learning service hostname for local policy deployments.       | `compose.yaml` |
| `QUERY_DB_HOST`       | `openappsec-db`             | OpenAppSec tuning database host.                                         | `compose.yaml` |
| `QUERY_DB_PASSWORD`   | `<secret>`                  | OpenAppSec tuning database password. Keep secret.                        | `compose.yaml` |
| `QUERY_DB_USER`       | `appsec`                    | OpenAppSec tuning database user.                                         | `compose.yaml` |
| `SHARED_STORAGE_HOST` | `openappsec-shared-storage` | OpenAppSec shared-storage service hostname for local policy deployments. | `compose.yaml` |
| `TUNING_HOST`         | `openappsec-tuning-svc`     | OpenAppSec tuning service hostname for local policy deployments.         | `compose.yaml` |

---

## Related Pages

- [Docker Compose Reference](Docker-Compose-Reference)
- [Installation](Installation)
- [IPv6 Configuration](IPv6)
- [SSL Certificates](SSL-Certificates)
- [Docker Auto-Discovery](Docker-Auto-Discovery)
- [OpenAppSec](OpenAppSec)
- [CrowdSec](CrowdSec)

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
