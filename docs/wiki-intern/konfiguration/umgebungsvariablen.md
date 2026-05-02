# Umgebungsvariablen

## Zweck

Dokumentation aller Umgebungsvariablen und deren Funktion.

## Kontext

Referenz: `rootfs/.env.example` und `compose.yaml`

Umgebungsvariablen werden in `backend/validate-env.cjs` validiert.

## System

| Variable      | Standard        | Beschreibung                                                   |
| ------------- | --------------- | -------------------------------------------------------------- |
| `TZ`          | `Europe/Berlin` | Zeitzone                                                       |
| `PUID`        | `0`             | User-ID (≥99 oder 0)                                           |
| `PGID`        | `0`             | Group-ID (≥99 oder 0)                                          |
| `CSRF_SECRET` | —               | CSRF-Token Secret (min. 32 Zeichen). Wert nicht dokumentieren. |

## Netzwerk & Ports

| Variable                | Standard | Beschreibung                     |
| ----------------------- | -------- | -------------------------------- |
| `NPM_PORT`              | `81`     | UI-Port                          |
| `GOA_PORT`              | `91`     | GoAccess-Port                    |
| `HTTP_PORT`             | `80`     | HTTP-Port                        |
| `HTTPS_PORT`            | `443`    | HTTPS-Port (TCP+UDP)             |
| `HTTP3_ALT_SVC_PORT`    | `443`    | Alt-Svc Port für HTTP/3          |
| `DISABLE_HTTP`          | `false`  | Port 80 deaktivieren             |
| `DISABLE_H3_QUIC`       | `false`  | HTTP/3 + QUIC deaktivieren       |
| `LISTEN_PROXY_PROTOCOL` | `false`  | PROXY-Protokoll (deaktiviert H3) |

## IP-Bindings

| Variable               | Standard | Beschreibung                      |
| ---------------------- | -------- | --------------------------------- |
| `IPV4_BINDING`         | —        | IPv4-Bind für alle Hosts          |
| `NPM_IPV4_BINDING`     | —        | IPv4-Bind nur für UI              |
| `GOA_IPV4_BINDING`     | —        | IPv4-Bind nur für GoAccess        |
| `IPV6_BINDING`         | —        | IPv6-Bind für alle Hosts          |
| `DISABLE_IPV6`         | —        | IPv6 vollständig deaktivieren     |
| `NPM_LISTEN_LOCALHOST` | —        | UI nur auf localhost binden       |
| `GOA_LISTEN_LOCALHOST` | —        | GoAccess nur auf localhost binden |

## Datenbank

| Variable               | Beschreibung                                   |
| ---------------------- | ---------------------------------------------- |
| `DB_MYSQL_HOST`        | MySQL-Hostname                                 |
| `DB_MYSQL_PORT`        | MySQL-Port (Standard: 3306)                    |
| `DB_MYSQL_USER`        | MySQL-Benutzer. Wert nicht dokumentieren.      |
| `DB_MYSQL_PASSWORD`    | MySQL-Passwort. Wert nicht dokumentieren.      |
| `DB_MYSQL_NAME`        | MySQL-Datenbankname                            |
| `DB_MYSQL_SSL`         | SSL aktivieren                                 |
| `DB_POSTGRES_HOST`     | PostgreSQL-Hostname                            |
| `DB_POSTGRES_PORT`     | PostgreSQL-Port (Standard: 5432)               |
| `DB_POSTGRES_USER`     | PostgreSQL-Benutzer. Wert nicht dokumentieren. |
| `DB_POSTGRES_PASSWORD` | PostgreSQL-Passwort. Wert nicht dokumentieren. |
| `DB_POSTGRES_NAME`     | PostgreSQL-Datenbankname                       |

## SSL & ACME

