# Modulübersicht

## Zweck

Überblick über alle Backend-Module in `backend/internal/`.

## Kontext

Jedes Modul folgt dem gleichen Pattern: Es exportiert ein Objekt mit `create`, `get`, `getAll`, `update`, `delete` Methoden, die einen `access`-Parameter für Berechtigungsprüfung erhalten.

## Module nach Kategorie

### Kern-Proxy-Verwaltung

| Modul                                     | Datei                         | Beschreibung                         |
| ----------------------------------------- | ----------------------------- | ------------------------------------ |
| [Nginx-Engine](./nginx-engine.md)         | `nginx.js` (12 KB)            | Konfigurationsgenerierung und Reload |
| [Nginx-Templates](./nginx-templates.md)   | `templates/` (9 Dateien)      | EJS-Templates für Nginx-Configs      |
| [Proxy-Host](./proxy-host.md)             | `proxy-host.js` (19 KB)       | CRUD für Reverse-Proxy-Hosts         |
| [Redirection-Host](./redirection-host.md) | `redirection-host.js` (13 KB) | CRUD für Umleitungen                 |
| [Dead-Host](./dead-host.md)               | `dead-host.js` (11 KB)        | CRUD für 404-Hosts                   |
| [Stream](./stream.md)                     | `stream.js` (12 KB)           | CRUD für TCP/UDP-Streams             |
| [Host (gemeinsame Logik)](./host.md)      | `host.js` (6 KB)              | Gemeinsame Host-Logik                |

### Sicherheit

| Modul                                | Datei                            | Beschreibung                  |
| ------------------------------------ | -------------------------------- | ----------------------------- |
| [Host-Firewall](./host-firewall.md)     | `firewall-policy.js` (neu)       | GeoIP- und CIDR-Policies je Proxy-Host |
| [Access-List](./access-lists.md)     | `access-list.js` (17 KB)         | Basic Auth, IP-Filter, mTLS   |
| [Zertifikate](./zertifikate.md)      | `certificate.js` (27 KB)         | SSL/TLS-Zertifikatsverwaltung |
| Certbot                              | `certbot.js` (10 KB)             | Let's Encrypt Automatisierung |
| Token                                | `token.js` (6 KB)                | JWT-Token-Verwaltung          |
| [Anubis](./anubis.md)                | `anubis.js` (5 KB)               | PoW-Gate gegen Bots           |
| [OAuth2-Proxy](./oauth2-proxy.md)    | `oauth2-proxy.js` (7 KB)         | SSO-Integration               |
| [2FA-Service](./2fa.md)              | `2fa-service.js` (21 KB)         | TOTP, WebAuthn, Duo Security  |
| Auth-Session (siehe Benutzer & Auth) | `auth-session-service.js` (6 KB) | Session-Verwaltung            |
| [IP-Ranges](./ip-ranges.md)          | `ip_ranges.js` (3 KB)            | Cloudflare IP-Ranges          |
| [PKI (interne CA)](./pki.md)         | `pki.js` (7 KB)                  | Interne CA / ML-KEM           |

### Tunnel & Netzwerk

| Modul                           | Datei                     | Beschreibung                 |
| ------------------------------- | ------------------------- | ---------------------------- |
| [Cloudflared](./cloudflared.md) | `cloudflared.js` (4 KB)   | Cloudflare Tunnel Verwaltung |
| [Tor](./tor.md)                 | `tor.js` (11 KB)          | Tor Hidden Services          |
| [WireGuard](./wireguard.md)     | `wireguard.js` (19 KB)    | WireGuard VPN-Tunnels        |
| [DDNS](./ddns.md)               | `ddns.js` (8 KB)          | Dynamic DNS Client           |
| DDNS-Provider (siehe DDNS)      | `ddns-provider.js` (4 KB) | DDNS-Anbieter-Logik          |

### Tools & Integrationen

| Modul                           | Datei                   | Beschreibung                       |
| ------------------------------- | ----------------------- | ---------------------------------- |
| [AI / AI-Core](./ai-agent.md)   | `ai.js` (14 KB)         | AI-Agent Verwaltung                |
| AI-Core                         | `ai/` (Ordner)          | Executor, Providers, Tools, Prompt |
| [Chat (Telegram)](./chatops.md) | `chat.js` (7 KB)        | Telegram-Bot (Telegraf)            |
| [Docker](./docker.md)           | `docker.js` (15 KB)     | Docker Auto-Discovery              |
| [GitOps](./gitops.md)           | `gitops.js` (38 KB)     | Git-Sync (isomorphic-git)          |
| [Git-Deploy](./git-deploy.md)   | `git-deploy.js` (11 KB) | Auto-Deploy von Git-Repos          |
| [Terminal](./terminal.md)       | `terminal.js` (4 KB)    | Web-SSH-Terminal                   |
| [Analytics](./analytics.md)     | `analytics.js` (14 KB)  | Traffic-Analyse                    |

### Verwaltung

| Modul                                           | Datei                      | Beschreibung        |
| ----------------------------------------------- | -------------------------- | ------------------- |
| [Benutzer & Auth](./benutzer-auth.md)           | `user.js` (17 KB)          | Benutzerverwaltung  |
| [Einstellungen](../verwaltung/einstellungen.md) | `setting.js` (3 KB)        | Systemeinstellungen |
| [Dashboard-Notizen](./dashboard-notes.md)       | `dashboard_note.js` (3 KB) | Dashboard-Notizen   |
| [Audit-Log](../verwaltung/audit-log.md)         | `audit-log.js` (3 KB)      | Protokollierung     |
| [Maintenance](./maintenance.md)                 | `maintenance.js` (5 KB)    | Wartungsfenster     |
| [Report](../verwaltung/report.md)               | `report.js` (1 KB)         | System-Reports      |
| Remote-Version                                  | `remote-version.js` (2 KB) | Versionsprüfung     |

## Verwandte Seiten

- [Architektur-Überblick](../architektur/ueberblick.md)
- [Einzelne Modul-Dokumentationen](./nginx-engine.md)

_Hinweis:_ Planungsdokumente (z.B. AI-Agent-Checklisten) befinden sich unter `docs/planning/`.
