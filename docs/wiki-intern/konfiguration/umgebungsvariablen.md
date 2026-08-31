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

| Variable                | Standard | Beschreibung                                                                          |
| ----------------------- | -------- | ------------------------------------------------------------------------------------- |
| `NPM_PORT`              | `81`     | UI-Port                                                                               |
| `GOA_PORT`              | `91`     | GoAccess-Port                                                                         |
| `HTTP_PORT`             | `80`     | HTTP-Port                                                                             |
| `HTTPS_PORT`            | `443`    | HTTPS-Port (TCP+UDP)                                                                  |
| `HTTP3_ALT_SVC_PORT`    | `443`    | Alt-Svc Port für HTTP/3                                                               |
| `DISABLE_IPV6`          | `false`  | IPv6 vollständig deaktivieren                                                         |
| `DISABLE_HTTP`          | `false`  | Port 80 deaktivieren                                                                  |
| `DISABLE_H3_QUIC`       | `false`  | HTTP/3 + QUIC deaktivieren                                                            |
| `LISTEN_PROXY_PROTOCOL` | `false`  | PROXY-Protokoll (deaktiviert H3)                                                      |
| `TRUST_PROXY`           | `false`  | Compose/Rootfs setzen `1` für den offiziellen Single-Proxy-Pfad; anderes wird abgelehnt |
| `NPM_LISTEN_LOCALHOST`  | `false`  | Nginx Proxy Manager nur auf localhost binden                                          |
| `GOA_LISTEN_LOCALHOST`  | `false`  | GoAccess nur auf localhost binden                                                     |

## IP-Bindings

| Variable           | Standard | Beschreibung               |
| ------------------ | -------- | -------------------------- |
| `IPV4_BINDING`     | —        | IPv4-Bind für alle Hosts   |
| `NPM_IPV4_BINDING` | —        | IPv4-Bind nur für UI       |
| `GOA_IPV4_BINDING` | —        | IPv4-Bind nur für GoAccess |
| `IPV6_BINDING`     | —        | IPv6-Bind für alle Hosts   |
| `NPM_IPV6_BINDING` | —        | IPv6-Bind nur für UI       |
| `GOA_IPV6_BINDING` | —        | IPv6-Bind nur für GoAccess |

## Datenbank

### MySQL

| Variable                           | Standard | Beschreibung                              |
| ---------------------------------- | -------- | ----------------------------------------- |
| `DB_MYSQL_HOST`                    | —        | MySQL-Hostname                            |
| `DB_MYSQL_PORT`                    | `3306`   | MySQL-Port                                |
| `DB_MYSQL_USER`                    | —        | MySQL-Benutzer. Wert nicht dokumentieren. |
| `DB_MYSQL_PASSWORD`                | —        | MySQL-Passwort. Wert nicht dokumentieren. |
| `DB_MYSQL_NAME`                    | —        | MySQL-Datenbankname                       |
| `DB_MYSQL_SSL`                     | `false`  | SSL aktivieren                            |
| `DB_MYSQL_SSL_REJECT_UNAUTHORIZED` | `true`   | SSL: Unautorisierte Zertifikate ablehnen  |
| `DB_MYSQL_SSL_VERIFY_IDENTITY`     | `false`  | SSL: Server-Identität verifizieren        |

### PostgreSQL

| Variable               | Standard | Beschreibung                                   |
| ---------------------- | -------- | ---------------------------------------------- |
| `DB_POSTGRES_HOST`     | —        | PostgreSQL-Hostname                            |
| `DB_POSTGRES_PORT`     | `5432`   | PostgreSQL-Port                                |
| `DB_POSTGRES_USER`     | —        | PostgreSQL-Benutzer. Wert nicht dokumentieren. |
| `DB_POSTGRES_PASSWORD` | —        | PostgreSQL-Passwort. Wert nicht dokumentieren. |
| `DB_POSTGRES_NAME`     | —        | PostgreSQL-Datenbankname                       |

## SSL & ACME