| Variable             | Standard      | Beschreibung                                             |
| -------------------- | ------------- | -------------------------------------------------------- |
| `ACME_EMAIL`         | —             | E-Mail für Zertifikate                                   |
| `ACME_SERVER`        | Let's Encrypt | ACME-Server-URL                                          |
| `ACME_EAB_KID`       | —             | External Account Binding Key                             |
| `ACME_EAB_HMAC_KEY`  | —             | External Account Binding HMAC. Wert nicht dokumentieren. |
| `ACME_MUST_STAPLE`   | `false`       | Must-Staple Extension                                    |
| `ACME_OCSP_STAPLING` | `false`       | OCSP Stapling                                            |
| `ACME_KEY_TYPE`      | `ecdsa`       | Schlüsseltyp                                             |
| `CRT`                | `23`          | Stunden zwischen Renewal-Checks                          |

## Analytics & Logging

| Variable       | Standard | Beschreibung            |
| -------------- | -------- | ----------------------- |
| `LOGROTATE`    | `false`  | Log-Rotation aktivieren |
| `LOGROTATIONS` | `3`      | Anzahl rotierter Logs   |
| `GOA`          | `false`  | GoAccess aktivieren     |
| `GOACLA`       | —        | GoAccess CLI-Argumente  |

## PHP

| Variable     | Beschreibung           |
| ------------ | ---------------------- |
| `PHP82`      | PHP 8.2 aktivieren     |
| `PHP83`      | PHP 8.3 aktivieren     |
| `PHP84`      | PHP 8.4 aktivieren     |
| `PHP8X_APKS` | Zusätzliche PHP-Pakete |

## Nginx (Erweitert)

| Variable                        | Standard | Beschreibung                   |
| ------------------------------- | -------- | ------------------------------ |
| `NGINX_WORKER_PROCESSES`        | `auto`   | Worker-Prozesse                |
| `NGINX_WORKER_CONNECTIONS`      | `512`    | Verbindungen pro Worker        |
| `NGINX_DISABLE_PROXY_BUFFERING` | `false`  | Proxy-Buffering deaktivieren   |
| `NGINX_404_REDIRECT`            | `false`  | 404 → / umleiten               |
| `NGINX_HSTS_SUBDOMAINS`         | `true`   | HSTS für Subdomains            |
| `X_FRAME_OPTIONS`               | —        | X-Frame-Options Header         |
| `DISABLE_NGINX_BEAUTIFIER`      | `false`  | Config-Beautifier überspringen |

## Nginx-Module

| Variable                                  | Beschreibung               |
| ----------------------------------------- | -------------------------- |
| `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE` | OpenAppSec WAF laden       |
| `NGINX_LOAD_GEOIP2_MODULE`                | GeoIP2 Modul laden         |
| `NGINX_LOAD_NJS_MODULE`                   | njs Modul laden            |
| `NGINX_LOAD_NTLM_MODULE`                  | NTLM Modul laden           |
| `NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE`  | VHost Traffic Status laden |

## Initialisierung

| Variable                 | Beschreibung                                                |
| ------------------------ | ----------------------------------------------------------- |
| `INITIAL_ADMIN_EMAIL`    | Admin-E-Mail beim ersten Start                              |
| `INITIAL_ADMIN_PASSWORD` | Admin-Passwort beim ersten Start. Wert nicht dokumentieren. |
| `INITIAL_DEFAULT_PAGE`   | Standard-Seite (z.B. 444)                                   |
| `ENABLE_PRERUN`          | Pre-Run-Scripts aktivieren                                  |

## Sonstiges

| Variable       | Beschreibung                    |
| -------------- | ------------------------------- |
| `TOR_ENABLED`  | Tor-Services aktivieren         |
| `DOCKER_HOSTS` | Zusätzliche Docker-Remote-Hosts |

## Verwandte Seiten

- [Config-Dateien](./config-dateien.md)
- [Secrets & Sicherheit](./secrets-und-sicherheit.md)
- [Deployment](../entwicklung/deployment.md)
