# ShieldPM — Internes LLM-Wiki

Willkommen im internen Entwickler-Wiki von **ShieldPM**. Den exakten Release-Stand liefern `.version` und die beiden
Package-Manifeste; dieses Wiki dupliziert keine volatile Versionsangabe.

Dieses Wiki dient als Langzeitgedächtnis des Projekts. Es erklärt Architektur, Module, Entscheidungen und Zusammenhänge — für Entwickler, neue Teammitglieder und LLM-Agenten.

> **Hinweis:** Die Benutzerdokumentation befindet sich unter [docs/wiki/](../wiki/Home.md) (englisch, GitHub Wiki-Format).
> Dieses Wiki ist die **interne Entwicklerdokumentation** auf Deutsch.

---

## Inhaltsverzeichnis

### Projekt

- [Überblick](./projekt/ueberblick.md)
- [Ziele](./projekt/ziele.md)
- [Begriffe](./projekt/begriffe.md)

### Architektur

- [Architektur-Überblick](./architektur/ueberblick.md)
- [Datenfluss](./architektur/datenfluss.md)
- [Module](./architektur/module.md)
- [Backend-Hilfsbibliotheken (lib)](./architektur/backend-lib.md)
- [Express-Middleware](./architektur/express-middleware.md)
- [Entscheidungen](./architektur/entscheidungen.md)
- [Externe Abhängigkeiten](./architektur/externe-abhaengigkeiten.md)

### Entwicklung

- [Setup](./entwicklung/setup.md)
- [Setup-Interna](./entwicklung/setup-intern.md)
- [Lokale Entwicklung](./entwicklung/lokale-entwicklung.md)
- [Tests](./entwicklung/tests.md)
- [Build](./entwicklung/build.md)
- [Deployment](./entwicklung/deployment.md)

### Module (Backend)

- [Modulübersicht](./module/README.md)
- [Nginx-Engine](./module/nginx-engine.md)
- [Nginx-Templates](./module/nginx-templates.md)
- [Proxy-Host](./module/proxy-host.md)
- [Redirection-Host](./module/redirection-host.md)
- [Dead-Host (404)](./module/dead-host.md)
- [Stream (TCP/UDP)](./module/stream.md)
- [Host (gemeinsame Logik)](./module/host.md)
- [Zertifikate](./module/zertifikate.md)
- [Certbot](./module/certbot.md)
- [Interne PKI](./module/pki.md)
- [Access-Lists](./module/access-lists.md)
- [OAuth2-Proxy (SSO)](./module/oauth2-proxy.md)
- [AI-Agent](./module/ai-agent.md)
- [ChatOps (Telegram)](./module/chatops.md)
- [GitOps](./module/gitops.md)
- [Git-Deploy](./module/git-deploy.md)
- [Tor Onion Services](./module/tor.md)
- [Cloudflare Tunnels](./module/cloudflared.md)
- [WireGuard Tunnels](./module/wireguard.md)
- [IP-Ranges (Cloudflare-IPs)](./module/ip-ranges.md)
- [DDNS](./module/ddns.md)
- [DDNS-Provider](./module/ddns-provider.md)
- [Docker Auto-Discovery](./module/docker.md)
- [Turbo-Loader (Batch-Import)](./module/turbo-loader.md)
- [OpenAppSec (WAF)](./module/openappsec.md)
- [2FA-Service](./module/2fa-service.md)
- [Auth-Session-Service](./module/auth-session-service.md)
- [Analytics](./module/analytics.md)
- [Maintenance](./module/maintenance.md)
- [Dashboard-Notizen](./module/dashboard-notes.md)
- [Terminal (SSH)](./module/terminal.md)
- [Benutzer & Auth](./module/benutzer-auth.md)
- [Token](./module/token.md)
- [2FA-Service](./module/2fa.md)
- [Anubis (PoW-Gate)](./module/anubis.md)

### Verwaltung

- [Übersicht](./verwaltung/README.md)
- [Einstellungen](./verwaltung/einstellungen.md)
- [Audit-Log](./verwaltung/audit-log.md)
- [System-Reports](./verwaltung/report.md)
- [Remote-Version](./module/remote-version.md)

### UI (Frontend)