| Variable                 | Standard      | Beschreibung                                             |
| ------------------------ | ------------- | -------------------------------------------------------- |
| `ACME_EMAIL`             | —             | E-Mail für Zertifikate                                   |
| `ACME_SERVER`            | Let's Encrypt | ACME-Server-URL                                          |
| `ACME_EAB_KID`           | —             | External Account Binding Key                             |
| `ACME_EAB_HMAC_KEY`      | —             | External Account Binding HMAC. Wert nicht dokumentieren. |
| `ACME_MUST_STAPLE`       | `false`       | Must-Staple Extension                                    |
| `ACME_OCSP_STAPLING`     | `false`       | OCSP Stapling                                            |
| `ACME_KEY_TYPE`          | `ecdsa`       | Schlüsseltyp                                             |
| `ACME_PROFILE`           | `standard`    | ACME-Profil (`standard` oder `vip`)                      |
| `ACME_SERVER_TLS_VERIFY` | `true`        | TLS-Zertifikat des ACME-Servers verifizieren             |
| `CUSTOM_OCSP_STAPLING`   | `false`       | Eigenes OCSP-Stapling aktivieren                         |
| `CRT`                    | `23`          | Stunden zwischen Renewal-Checks                          |
| `DEFAULT_CERT_ID`        | `0`           | Standard-Zertifikat-ID für neue Hosts                    |

## Analytics & Logging

| Variable                           | Standard                                | Beschreibung                                                     |
| ---------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| `LOGROTATE`                        | `false`                                 | Log-Rotation aktivieren                                          |
| `LOGROTATIONS`                     | `3`                                     | Anzahl der rotierten Log-Dateien                                 |
| `GOA`                              | `false`                                 | GoAccess aktivieren                                              |
| `GOACLA`                           | —                                       | GoAccess CLI-Argumente                                           |
| `ANALYTICS_SPOOL_PATH`             | `/data/shieldpm/analytics-spool.ndjson` | Persistenter Spool-Pfad; muss normalisiert unter `/data/` liegen |
| `ANALYTICS_SPOOL_MAX_BYTES`        | `67108864`                              | Harte Obergrenze des Spools in Bytes                             |
| `ANALYTICS_SPOOL_RECORD_MAX_BYTES` | `262144`                                | Maximale Größe eines einzelnen NDJSON-Datensatzes                |
| `ANALYTICS_SPOOL_BATCH_RECORDS`    | `250`                                   | Maximale Datensatzanzahl pro Datenbanktransaktion                |
| `SQLITE_BACKUP_RETENTION_COUNT`    | `7`                                     | Aufbewahrte verifizierte SQLite-Snapshots (1–365)                 |
| `SECRET_FILE_MAX_BYTES`            | `65536`                                 | Maximale Secret-Dateigröße; harte Obergrenze 1 MiB                |

## PHP

| Variable     | Standard | Beschreibung                                                |
| ------------ | -------- | ----------------------------------------------------------- |
| `PHP82`      | `false`  | PHP 8.2 aktivieren                                          |
| `PHP83`      | `false`  | PHP 8.3 aktivieren                                          |
| `PHP84`      | `false`  | PHP 8.4 aktivieren                                          |
| `PHP82_APKS` | —        | Zusätzliche Alpine-Pakete für PHP 8.2                       |
| `PHP83_APKS` | —        | Zusätzliche Alpine-Pakete für PHP 8.3                       |
| `PHP84_APKS` | —        | Zusätzliche Alpine-Pakete für PHP 8.4                       |
| `PHP8X_APKS` | —        | Zusätzliche PHP-Pakete (veraltet, einzelne PHP-Vars nutzen) |

## Nginx (Erweitert)

