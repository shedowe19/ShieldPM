# Modulübersicht

## Zweck

Überblick über alle Backend-Module in `backend/internal/`.

## Kontext

Die Module unter `backend/internal/` bündeln Geschäftslogik. Viele CRUD-Module exportieren ein Objekt mit Methoden wie `create`, `get`, `getAll`, `update` und `delete`; andere sind zustandsbehaftete Dienste oder Hilfsfunktionen. Berechtigungen werden je nach API-Rolle über `access` und die Routen geprüft.

## Module nach Kategorie

### Kern-Proxy-Verwaltung

| Modul                                                                                         | Datei                       | Beschreibung                                  |
| --------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------- |
| [Nginx-Engine](./nginx-engine.md)                                                             | `nginx.js`                  | Konfigurationsgenerierung und Reload          |
| [Nginx-Templates](./nginx-templates.md)                                                       | `backend/templates/`        | LiquidJS-Templates für Nginx-Configs          |
| [Proxy-Host](./proxy-host.md)                                                                 | `proxy-host.js`             | CRUD für Reverse-Proxy-Hosts                  |
| [Proxy-Host-Konfigurationsvorschau](./proxy-host.md#konfigurationsvorschau-vor-dem-speichern) | `proxy-host-preview.js`     | Read-only-Vorschau und Diff vor dem Speichern |
| [Proxy-Host-Diagnose](../features/proxy-host-diagnostics.md)                                  | `proxy-host-diagnostics.js` | DNS-, TLS-, Upstream- und Routing-Diagnose    |
| [Proxy-Host-Überwachung](./proxy-host-monitor.md)                                             | `proxy-host-monitor.js`     | HTTP-/TCP-Zustandsprüfungen je Host           |
| [Resumable Upload Relay](./upload-relay.md)                                                   | `upload-relay.js`           | Persistente tus-Uploads zum privaten Upstream |
| [Redirection-Host](./redirection-host.md)                                                     | `redirection-host.js`       | CRUD für Umleitungen                          |
| [Dead-Host](./dead-host.md)                                                                   | `dead-host.js`              | CRUD für 404-Hosts                            |
| [Stream](./stream.md)                                                                         | `stream.js`                 | CRUD für TCP/UDP-Streams                      |
| [Host (gemeinsame Logik)](./host.md)                                                          | `host.js`                   | Gemeinsame Host-Logik                         |

### Sicherheit

| Modul                                                                             | Datei                     | Beschreibung                                |
| --------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------- |
| [Access-List](./access-lists.md)                                                  | `access-list.js`          | Basic Auth, IP-Filter, mTLS                 |
| [Zertifikate](./zertifikate.md)                                                   | `certificate.js`          | SSL/TLS-Zertifikatsverwaltung               |
| [Certbot](./certbot.md)                                                           | `certbot.js`              | Let's Encrypt Automatisierung               |
| [Globale ACME-Vorgabe](../verwaltung/einstellungen.md#globale-acme-profilvorgabe) | `acme-profile.js`         | Geprüfte Profilvorgabe aus UI oder Umgebung |
| [Token](./token.md)                                                               | `token.js`                | JWT-Token-Verwaltung                        |
| [Anubis](./anubis.md)                                                             | `anubis.js`               | PoW-Gate gegen Bots                         |
| [OAuth2-Proxy](./oauth2-proxy.md)                                                 | `oauth2-proxy.js`         | SSO-Integration                             |
| [2FA-Service](./2fa-service.md)                                                   | `2fa-service.js`          | TOTP, WebAuthn, Duo Security                |
| Auth-Session (siehe Benutzer & Auth)                                              | `auth-session-service.js` | Session-Verwaltung                          |
| [IP-Ranges](./ip-ranges.md)                                                       | `ip_ranges.js`            | Cloudflare-IP-Ranges                        |
| [PKI (interne CA)](./pki.md)                                                      | `pki.js`                  | Interne CA / ML-KEM                         |

### Tunnel & Netzwerk

| Modul                           | Datei              | Beschreibung                 |
| ------------------------------- | ------------------ | ---------------------------- |
| [Cloudflared](./cloudflared.md) | `cloudflared.js`   | Cloudflare Tunnel Verwaltung |
| [Tor](./tor.md)                 | `tor.js`           | Tor Hidden Services          |
| [WireGuard](./wireguard.md)     | `wireguard.js`     | WireGuard VPN-Tunnels        |
| [DDNS](./ddns.md)               | `ddns.js`          | Dynamic DNS Client           |
| DDNS-Provider (siehe DDNS)      | `ddns-provider.js` | DDNS-Anbieter-Logik          |

### Tools & Integrationen

| Modul                           | Datei           | Beschreibung                       |
| ------------------------------- | --------------- | ---------------------------------- |
| [AI / AI-Core](./ai-agent.md)   | `ai.js`         | AI-Agent Verwaltung                |
| AI-Core                         | `ai/` (Ordner)  | Executor, Providers, Tools, Prompt |
| [Chat (Telegram)](./chatops.md) | `chat.js`       | Telegram-Bot (Telegraf)            |
| [Docker](./docker.md)           | `docker.js`     | Docker Auto-Discovery              |
| [GitOps](./gitops.md)           | `gitops.js`     | Git-Sync (isomorphic-git)          |
| [Git-Deploy](./git-deploy.md)   | `git-deploy.js` | Auto-Deploy von Git-Repos          |
| [Terminal](./terminal.md)       | `terminal.js`   | Web-SSH-Terminal                   |
| [Analytics](./analytics.md)     | `analytics.js`  | Traffic-Analyse                    |

### Verwaltung

| Modul                                           | Datei               | Beschreibung        |
| ----------------------------------------------- | ------------------- | ------------------- |
| [Benutzer & Auth](./benutzer-auth.md)           | `user.js`           | Benutzerverwaltung  |
| [Einstellungen](../verwaltung/einstellungen.md) | `setting.js`        | Systemeinstellungen |
| [Dashboard-Notizen](./dashboard-notes.md)       | `dashboard_note.js` | Dashboard-Notizen   |
| [Audit-Log](../verwaltung/audit-log.md)         | `audit-log.js`      | Protokollierung     |
| [Maintenance](./maintenance.md)                 | `maintenance.js`    | Wartungsfenster     |
| [Report](../verwaltung/report.md)               | `report.js`         | System-Reports      |
| Remote-Version                                  | `remote-version.js` | Versionsprüfung     |

## Verwandte Seiten

- [Architektur-Überblick](../architektur/ueberblick.md)
- [Einzelne Modul-Dokumentationen](./nginx-engine.md)

_Hinweis:_ Planungsdokumente (z.B. AI-Agent-Checklisten) befinden sich unter `docs/planning/`.