- [Screens & Pages](./ui/screens.md)
- [Komponenten](./ui/komponenten.md)
- [Frontend-Internas (Hooks, Contexts, Modals)](./ui/frontend-internas.md)
- [Frontend API-Client](./ui/api-client.md)
- [Frontend API-Hooks](./ui/api-hooks.md)
- [Internationalisierung (i18n)](./ui/i18n.md)
- [Theme & Styling](./ui/theme.md)

### API

- [API-Überblick](./api/ueberblick.md)
- [Routen](./api/routen.md)
- [Nginx-Analytics Routes](./api/nginx-analytics.md)
- [DDNS-Provider Routes](./api/nginx-ddns-providers.md)
- [Schemas](./api/schemas.md)

### Daten

- [Datenmodell](./daten/datenmodell.md)
- [Datenbank](./daten/datenbank.md)
- [Schemas](./daten/schemas.md)
- [Migrationen](./daten/migrationen.md)

### Konfiguration

- [Umgebungsvariablen](./konfiguration/umgebungsvariablen.md)
- [Config-Dateien](./konfiguration/config-dateien.md)
- [Rootfs-Referenz](./konfiguration/rootfs.md)
- [Secrets & Sicherheit](./konfiguration/secrets-und-sicherheit.md)

### Entscheidungen

- [ADR-Übersicht](./entscheidungen/README.md)
- [ADR-Vorlage](./entscheidungen/adr-template.md)
- [Security- und Durability-Modernisierung (2026-08-31)](./entscheidungen/2026-08-31-security-modernisierung.md)

### Features

- [Feature-Übersicht](./features/README.md)
- [Swagger UI (API-Dokumentation)](./features/swagger-ui.md)

### Modul-Beziehungen

Ein ShieldPM-Modul steht selten allein. Diese Übersicht zeigt die wichtigsten Abhängigkeiten:

- **nginx-engine.js** → zentrale Config-Engine → wird beeinflusst von proxy-host, redirection-host, dead-host, stream, access-lists, certificate, anubis
- **proxy-host.js** → nutzt certificate, access-list, host, nginx-engine, gitops, audit-log
- **redirection-host.js** → nutzt host, certificate, nginx-engine, gitops, audit-log
- **dead-host.js** → nutzt host, certificate, nginx-engine, gitops, audit-log
- **stream.js** → nutzt certificate, nginx-engine, gitops, audit-log
- **certificate.js** → zentrales Zertifikatsmodul → genutzt von proxy-host, stream, redirection-host, dead-host, certbot
- **access-lists.js** → nutzt nginx-engine, audit-log, bcryptjs
- **host.js** (gemeinsame Logik) → Basis für proxy-host, redirection-host, dead-host, stream
- **user.js / benutzer-auth.js** → nutzt token, auth-session-service, 2fa-service, audit-log
- **token.js** → nutzt jsonwebtoken
- **2fa-service.js** → nutzt otplib, simplewebauthn, duo-universal, qrcode, bcryptjs
- **auth-session-service.js** → nutzt token, benutzer-auth, 2fa-service
- **chatops.js** → nutzt telegraf, ai-agent und einen live `integration-access`-Principal (keine JWT-Synthese)
- **ai-agent.js** → nutzt internal/setting, strikte Tool-Schemas/Safety/Confirmation und audit-log
- **tor.js** → nutzt nginx-engine, Tor-Daemon; bietet syncProxyHost() für Proxy-Host-Synchronisation
- **oauth2-proxy.js** → nutzt nginx-engine, setting, audit-log
- **gitops.js** → nutzt isomorphic-git/AJV; validiert snapshot v2 und importiert Proxy/Redirect/Dead/Stream mit Recovery
- **git-deploy.js** → nutzt isomorphic-git, proxy-host, dead-host, audit-log
- **certbot.js** → nutzt nginx-engine, certbot-CLI
- **ip-ranges.js** → nutzt nginx-engine, proxy-agent, Cloudflare-API
- **cloudflared.js** → nutzt Cloudflared-Binary, audit-log
- **wireguard.js** → nutzt wireguard-tools, iproute2
- **pki.js** → nutzt node:crypto, optional OpenSSL (ML-KEM-Hybrid)
- **terminal.js** → nutzt ssh2/ws; HMAC-Gateway, One-Time-Tickets, ACL-Revision und SSH-Host-Key-Pinning
- **maintenance.js** → nutzt nginx-engine (Maintenance-Config)
- **dashboard-notes.js** → nutzt audit-log, lib/access (RBAC)
- **ddns.js / ddns-provider.js** → feste DNS-APIs plus HTTPS-Custom-Callbacks innerhalb der SSRF-Grenze
- **docker.js** → nutzt dockerode, Docker-Socket
- **turbo-loader.js** → Frontend-Chunk-Download + Nginx-Interception
- **openappsec.js** → WAF-Modul (nginx-Modul + Docker/native)
- **anubis.js** → externer Anubis-Service (PoW-Gate)