| Variable                        | Standard     | Beschreibung                                                                |
| ------------------------------- | ------------ | --------------------------------------------------------------------------- |
| `SKIP_IP_RANGES`                | `true`       | Cloudflare IP-Ranges nicht automatisch aktualisieren                        |
| `FULLCLEAN`                     | `false`      | Volles Cleanup bei Nginx-Reload aktivieren                                  |
| `IPRT`                          | `1`          | Multiplikator für IP-Ranges-Aktualisierungsintervall                        |
| `DEFAULT_CERT_ID`               | `0`          | Standard-Zertifikat-ID für neue Hosts                                       |
| `NC_AIO`                        | —            | Nextcloud AIO-Modus aktivieren                                              |
| `NC_DOMAIN`                     | —            | Nextcloud AIO Domain (erforderlich wenn NC_AIO=true)                        |
| `SHIELDPM_AIO_ACCESS_TOKEN_FILE`| —            | Kurzlebiger Access-Token für einmalige AIO-Host-Anlage; danach entfernen    |
| `PHP_APKS`                      | —            | Zusätzliche PHP-Pakete (veraltet, einzelne PHP-Vars nutzen)                 |
| `NGINX_404_REDIRECT`            | `false`      | 404-Anfragen auf Standard-Site umleiten                                     |
| `NGINX_HSTS_SUBDOMAINS`         | `true`       | HSTS-Header für Subdomains einschließen                                     |
| `NGINX_LOG_NOT_FOUND`           | `false`      | 404-Fehler (Not Found) in Nginx-Logs protokollieren                         |
| `NGINX_WORKER_PROCESSES`        | `auto`       | Anzahl der Nginx-Worker-Prozesse                                            |
| `NGINX_WORKER_CONNECTIONS`      | `512`        | Anzahl der Verbindungen pro Worker                                          |
| `X_FRAME_OPTIONS`               | `SAMEORIGIN` | X-Frame-Options Header-Wert                                                 |
| `DISABLE_NGINX_BEAUTIFIER`      | `false`      | Nginx Config Beautifier deaktivieren (Config wird unformatiert geschrieben) |
| `NGINX_DISABLE_PROXY_BUFFERING` | `false`      | Proxy-Buffering global für alle Proxy-Verbindungen deaktivieren             |

## Nginx-Module

| Variable                                  | Beschreibung                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE` | OpenAppSec WAF laden                                                                                                                          |
| `NGINX_LOAD_GEOIP2_MODULE`                | GeoIP2 Modul laden                                                                                                                            |
| `NGINX_LOAD_NJS_MODULE`                   | njs Modul laden                                                                                                                               |
| `NGINX_LOAD_NTLM_MODULE`                  | NTLM Modul laden                                                                                                                              |
| `NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE`  | VHost Traffic Status laden                                                                                                                    |
| `NGINX_QUIC_BPF`                          | QUIC BPF Support aktivieren. Erfordert Docker-Capabilities: `CAP_NET_ADMIN`, `CAP_BPF`, `CAP_PERFMON`. Ermöglicht BPF-basierte QUIC-Analytik. |

## Initialisierung

| Variable                         | Beschreibung                                                             |
| -------------------------------- | ------------------------------------------------------------------------ |
| `INITIAL_ADMIN_SETUP_TOKEN`      | One-Time-Ownership-Token mit mindestens 256 Bit; Wert nie dokumentieren  |
| `INITIAL_ADMIN_SETUP_TOKEN_FILE` | Bevorzugter Pfad auf eine reguläre Secret-Datei mit `0600` oder strenger |
| `INITIAL_DEFAULT_PAGE`           | Standard-Seite: `404`, `444`, `redirect`, `congratulations` oder `html`  |
| `ENABLE_PRERUN`                  | Pre-Run-Scripts aktivieren                                               |

Ohne Token-Vorgabe entsteht `/data/shieldpm/initial-admin-setup-token`. Der Wizard sendet ihn im Header
`X-ShieldPM-Setup-Token`; Claim und Administratoranlage sind atomar, danach wird die generierte Datei entfernt.

## Sonstiges

| Variable       | Beschreibung                    |
| -------------- | ------------------------------- |
| `TOR_ENABLED`  | Tor-Services aktivieren         |
| `DOCKER_HOSTS` | Zusätzliche Docker-Remote-Hosts |

## Verwandte Seiten

- [Config-Dateien](./config-dateien.md)
- [Secrets & Sicherheit](./secrets-und-sicherheit.md)
- [Deployment](../entwicklung/deployment.md)
