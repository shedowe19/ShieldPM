# Architektur-Module

## Zweck

Übersicht über die architektonischen Schichten und wie Module miteinander interagieren.

## Backend-Schichten

### 1. Routes (API-Schicht)

**Pfad**: `backend/routes/`

Express-Routen definieren die REST-API-Endpunkte und delegieren an die Internal-Schicht. Viele JSON-Endpunkte verwenden AJV-Schemas; andere Eingaben wie TUS-Upload-Header werden direkt validiert. Die Berechtigungsprüfung liegt je nach Endpunkt in der Route oder im internen Dienst.

| Datei                        | Endpunkte                                     |
| ---------------------------- | --------------------------------------------- |
| `main.js`                    | Basis-Routen, Health-Checks                   |
| `nginx/proxy_hosts.js`       | `/api/nginx/proxy-hosts`                      |
| `nginx/redirection_hosts.js` | `/api/nginx/redirection-hosts`                |
| `nginx/dead_hosts.js`        | `/api/nginx/dead-hosts`                       |
| `nginx/streams.js`           | `/api/nginx/streams`                          |
| `nginx/certificates.js`      | `/api/nginx/certificates`                     |
| `nginx/access_lists.js`      | `/api/nginx/access-lists`                     |
| `nginx/cloudflared.js`       | `/api/nginx/cloudflared-tunnels`              |
| `nginx/tor_onion.js`         | `/api/nginx/tor-onion`                        |
| `nginx/wireguard.js`         | `/api/nginx/wireguard`                        |
| `nginx/ddns_providers.js`    | `/api/nginx/ddns-providers`                   |
| `nginx/analytics.js`         | `/api/nginx/analytics`                        |
| `users.js`                   | `/api/users`                                  |
| `tokens.js`                  | `/api/tokens`                                 |
| `settings.js`                | `/api/settings`                               |
| `ai.js`                      | `/api/ai`                                     |
| `chat.js`                    | `/api/chat`                                   |
| `gitops.js`                  | `/api/gitops`                                 |
| `2fa.js`                     | `/api/users/:user_id/2fa`                     |
| `oidc.js`                    | `/api/oidc`                                   |
| `audit-log.js`               | `/api/audit-log`                              |
| `dashboard.js`               | `/api/dashboard`                              |
| `reports.js`                 | `/api/reports`                                |
| `services.js`                | `/api/services`                               |
| `nginx/upload-relay.js`      | `/api/nginx/proxy-hosts/:hostId/upload-relay` |

### 2. Internal (Business-Logik)

**Pfad**: `backend/internal/`

Enthält die Fachlogik für Hostkonfiguration, Zertifikate und Integrationen. Dienste mit Benutzerkontext prüfen die erforderlichen Berechtigungen; technische Helfer wie die Nginx-Engine werden von bereits autorisierten Aufrufern oder Startprozessen verwendet. Operationen können Nebeneffekte wie Nginx-Reloads und Audit-Einträge auslösen.

| Datei          | Beschreibung                                                |
| -------------- | ----------------------------------------------------------- |
| `nginx.js`     | Nginx-Konfiguration generieren/reloaden                     |
| `tor.js`       | Tor Onion Services + `syncProxyHost()`                      |
| `chat.js`      | Telegram-Bot + `smartEscape()`                              |
| `ip_ranges.js` | Cloudflare-IP-Ranges herunterladen & Nginx-Config schreiben |
| `gitops.js`    | GitOps-Auto-Push                                            |
| `ai/`          | AI-Agent                                                    |
| `token.js`     | JWT-Token-Erzeugung                                         |
| `certbot.js`   | Let's-Encrypt-Ausstellung und DNS-Challenge                 |

### 3. Models (Datenzugriff)

**Pfad**: `backend/models/`

Objection.js Modelle definieren Tabellen, Relationen und Hooks (`$beforeInsert`, `$afterFind`, `$parseDatabaseJson`, `$formatDatabaseJson`).

### 4. Templates (Konfiguration)

**Pfad**: `backend/templates/`

LiquidJS-Vorlagen (`*.conf`) für Nginx-Konfigurationsdateien. `internal/nginx.js` serialisiert die Hostkonfiguration, prüft mit `nginx -tq` und signalisiert anschließend den Reload; bei einem fehlerhaften Host wird die vorherige Datei wiederhergestellt.

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
