# Konfiguration

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite bündelt, welche Konfigurationswege existieren, welche Variablengruppen
es gibt und wo Werte liegen. **Keine Werte dokumentieren** — nur Namen und Zweck.

## Konfigurationswege

| Weg                      | Pfad / Datei                            | Bedeutung                                       |
| ------------------------ | --------------------------------------- | ----------------------------------------------- |
| Umgebung (Container)     | `compose.yaml`, `rootfs/.env.example`   | empfohlener Weg                                 |
| Umgebung (nativ)         | `/data/.env`, vom Installer geschrieben | gleiche Variablen                               |
| Datenbankdatei           | `/data/shieldpm/default.json`           | ältere, weiterhin gelesene Konfiguration        |
| Schlüssel                | `/data/shieldpm/keys.json`              | Instanzschlüssel, nicht versionieren            |
| Anwendungs-Einstellungen | Tabelle `setting`                       | Laufzeiteinstellungen aus der UI                |
| Nginx                    | `/data/nginx/`                          | generierte Konfiguration, nicht von Hand ändern |

Die Reihenfolge in `backend/lib/config.js`: Datei zuerst, dann Umgebungsvariablen,
dann Standard (SQLite).

## Variablengruppen

**System:** `TZ`, `PUID`, `PGID`, `CSRF_SECRET`, `DATA_PATH`, `TRUST_PROXY`,
`NODE_ENV`.

**Netzwerk:** `NPM_PORT`, `GOA_PORT`, `HTTP_PORT`, `HTTPS_PORT`,
`HTTP3_ALT_SVC_PORT`, `DISABLE_HTTP`, `DISABLE_H3_QUIC`, `LISTEN_PROXY_PROTOCOL`,
`IPV4_BINDING`, `IPV6_BINDING`, `NPM_IPV4_BINDING`, `NPM_IPV6_BINDING`,
`GOA_IPV4_BINDING`, `GOA_IPV6_BINDING`, `DISABLE_IPV6`, `NPM_LISTEN_LOCALHOST`,
`GOA_LISTEN_LOCALHOST`.

**Datenbank:** `DB_MYSQL_HOST`, `DB_MYSQL_PORT`, `DB_MYSQL_USER`,
`DB_MYSQL_PASSWORD`, `DB_MYSQL_NAME`, `DB_MYSQL_SSL`,
`DB_MYSQL_SSL_REJECT_UNAUTHORIZED`, `DB_MYSQL_SSL_VERIFY_IDENTITY`,
`DB_POSTGRES_HOST`, `DB_POSTGRES_PORT`, `DB_POSTGRES_USER`, `DB_POSTGRES_PASSWORD`,
`DB_POSTGRES_NAME`.

**ACME/TLS:** `ACME_EMAIL`, `ACME_SERVER`, `ACME_EAB_KID`, `ACME_EAB_HMAC_KEY`,
`ACME_MUST_STAPLE`, `ACME_OCSP_STAPLING`, `ACME_PROFILE`, `ACME_KEY_TYPE`,
`ACME_SERVER_TLS_VERIFY`, `DEFAULT_CERT_ID`, `CUSTOM_OCSP_STAPLING`, `CRT`.

**Logging/Analytics:** `LOGROTATE`, `LOGROTATIONS`, `NGINX_LOG_NOT_FOUND`, `GOA`,
`GOACLA`.

**PHP:** `PHP82`, `PHP82_APKS`, `PHP83`, `PHP83_APKS`, `PHP84`, `PHP84_APKS`.

**Nginx:** `NGINX_QUIC_BPF`, `NGINX_DISABLE_PROXY_BUFFERING`, `NGINX_404_REDIRECT`,
`NGINX_HSTS_SUBDOMAINS`, `X_FRAME_OPTIONS`, `NGINX_WORKER_PROCESSES`,
`NGINX_WORKER_CONNECTIONS`, `DISABLE_NGINX_BEAUTIFIER`, `FULLCLEAN`,
`SKIP_IP_RANGES`, `IPRT`.

**GeoIP und Module:** `GEOIP_AUTO_UPDATE`,
`NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE`, `NGINX_LOAD_GEOIP2_MODULE`,
`NGINX_LOAD_NJS_MODULE`, `NGINX_LOAD_NTLM_MODULE`,
`NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE`.

**Docker/Discovery:** `DOCKER_HOSTS`.

**Initialisierung:** `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`,
`INITIAL_DEFAULT_PAGE`, `ENABLE_PRERUN`.

**Tunnel:** `TOR_ENABLED`.

Quellen: `compose.yaml:28-142`, `rootfs/.env.example` sowie für reine
Code-/Image-Variablen `backend/lib/config.js:6` (`DATA_PATH`),
`backend/app.js:21-36` (`TRUST_PROXY`) und `Dockerfile:64` (`NODE_ENV`).

## Weitere Konfigurationsdateien

| Datei                        | Zweck                                        |
| ---------------------------- | -------------------------------------------- |
| `rootfs/etc/certbot.ini`     | Certbot-Grundeinstellungen                   |
| `rootfs/etc/logrotate`       | Logrotation im Container                     |
| `rootfs/etc/crowdsec/*.yaml` | Parser, Collection, Acquisition für CrowdSec |
| `rootfs/etc/tor/torrc.tpl`   | Tor-Vorlage                                  |
| `backend/schema/common.json` | gemeinsame Schema-Bausteine                  |

## Regeln

- Neue Variable: in `backend/validate-env.cjs` validieren, in
  `rootfs/.env.example` dokumentieren, hier und in
  `llm-wiki/wiki/reference/konfiguration/umgebungsvariablen.md` nennen.
- Secrets niemals in `compose.yaml` oder `.env.example` eintragen; nur Namen.
- `CSRF_SECRET` sollte gesetzt werden, sonst werden Tokens bei jedem Neustart
  ungültig (`backend/app.js:39-44`).

## Risiken und Stolperfallen

- **Zwei Quellen:** `default.json` gewinnt gegen Umgebungsvariablen. Wer nur die
  Env ändert, wundert sich, warum die alte Datenbank weiter genutzt wird.
- **Unlesbare Konfiguration:** `config.js` bricht ab, statt still auf SQLite
  zurückzufallen — das ist Absicht.
- **`DATA_PATH`:** Backend-Module lesen die Variable, aber die Nginx-Vhost- und
  TLS-Pfade sind fest auf `/data` gesetzt; der native Installer setzt sie nicht.

## Offene Fragen

- Ob `DATA_PATH` für native Installationen offiziell unterstützt werden soll, ist
  eine Policy-Frage; die technische Spaltung steht oben. Prüfstelle:
  [Offene Fragen](../questions/open-questions.md).

## Verwandte Seiten

- [Laufzeit und Start](./runtime.md)
- [Build und Release](./build-and-release.md)
- [Sicherheit](../security/overview.md)
- [Umgebungsvariablen (Tiefe)](../reference/konfiguration/umgebungsvariablen.md)
- [Secrets und Sicherheit (Tiefe)](../reference/konfiguration/secrets-und-sicherheit.md)
