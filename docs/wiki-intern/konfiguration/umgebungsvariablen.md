# Umgebungsvariablen

## Zweck

Dokumentation aller Umgebungsvariablen und deren Funktion.

## Kontext

Referenz: `rootfs/.env.example`, `rootfs/data/.env` und `compose.yaml`.

Die Start- und Nginx-Variablen werden in `backend/validate-env.cjs` validiert. Backend-spezifische
Authentifizierungswerte werden direkt in `backend/app.js` oder `backend/internal/2fa-service.js` ausgewertet.
Shell-Hilfsvariablen aus Installern, Tests und GitHub Actions sind keine Instanzkonfigurationen; die unten
aufgeführten Testwerte dürfen nicht in eine Produktions-`.env` übernommen werden.

## System

| Variable      | Standard        | Beschreibung                                                                                                                               |
| ------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `TZ`          | `Europe/Berlin` | IANA-Zeitzone; beim Start zwingend gültig.                                                                                                 |
| `PUID`        | `0`             | Laufzeit-UID als ganze Zahl. Eine gesetzte nicht-null UID ohne `PGID` erzeugt eine Warnung.                                                |
| `PGID`        | `0`             | Laufzeit-GID als ganze Zahl.                                                                                                               |
| `DATA_PATH`   | `/data`         | Stammverzeichnis für Datenbank, Schlüssel, Nginx-Dateien, Zertifikate und Laufzeitpersistenz; im Standardcontainer das Volume-Ziel.        |
| `CSRF_SECRET` | —               | Persistentes CSRF-Secret (mindestens 32 zufällige Zeichen empfohlen). Fehlt es, werden Tokens bei jedem Start ungültig. Nie dokumentieren. |
| `TRUST_PROXY` | `1`             | Express-`trust proxy`: `true`/`false`, eine Hop-Anzahl oder eine von Express akzeptierte Proxy-Definition. Nur realen Proxies vertrauen.   |

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

| Variable           | Standard  | Beschreibung                         |
| ------------------ | --------- | ------------------------------------ |
| `IPV4_BINDING`     | `0.0.0.0` | IPv4-Bind für alle Hosts.            |
| `NPM_IPV4_BINDING` | `0.0.0.0` | IPv4-Bind nur für UI.                |
| `GOA_IPV4_BINDING` | `0.0.0.0` | IPv4-Bind nur für GoAccess.          |
| `IPV6_BINDING`     | `[::]`    | IPv6-Bind für alle Hosts (Klammern). |
| `NPM_IPV6_BINDING` | `[::]`    | IPv6-Bind nur für UI.                |
| `GOA_IPV6_BINDING` | `[::]`    | IPv6-Bind nur für GoAccess.          |

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

| Variable                 | Standard                                         | Beschreibung                                                            |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------- |
| `ACME_EMAIL`             | —                                                | E-Mail für Zertifikate                                                  |
| `ACME_SERVER`            | `https://acme-v02.api.letsencrypt.org/directory` | ACME-Server-URL; muss mit `http://` oder `https://` beginnen.           |
| `ACME_EAB_KID`           | —                                                | External Account Binding Key                                            |
| `ACME_EAB_HMAC_KEY`      | —                                                | External Account Binding HMAC. Wert nicht dokumentieren.                |
| `ACME_MUST_STAPLE`       | `false`                                          | Must-Staple Extension                                                   |
| `ACME_OCSP_STAPLING`     | `false`                                          | OCSP Stapling                                                           |
| `ACME_KEY_TYPE`          | `ecdsa`                                          | Schlüsseltyp                                                            |
| `ACME_PROFILE`           | `none`                                           | ACME-Profil; bei gesetztem Wert muss der Server dieses Profil anbieten. |
| `ACME_SERVER_TLS_VERIFY` | `true`                                           | TLS-Zertifikat des ACME-Servers verifizieren                            |
| `CUSTOM_OCSP_STAPLING`   | `false`                                          | Eigenes OCSP-Stapling aktivieren                                        |
| `CRT`                    | `23`                                             | Stunden zwischen Renewal-Checks                                         |
| `DEFAULT_CERT_ID`        | `0`                                              | Standard-Zertifikat-ID für neue Hosts                                   |

## Analytics & Logging

