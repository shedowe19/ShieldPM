# Modulübersicht

## Zweck

Überblick über alle Backend-Module in `backend/internal/`.

## Kontext

Jedes Modul folgt dem gleichen Pattern: Es exportiert ein Objekt mit `create`, `get`, `getAll`, `update`, `delete` Methoden, die einen `access`-Parameter für Berechtigungsprüfung erhalten.

## Module nach Kategorie

### Kern-Proxy-Verwaltung

| Modul            | Datei                         | Beschreibung                         |
| ---------------- | ----------------------------- | ------------------------------------ |
| Nginx-Engine     | `nginx.js` (12 KB)            | Konfigurationsgenerierung und Reload |
| Proxy-Host       | `proxy-host.js` (19 KB)       | CRUD für Reverse-Proxy-Hosts         |
| Redirection-Host | `redirection-host.js` (13 KB) | CRUD für Umleitungen                 |
| Dead-Host        | `dead-host.js` (11 KB)        | CRUD für 404-Hosts                   |
| Stream           | `stream.js` (12 KB)           | CRUD für TCP/UDP-Streams             |
| Host             | `host.js` (6 KB)              | Gemeinsame Host-Logik                |

### Sicherheit

| Modul        | Datei                            | Beschreibung                  |
| ------------ | -------------------------------- | ----------------------------- |
| Access-List  | `access-list.js` (17 KB)         | Basic Auth, IP-Filter, mTLS   |
| Zertifikate  | `certificate.js` (27 KB)         | SSL/TLS-Zertifikatsverwaltung |
| Certbot      | `certbot.js` (10 KB)             | Let's Encrypt Automatisierung |
| Token        | `token.js` (6 KB)                | JWT-Token-Verwaltung          |
| Anubis       | `anubis.js` (5 KB)               | PoW-Gate gegen Bots           |
| OAuth2-Proxy | `oauth2-proxy.js` (7 KB)         | SSO-Integration               |
| 2FA-Service  | `2fa-service.js` (21 KB)         | TOTP, WebAuthn, Duo Security  |
| Auth-Session | `auth-session-service.js` (6 KB) | Session-Verwaltung            |
| IP-Ranges    | `ip_ranges.js` (3 KB)            | Cloudflare IP-Ranges          |
| PKI          | `pki.js` (7 KB)                  | Interne CA / ML-KEM           |

### Tunnel & Netzwerk

| Modul         | Datei                     | Beschreibung                 |
| ------------- | ------------------------- | ---------------------------- |
| Cloudflared   | `cloudflared.js` (4 KB)   | Cloudflare Tunnel Verwaltung |
| Tor           | `tor.js` (11 KB)          | Tor Hidden Services          |
| WireGuard     | `wireguard.js` (19 KB)    | WireGuard VPN-Tunnels        |
| DDNS          | `ddns.js` (8 KB)          | Dynamic DNS Client           |
| DDNS-Provider | `ddns-provider.js` (4 KB) | DDNS-Anbieter-Logik          |

### Tools & Integrationen

| Modul           | Datei                   | Beschreibung                       |
| --------------- | ----------------------- | ---------------------------------- |
| AI              | `ai.js` (14 KB)         | AI-Agent Verwaltung                |
| AI-Core         | `ai/` (Ordner)          | Executor, Providers, Tools, Prompt |
| Chat (Telegram) | `chat.js` (7 KB)        | Telegram-Bot (Telegraf)            |
| Docker          | `docker.js` (15 KB)     | Docker Auto-Discovery              |
| GitOps          | `gitops.js` (38 KB)     | Git-Sync (isomorphic-git)          |
| Git-Deploy      | `git-deploy.js` (11 KB) | Auto-Deploy von Git-Repos          |
| Terminal        | `terminal.js` (4 KB)    | Web-SSH-Terminal                   |
| Analytics       | `analytics.js` (14 KB)  | Traffic-Analyse                    |

### Verwaltung

| Modul             | Datei                      | Beschreibung        |
| ----------------- | -------------------------- | ------------------- |
| Benutzer          | `user.js` (17 KB)          | Benutzerverwaltung  |
| Einstellungen     | `setting.js` (3 KB)        | Systemeinstellungen |
| Dashboard-Notizen | `dashboard_note.js` (3 KB) | Dashboard-Notizen   |
| Audit-Log         | `audit-log.js` (3 KB)      | Protokollierung     |
| Maintenance       | `maintenance.js` (5 KB)    | Wartungsfenster     |
| Report            | `report.js` (1 KB)         | System-Reports      |
| Remote-Version    | `remote-version.js` (2 KB) | Versionsprüfung     |

## Verwandte Seiten

- [Architektur-Überblick](../architektur/ueberblick.md)
- [Einzelne Modul-Dokumentationen](./nginx-engine.md)

_Hinweis:_ Planungsdokumente (z.B. AI-Agent-Checklisten) befinden sich unter `docs/planning/`.