- **analytics.js** → nutzt fsync-Spool/Ledger im Backend und lokale Chart-/Map-Daten im Frontend; GoAccess optional

### API-Routen (Überblick)

| Route-Datei                  | API-Pfad                         | Modul / Thema                           |
| ---------------------------- | -------------------------------- | --------------------------------------- |
| `main.js`                    | `/api/`                          | Hauptendpunkte (health, backup, detect) |
| `users.js`                   | `/api/users`                     | Benutzerverwaltung                      |
| `tokens.js`                  | `/api/tokens`                    | Login, Refresh, Logout                  |
| `2fa.js`                     | `/api/users/:user_id/2fa`        | TOTP, Passkey, Duo, Backup-Codes        |
| `settings.js`                | `/api/settings`                  | Globale Einstellungen                   |
| `services.js`                | `/api/services`                  | Service-Management                      |
| `schema.js`                  | `/api/schema`                    | Validierungs-Schemata                   |
| `version.js`                 | `/api/version`                   | Versionsabfrage                         |
| `dashboard.js`               | `/api/dashboard`                 | Dashboard-Stats                         |
| `analytics.js`               | `/api/analytics`                 | Frontend-Analytics                      |
| `reports.js`                 | `/api/reports`                   | System-Reports                          |
| `audit-log.js`               | `/api/audit-log`                 | Audit-Log                               |
| `oidc.js`                    | `/api/oidc`                      | OpenID Connect                          |
| `chat.js`                    | `/api/chat`                      | ChatOps / Telegram                      |
| `gitops.js`                  | `/api/gitops`                    | GitOps Pull/Push                        |
| `ai.js`                      | `/api/ai`                        | AI-Agent                                |
| `password-reset.js`          | `/api/password-reset`            | Passwort-Reset                          |
| `nginx/proxy_hosts.js`       | `/api/nginx/proxy-hosts`         | proxy-host                              |
| `nginx/redirection_hosts.js` | `/api/nginx/redirection-hosts`   | redirection-host                        |
| `nginx/dead_hosts.js`        | `/api/nginx/dead-hosts`          | dead-host                               |
| `nginx/streams.js`           | `/api/nginx/streams`             | stream (TCP/UDP)                        |
| `nginx/certificates.js`      | `/api/nginx/certificates`        | Zertifikate                             |
| `nginx/access_lists.js`      | `/api/nginx/access-lists`        | access-lists                            |
| `nginx/cloudflared.js`       | `/api/nginx/cloudflared-tunnels` | cloudflared                             |
| `nginx/tor_onion.js`         | `/api/nginx/tor-onion`           | tor                                     |
| `nginx/wireguard.js`         | `/api/nginx/wireguard`           | wireguard                               |
| `nginx/ddns_providers.js`    | `/api/nginx/ddns-providers`      | ddns-provider                           |
| `nginx/analytics.js`         | `/api/nginx/analytics`           | Nginx-Analytics                         |

### Meta

- [Glossar](./glossar.md)
- [Offene Fragen](./offene-fragen.md)
- [Wiki-Pflege](./wiki-pflege.md)
- **Beziehungsgraph (HTML, offline-fähig):** `wiki-graph.html` — wird mit `python3 scripts/wiki-graph.py` neu generiert

---

_Zuletzt aktualisiert: 2026-08-31_

## Verwandte Seiten

- [Projektüberblick](./projekt/ueberblick.md)
- [Architektur-Überblick](./architektur/ueberblick.md)
- [Module](./module/README.md)
- [API-Überblick](./api/ueberblick.md)
- [Wiki-Pflege](./wiki-pflege.md)