| Variable       | Standard | Beschreibung                     |
| -------------- | -------- | -------------------------------- |
| `LOGROTATE`    | `false`  | Log-Rotation aktivieren          |
| `LOGROTATIONS` | `3`      | Anzahl der rotierten Log-Dateien |
| `GOA`          | `false`  | GoAccess aktivieren              |
| `GOACLA`       | —        | GoAccess CLI-Argumente           |

## PHP

| Variable     | Standard | Beschreibung                                                                                 |
| ------------ | -------- | -------------------------------------------------------------------------------------------- |
| `PHP82`      | `false`  | PHP 8.2 aktivieren                                                                           |
| `PHP83`      | `false`  | PHP 8.3 aktivieren                                                                           |
| `PHP84`      | `false`  | PHP 8.4 aktivieren                                                                           |
| `PHP82_APKS` | —        | Zusätzliche Alpine-Pakete für PHP 8.2                                                        |
| `PHP83_APKS` | —        | Zusätzliche Alpine-Pakete für PHP 8.3                                                        |
| `PHP84_APKS` | —        | Zusätzliche Alpine-Pakete für PHP 8.4                                                        |
| `PHP_APKS`   | —        | Veraltete gemeinsame Paketliste; nur mit mindestens einer aktivierten PHP-Version verwenden. |

## Nginx (Erweitert)

| Variable                        | Standard     | Beschreibung                                                                |
| ------------------------------- | ------------ | --------------------------------------------------------------------------- |
| `SKIP_IP_RANGES`                | `true`       | Cloudflare IP-Ranges nicht automatisch aktualisieren                        |
| `FULLCLEAN`                     | `false`      | Volles Cleanup bei Nginx-Reload aktivieren                                  |
| `IPRT`                          | `1`          | Multiplikator für IP-Ranges-Aktualisierungsintervall                        |
| `NC_AIO`                        | —            | Nextcloud AIO-Modus aktivieren                                              |
| `NC_DOMAIN`                     | —            | Nextcloud AIO Domain (erforderlich wenn NC_AIO=true)                        |
| `PHP_APKS`                      | —            | Zusätzliche PHP-Pakete (veraltet, einzelne PHP-Vars nutzen)                 |
| `NGINX_404_REDIRECT`            | `false`      | 404-Anfragen auf Standard-Site umleiten                                     |
| `NGINX_HSTS_SUBDOMAINS`         | `true`       | HSTS-Header für Subdomains einschließen                                     |
| `NGINX_LOG_NOT_FOUND`           | `false`      | 404-Fehler (Not Found) in Nginx-Logs protokollieren                         |
| `NGINX_WORKER_PROCESSES`        | `auto`       | Anzahl der Nginx-Worker-Prozesse                                            |
| `NGINX_WORKER_CONNECTIONS`      | `512`        | Anzahl der Verbindungen pro Worker                                          |
| `X_FRAME_OPTIONS`               | `sameorigin` | X-Frame-Options; zulässig sind `none`, `sameorigin` und `deny`.             |
| `DISABLE_NGINX_BEAUTIFIER`      | `false`      | Nginx Config Beautifier deaktivieren (Config wird unformatiert geschrieben) |
| `NGINX_DISABLE_PROXY_BUFFERING` | `false`      | Proxy-Buffering global für alle Proxy-Verbindungen deaktivieren             |

## Nginx-Module

