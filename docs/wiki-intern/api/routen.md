# API-Routen

## Zweck

Detaillierte Auflistung aller API-Routen-Dateien.

## Routen-Dateien

| Datei                 | Pfad                      | Beschreibung            |
| --------------------- | ------------------------- | ----------------------- |
| `routes/main.js`      | `/api/`                   | Basis-Routen, Health    |
| `routes/tokens.js`    | `/api/tokens`             | Login, Token-Verwaltung |
| `routes/users.js`     | `/api/users`              | Benutzer CRUD           |
| `routes/settings.js`  | `/api/settings`           | Systemeinstellungen     |
| `routes/dashboard.js` | `/api/dashboard`          | Dashboard-Daten         |
| `routes/audit-log.js` | `/api/audit-log`          | Audit-Protokoll         |
| `routes/reports.js`   | `/api/reports`            | System-Reports          |
| `routes/services.js`  | `/api/services`           | Docker-Services         |
| `routes/ai.js`        | `/api/ai`                 | AI-Agent                |
| `routes/chat.js`      | `/api/chat`               | ChatOps                 |
| `routes/gitops.js`    | `/api/gitops`             | GitOps                  |
| `routes/2fa.js`       | `/api/users/:user_id/2fa` | Zwei-Faktor             |
| `routes/oidc.js`      | `/api/oidc`               | OpenID Connect          |
| `routes/analytics.js` | `/api/analytics`          | Analytics               |
| `routes/schema.js`    | `/api/schema`             | OpenAPI Schema          |
| `routes/version.js`   | `/api/version`            | Versionsinformation     |

`GET /api` gibt Health-, Setup-, Demo- und Versionsstatus sowie einen anfänglichen CSRF-Token zurück. `GET /api/schema` liefert die kompilierte, derzeit nur teilweise vollständige OpenAPI-Definition. Die Swagger-Oberfläche wird in `backend/app.js` unter `/docs` registriert und über den UI-Proxy als `/api/docs` erreicht.

### Nginx-Subrouten (`routes/nginx/`)

| Datei                  | Pfad                                          |
| ---------------------- | --------------------------------------------- |
| `proxy_hosts.js`       | `/api/nginx/proxy-hosts`                      |
| `redirection_hosts.js` | `/api/nginx/redirection-hosts`                |
| `dead_hosts.js`        | `/api/nginx/dead-hosts`                       |
| `streams.js`           | `/api/nginx/streams`                          |
| `certificates.js`      | `/api/nginx/certificates`                     |
| `access_lists.js`      | `/api/nginx/access-lists`                     |
| `cloudflared.js`       | `/api/nginx/cloudflared-tunnels`              |
| `tor_onion.js`         | `/api/nginx/tor-onion`                        |
| `wireguard.js`         | `/api/nginx/wireguard`                        |
| `ddns_providers.js`    | `/api/nginx/ddns-providers`                   |
| `analytics.js`         | `/api/nginx/analytics`                        |
| `upload-relay.js`      | `/api/nginx/proxy-hosts/:hostId/upload-relay` |

### Proxy-Host-Konfigurationsvorschau

`POST /api/nginx/proxy-hosts/preview` (Create-Body) und
`POST /api/nginx/proxy-hosts/:host_id/preview` (Update-Body) rendern nach Berechtigungs- und
Referenzprüfung einen Entwurf ohne Speicherung. Die Antwort enthält `config`, `diff`, `hasCurrent`,
`nginxValidated: false` und `limitations` (`render-only`, bei neuen Hosts `id-pending`, bei noch
auszustellenden Zertifikaten `certificate-pending`). Die gerenderte Konfiguration ist vor der optionalen
Formatierung und maskiert bekannte Geheimnisse; der Diff vergleicht mit der aktiven Konfiguration nur
des berechtigten Hosts. Ein `nginx -tq` der vorgeschlagenen Konfiguration erfolgt erst beim Speichern.

### Zertifikatsprofile

`POST /api/nginx/certificates` akzeptiert bei `provider: "letsencrypt"` das optionale Feld
`meta.letsencrypt_profile` (`standard` oder `shortlived`, fehlend entspricht `standard`). Dieselbe
Auswahl wird bei Host-Erstellung oder -Aktualisierung mit `certificate_id: "new"` an die Ausstellung
weitergereicht; Streams benötigen hierfür DNS-Verifikation. Die bestehenden Renew-Routen behalten
das gespeicherte Profil bei. Der Update-Endpunkt eines vorhandenen Zertifikats erlaubt keinen
Profilwechsel. Details und Grenzen stehen unter [Zertifikate](../module/zertifikate.md).

### Proxy-Host-Diagnose

`POST /api/nginx/proxy-hosts/:host_id/diagnostics` startet die [Proxy-Host-Diagnose](../features/proxy-host-diagnostics.md). Die Route akzeptiert keine frei wählbaren Netzwerkziele.

### Aktive Proxy-Host-Überwachung

Die Proxy-Host-Route bietet außerdem `/monitors/status?ids=…` für sichtbare Zustände und
`/:host_id/monitor` (GET/PUT) sowie `/:host_id/monitor/check` (POST) für die
[aktive Host-Überwachung](../module/proxy-host-monitor.md).

Die Nginx-Analytics-Zeitreihe liegt unter `GET /api/nginx/analytics/:hostId` (ohne `/series`),
die Zusammenfassung unter `GET /api/nginx/analytics/:hostId/summary`. Die DDNS-Routen
bieten zusätzlich `POST /api/nginx/ddns-providers/:id/test`.

## Verwandte Seiten

- [API-Überblick](./ueberblick.md)
- [Schemas](./schemas.md)
