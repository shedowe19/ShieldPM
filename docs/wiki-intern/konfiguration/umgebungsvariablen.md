# Umgebungsvariablen

## Zweck

Dokumentation aller Umgebungsvariablen und deren Funktion.

## Kontext

Referenz: `rootfs/.env.example` und `compose.yaml`

Umgebungsvariablen werden in `backend/validate-env.cjs` validiert.

## System

| Variable      | Standard                                   | Beschreibung                                                                                                                                         |
| ------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TZ`          | Pflicht (Compose-Vorlage: `Europe/Berlin`) | Zeitzone; ohne gültigen Wert bricht die Startvalidierung ab                                                                                          |
| `PUID`        | `0`                                        | Numerische User-ID für den Dienst                                                                                                                    |
| `PGID`        | `0`                                        | Numerische Group-ID für den Dienst; bei abweichendem PUID setzen                                                                                     |
| `CSRF_SECRET` | zufällig je Start, falls nicht gesetzt     | Stabiler CSRF-Token-Secret (Beispiel: mindestens 32 Zeichen). Ohne eigenen Wert werden CSRF-Tokens beim Neustart ungültig. Wert nicht dokumentieren. |

## Netzwerk & Ports

| Variable                | Standard | Beschreibung                                 |
| ----------------------- | -------- | -------------------------------------------- |
| `NPM_PORT`              | `81`     | UI-Port                                      |
| `GOA_PORT`              | `91`     | GoAccess-Port                                |
| `HTTP_PORT`             | `80`     | HTTP-Port                                    |
| `HTTPS_PORT`            | `443`    | HTTPS-Port (TCP+UDP)                         |
| `HTTP3_ALT_SVC_PORT`    | `443`    | Alt-Svc Port für HTTP/3                      |
| `DISABLE_IPV6`          | `false`  | IPv6 vollständig deaktivieren                |
| `DISABLE_HTTP`          | `false`  | Port 80 deaktivieren                         |
| `DISABLE_H3_QUIC`       | `false`  | HTTP/3 + QUIC deaktivieren                   |
| `LISTEN_PROXY_PROTOCOL` | `false`  | PROXY-Protokoll (deaktiviert H3)             |
| `NPM_LISTEN_LOCALHOST`  | `false`  | Nginx Proxy Manager nur auf localhost binden |
| `GOA_LISTEN_LOCALHOST`  | `false`  | GoAccess nur auf localhost binden            |

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
| `DB_MYSQL_SSL_VERIFY_IDENTITY`     | `true`   | SSL: Server-Identität verifizieren        |

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
| `ACME_SERVER_TLS_VERIFY` | `true`        | TLS-Zertifikat des ACME-Servers verifizieren             |
| `CUSTOM_OCSP_STAPLING`   | `false`       | Eigenes OCSP-Stapling aktivieren                         |
| `DEFAULT_CERT_ID`        | `0`           | Standard-Zertifikat-ID für neue Hosts                    |

Die Profilwahl eines einzelnen Zertifikats steht in `meta.letsencrypt_profile` und hat Vorrang vor der globalen Datenbankeinstellung `acme-profile`. Diese beginnt mit `standard` und wird unter Einstellungen → Zertifikate / ACME geändert; es gibt dafür keine Umgebungsvariable. `shortlived` verlangt das gleichnamige Profil, `standard` leert erforderliche und bevorzugte Profile für jeden Auftrag. Ausstellung sowie manuelle und automatische Erneuerung wenden diese Auswahl erneut an. Ältere gespeicherte Zertifikate ohne Profilfeld verwenden die globale Vorgabe bei ihrer nächsten Erneuerung; Details stehen unter [Certbot](../module/certbot.md).

## In die UI übernommene Anwendungsoptionen

Schlüsseltyp und Zertifikat-Prüfintervall werden unter Einstellungen → Zertifikate / ACME verwaltet (`certificate-options`). Automatische Cloudflare-IP-Aktualisierung und ihr Intervall stehen unter Einstellungen → Netzwerk (`ip-ranges-options`). Änderungen gelten ohne Neustart; die Werte stammen nach Anlage der Datensätze ausschließlich aus der Datenbank.

`20260930000200_add_application_options.js` übernimmt `ACME_KEY_TYPE`, `CRT`, `SKIP_IP_RANGES` und `IPRT` einmalig für noch fehlende Datensätze. Ein gültiger alter `CRT` wird auf höchstens 12 Stunden begrenzt, ein gültiger `IPRT` von 1 bis 99 wird mit sechs Stunden multipliziert. Ungültige oder fehlende Werte ergeben ECDSA, 12 Stunden, deaktivierten Abruf und sechs Stunden. Vorhandene Einstellungen werden nicht überschrieben. Die alten Variablen werden danach nicht mehr als Rückfallebene verwendet. Siehe [Einstellungen](../verwaltung/einstellungen.md) und [Konfigurationsstrategie](./config-dateien.md#schrittweise-verlagerung-von-anwendungsoptionen).

`analytics-options` verwaltet die Detail-/Aggregat-Aufbewahrung unter Einstellungen → Analysen; `nginx-options` verwaltet die Formatierungswahl unter Einstellungen → Nginx. `20260930000300_add_analytics_nginx_options.js` übernimmt die bisherigen `ANALYTICS_DETAILED_RETENTION_HOURS`, `ANALYTICS_AGGREGATION_RETENTION_DAYS` und `DISABLE_NGINX_BEAUTIFIER` nur bei der Anlage fehlender Datensätze. Fehlende/leere Retention-Werte ergeben 24/35; positive sichere Ergebnisse der bisherigen Integer-Auswertung bleiben erhalten. Ungültige nichtleere Werte ergeben eine maximale sichere Ganzzahl mit einer Warnung ohne Rohwertausgabe und bewahren so Daten bis zur UI-Korrektur. Danach haben diese Variablen keine Laufzeitwirkung. Siehe [Einstellungen](../verwaltung/einstellungen.md#analytics--und-nginx-optionen).

## Analytics & Logging

| Variable       | Standard | Beschreibung                     |
| -------------- | -------- | -------------------------------- |
| `LOGROTATE`    | `false`  | Log-Rotation aktivieren          |
| `LOGROTATIONS` | `3`      | Anzahl der rotierten Log-Dateien |
| `GOA`          | `false`  | GoAccess aktivieren              |
| `GOACLA`       | —        | GoAccess CLI-Argumente           |

## PHP

| Variable     | Standard | Beschreibung                                                      |
| ------------ | -------- | ----------------------------------------------------------------- |
| `PHP82`      | `false`  | PHP 8.2 aktivieren                                                |
| `PHP83`      | `false`  | PHP 8.3 aktivieren                                                |
| `PHP84`      | `false`  | PHP 8.4 aktivieren                                                |
| `PHP82_APKS` | —        | Zusätzliche Debian-APT-Pakete für PHP 8.2; aktiviert auch `PHP82` |
| `PHP83_APKS` | —        | Zusätzliche Debian-APT-Pakete für PHP 8.3; aktiviert auch `PHP83` |
| `PHP84_APKS` | —        | Zusätzliche Debian-APT-Pakete für PHP 8.4; aktiviert auch `PHP84` |
| `PHP_APKS`   | —        | Weitere APT-Pakete; mindestens eine PHP-Version muss aktiv sein   |

## Nginx (Erweitert)

| Variable                        | Standard     | Beschreibung                                                     |
| ------------------------------- | ------------ | ---------------------------------------------------------------- |
| `FULLCLEAN`                     | `false`      | Volles Cleanup bei Nginx-Reload aktivieren                       |
| `NC_AIO`                        | —            | Nextcloud AIO-Modus aktivieren                                   |
| `NC_DOMAIN`                     | —            | Nextcloud AIO Domain (erforderlich wenn NC_AIO=true)             |
| `NGINX_404_REDIRECT`            | `false`      | 404-Anfragen auf Standard-Site umleiten                          |
| `NGINX_HSTS_SUBDOMAINS`         | `true`       | HSTS-Header für Subdomains einschließen                          |
| `NGINX_LOG_NOT_FOUND`           | `false`      | 404-Fehler (Not Found) in Nginx-Logs protokollieren              |
| `NGINX_WORKER_PROCESSES`        | `auto`       | Anzahl der Nginx-Worker-Prozesse                                 |
| `NGINX_WORKER_CONNECTIONS`      | `512`        | Anzahl der Verbindungen pro Worker                               |
| `X_FRAME_OPTIONS`               | `sameorigin` | Header-Wert: `none`, `sameorigin` oder `deny` (kleingeschrieben) |
| `NGINX_DISABLE_PROXY_BUFFERING` | `false`      | Proxy-Buffering global für alle Proxy-Verbindungen deaktivieren  |

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

| Variable                 | Beschreibung                                                            |
| ------------------------ | ----------------------------------------------------------------------- |
| `INITIAL_ADMIN_EMAIL`    | Admin-E-Mail beim ersten Start (muss `@` und `.` enthalten)             |
| `INITIAL_ADMIN_PASSWORD` | Admin-Passwort beim ersten Start. Wert nicht dokumentieren.             |
| `INITIAL_DEFAULT_PAGE`   | Standard-Seite: `404`, `444`, `redirect`, `congratulations` oder `html` |
| `ENABLE_PRERUN`          | Pre-Run-Scripts aktivieren                                              |

Ohne explizite Admin-Variablen führt das Frontend durch den Einrichtungsassistenten. `ENABLE_PRERUN=true` führt Shell-Skripte aus `/data/prerun/*.sh` vor der Umgebungsvalidierung aus.

## Sonstiges

| Variable         | Beschreibung                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `TOR_ENABLED`    | Tor-Dienst starten (Standard: `true`, falls installiert)                                                                         |
| `DOCKER_HOSTS`   | Kommagetrennte zusätzliche Docker-Remote-Hosts; der lokale Socket wird zusätzlich versucht                                       |
| `DATA_PATH`      | Datenbasis des Backends (im Container `/data`, beim lokalen `index-dev.js` standardmäßig `backend/data`)                         |
| `REGENERATE_ALL` | Bei Start durch `envs.sh` auf `true` gesetzt, wenn der Vorlagen-/Umgebungsfingerabdruck abweicht; regeneriert aktive Nginx-Hosts |

## Verwandte Seiten

- [Config-Dateien](./config-dateien.md)
- [Secrets & Sicherheit](./secrets-und-sicherheit.md)
- [Deployment](../entwicklung/deployment.md)
