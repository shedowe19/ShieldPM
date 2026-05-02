# API-Routen

## Zweck

Detaillierte Auflistung aller API-Routen-Dateien.

## Routen-Dateien

| Datei                 | Pfad             | Beschreibung            |
| --------------------- | ---------------- | ----------------------- |
| `routes/main.js`      | `/api/`          | Basis-Routen, Health    |
| `routes/tokens.js`    | `/api/tokens`    | Login, Token-Verwaltung |
| `routes/users.js`     | `/api/users`     | Benutzer CRUD           |
| `routes/settings.js`  | `/api/settings`  | Systemeinstellungen     |
| `routes/dashboard.js` | `/api/dashboard` | Dashboard-Daten         |
| `routes/audit-log.js` | `/api/audit-log` | Audit-Protokoll         |
| `routes/reports.js`   | `/api/reports`   | System-Reports          |
| `routes/services.js`  | `/api/services`  | Docker-Services         |
| `routes/ai.js`        | `/api/ai`        | AI-Agent                |
| `routes/chat.js`      | `/api/chat`      | ChatOps                 |
| `routes/gitops.js`    | `/api/gitops`    | GitOps                  |
| `routes/2fa.js`       | `/api/2fa`       | Zwei-Faktor             |
| `routes/oidc.js`      | `/api/oidc`      | OpenID Connect          |
| `routes/analytics.js` | `/api/analytics` | Analytics               |
| `routes/schema.js`    | `/api/schema`    | OpenAPI Schema          |
| `routes/version.js`   | `/api/version`   | Versionsinformation     |

### Nginx-Subrouten (`routes/nginx/`)

| Datei                  | Pfad                           |
| ---------------------- | ------------------------------ |
| `proxy_hosts.js`       | `/api/nginx/proxy-hosts`       |
| `redirection_hosts.js` | `/api/nginx/redirection-hosts` |
| `dead_hosts.js`        | `/api/nginx/dead-hosts`        |
| `streams.js`           | `/api/nginx/streams`           |
| `certificates.js`      | `/api/nginx/certificates`      |
| `access_lists.js`      | `/api/nginx/access-lists`      |
| `cloudflared.js`       | `/api/nginx/cloudflared`       |
| `tor_onion.js`         | `/api/nginx/tor-onion`         |
| `wireguard.js`         | `/api/nginx/wireguard`         |
| `ddns_providers.js`    | `/api/nginx/ddns-providers`    |
| `analytics.js`         | `/api/nginx/analytics`         |

## Verwandte Seiten

- [API-Überblick](./ueberblick.md)
- [Schemas](./schemas.md)
