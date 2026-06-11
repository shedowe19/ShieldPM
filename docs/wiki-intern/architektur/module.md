# Architektur-Module

## Zweck

Übersicht über die architektonischen Schichten und wie Module miteinander interagieren.

## Backend-Schichten

### 1. Routes (API-Schicht)

**Pfad**: `backend/routes/`

Express-Routen definieren die REST-API-Endpunkte. Sie validieren Eingaben gegen JSON-Schemas und delegieren an die Internal-Schicht.

| Datei                        | Endpunkte                        |
| ---------------------------- | -------------------------------- |
| `main.js`                    | Basis-Routen, Health-Checks      |
| `nginx/proxy_hosts.js`       | `/api/nginx/proxy-hosts`         |
| `nginx/redirection_hosts.js` | `/api/nginx/redirection-hosts`   |
| `nginx/dead_hosts.js`        | `/api/nginx/dead-hosts`          |
| `nginx/streams.js`           | `/api/nginx/streams`             |
| `nginx/certificates.js`      | `/api/nginx/certificates`        |
| `nginx/access_lists.js`      | `/api/nginx/access-lists`        |
| `nginx/cloudflared.js`       | `/api/nginx/cloudflared-tunnels` |
| `nginx/tor_onion.js`         | `/api/nginx/tor-onion`           |
| `nginx/wireguard.js`         | `/api/nginx/wireguard`           |
| `nginx/ddns_providers.js`    | `/api/nginx/ddns-providers`      |
| `nginx/analytics.js`         | `/api/nginx/analytics`           |
| `monitoring.js`              | `/api/monitoring`                |
| `users.js`                   | `/api/users`                     |
| `tokens.js`                  | `/api/tokens`                    |
| `settings.js`                | `/api/settings`                  |
| `ai.js`                      | `/api/ai`                        |
| `chat.js`                    | `/api/chat`                      |
| `gitops.js`                  | `/api/gitops`                    |
| `2fa.js`                     | `/api/users/:user_id/2fa`        |
| `oidc.js`                    | `/api/oidc`                      |
| `audit-log.js`               | `/api/audit-log`                 |
| `dashboard.js`               | `/api/dashboard`                 |
| `reports.js`                 | `/api/reports`                   |
| `services.js`                | `/api/services`                  |

### 2. Internal (Business-Logik)

**Pfad**: `backend/internal/`

Enthält die gesamte Business-Logik. Jedes Modul prüft Berechtigungen, führt Operationen durch und triggert Nebeneffekte (Nginx-Reload, Audit-Log).

| Datei          | Beschreibung                                                |
| -------------- | ----------------------------------------------------------- |
| `nginx.js`     | Nginx-Konfiguration generieren/reloaden                     |
| `tor.js`       | Tor Onion Services + `syncProxyHost()`                      |
| `chat.js`      | Telegram-Bot + `smartEscape()`                              |
| `ip_ranges.js` | Cloudflare-IP-Ranges herunterladen & Nginx-Config schreiben |
| `gitops.js`    | GitOps-Auto-Push                                            |
| `ai/`          | AI-Agent                                                    |
| `token.js`     | JWT-Token-Erzeugung                                         |
| `dns.js`       | DNS-Challenge für Let's Encrypt                             |

### 3. Models (Datenzugriff)

**Pfad**: `backend/models/`

Objection.js Modelle definieren Tabellen, Relationen und Hooks (`$beforeInsert`, `$afterGet`).

### 4. Templates (Konfiguration)

**Pfad**: `backend/templates/`

EJS-Templates für Nginx-Konfigurationsdateien.

## Frontend-Schichten

### 1. Pages

**Pfad**: `frontend/src/pages/`

| Seite           | Beschreibung                                   |
| --------------- | ---------------------------------------------- |
| `Dashboard/`    | Hauptansicht mit Statistiken                   |
| `Nginx/`        | Proxy-Hosts, Redirections, Streams, Dead-Hosts |
| `Certificates/` | SSL-Zertifikatsverwaltung                      |
| `Access/`       | Access-Listen                                  |
| `Users/`        | Benutzerverwaltung                             |
| `Settings/`     | Systemeinstellungen                            |
| `Analytics/`    | Traffic-Analyse                                |
| `Monitoring/`   | Uptime-Monitoring und Check-Historie           |
| `AuditLog/`     | Protokolle                                     |
| `Login/`        | Anmeldung                                      |
| `Setup/`        | Ersteinrichtung                                |
| `Profile/`      | Benutzerprofil                                 |
| `ChatOps.tsx`   | Telegram-Integration                           |
| `DuoCallback/`  | Duo 2FA Callback                               |

### 2. Components

**Pfad**: `frontend/src/components/`

Wiederverwendbare UI-Komponenten basierend auf shadcn/ui (Radix UI).

### 3. API Hooks

**Pfad**: `frontend/src/api/backend/`

React Query Hooks für API-Aufrufe.

## Verwandte Seiten

- [Architektur-Überblick](./ueberblick.md)
- [API-Überblick](../api/ueberblick.md)
- [Modulübersicht](../module/README.md)