| Variable                                  | Standard | Beschreibung                                                                                                                                  |
| ----------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE` | `false`  | OpenAppSec WAF laden                                                                                                                          |
| `NGINX_LOAD_GEOIP2_MODULE`                | `false`  | GeoIP2 Modul laden                                                                                                                            |
| `NGINX_LOAD_NJS_MODULE`                   | `false`  | njs Modul laden                                                                                                                               |
| `NGINX_LOAD_NTLM_MODULE`                  | `false`  | NTLM Modul laden                                                                                                                              |
| `NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE`  | `false`  | VHost Traffic Status laden                                                                                                                    |
| `NGINX_QUIC_BPF`                          | `false`  | QUIC BPF Support aktivieren. Erfordert Docker-Capabilities: `CAP_NET_ADMIN`, `CAP_BPF`, `CAP_PERFMON`. Ermöglicht BPF-basierte QUIC-Analytik. |

## Initialisierung

| Variable                 | Beschreibung                                                            |
| ------------------------ | ----------------------------------------------------------------------- |
| `INITIAL_ADMIN_EMAIL`    | Admin-E-Mail beim ersten Start (muss `@` und `.` enthalten)             |
| `INITIAL_ADMIN_PASSWORD` | Admin-Passwort beim ersten Start. Wert nicht dokumentieren.             |
| `INITIAL_DEFAULT_PAGE`   | Standard-Seite: `404`, `444`, `redirect`, `congratulations` oder `html` |
| `ENABLE_PRERUN`          | Pre-Run-Scripts aktivieren                                              |

## Authentifizierung, Anubis und Demo

| Variable            | Standard         | Beschreibung                                                                                                        |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `PASSKEY_RP_ID`     | dynamisch        | WebAuthn-Relying-Party-ID. Fehlt sie, leitet das Backend sie aus der Request-Origin ab.                             |
| `PASSKEY_ORIGIN`    | dynamisch        | Vollständige erwartete WebAuthn-Origin. Fehlt sie, verwendet das Backend `Origin` oder Request-Protokoll und -Host. |
| `PASSKEY_RP_NAME`   | `ShieldPM`       | Anzeigename der WebAuthn-Relying-Party.                                                                             |
| `YUBICO_CLIENT_ID`  | `1`              | Client-ID für die Yubico-OTP-Validierung.                                                                           |
| `YUBICO_API_URL`    | `api.yubico.com` | Host eines alternativen Yubico-OTP-Validierungsservers.                                                             |
| `YUBICO_SECRET_KEY` | —                | Base64-kodierter HMAC-Schlüssel für signierte Yubico-Anfragen; geheim.                                              |
| `ANUBIS_ENABLED`    | `true`           | Verfügbaren Anubis-PoW-Gate-Prozess starten; Installer/Updater können den Wert nach Installation aktivieren.        |
| `DEMO_MODE`         | `false`          | Schreibende Benutzeraktionen sperren und ModSecurity in relevanten Proxy-Templates aktivieren.                      |

Passkeys, Duo, TOTP und YubiKey-OTP sind unter [2FA-Service](../module/2fa-service.md) beschrieben. Bei Reverse
Proxies sind `TRUST_PROXY`, `PASSKEY_RP_ID` und `PASSKEY_ORIGIN` besonders sorgfältig auf die öffentliche Origin
abzustimmen.

## Sonstiges

| Variable       | Standard | Beschreibung                                                                                |
| -------------- | -------- | ------------------------------------------------------------------------------------------- |
| `TOR_ENABLED`  | `false`  | Tor-Services aktivieren. Das Control-Passwort wird intern unter `/data/shieldpm` verwaltet. |
| `DOCKER_HOSTS` | —        | Zusätzliche Docker-Remote-Hosts.                                                            |

## CI, Tests und interne Laufzeitwerte

| Variable                                   | Standard | Beschreibung                                                                                                               |
| ------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                 | Umgebung | Node-Laufzeitmodus; der native Updater installiert den Frontend-Build trotz `production` mit Entwicklungsabhängigkeiten.   |
| `CI`                                       | —        | Wird von CI-Systemen gesetzt. Allein aktiviert sie keine destruktiven Testpfade.                                           |
| `NPM_CI_ENABLE_DESTRUCTIVE_TEST_MODE`      | `false`  | Nur zusammen mit `CI=true` dürfen ausdrücklich geschützte destruktive Testoperationen laufen. Nie in einer Instanz setzen. |
| `SHIELDPM_TEST_DATA`                       | —        | Temporärer Fixture-Pfad für Testprozesse.                                                                                  |
| `SHIELDPM_TEST_HASH`, `SHIELDPM_TEST_NODE` | —        | Interne Test-Fixtures für Fingerprint- und Node-Regressionen, keine Instanzoptionen.                                       |
| `TV`                                       | `5c`     | Interne Template-Revisionskennung aus `envs.sh`; fließt in den Environment-Fingerprint ein und wird nicht manuell gesetzt. |
| `REGENERATE_ALL`                           | intern   | Wird von `envs.sh` bei abweichendem Umgebungs- oder Template-Fingerprint gesetzt; nicht manuell konfigurieren.             |

## Verwandte Seiten

- [Config-Dateien](./config-dateien.md)
- [Secrets & Sicherheit](./secrets-und-sicherheit.md)
- [Deployment](../entwicklung/deployment.md)
