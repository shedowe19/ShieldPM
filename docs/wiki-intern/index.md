# ShieldPM — Internes LLM-Wiki

Willkommen im internen Entwickler-Wiki von **ShieldPM** (v4.4.1).

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
- [TScanner-Projektregeln](../wiki/TScanner.md) — Deterministische Regeln, CLI, VSCode und CI-Berichte.
- [Build](./entwicklung/build.md)
- [Deployment](./entwicklung/deployment.md)

### Module (Backend)

- [Modulübersicht](./module/README.md)
- [Nginx-Engine](./module/nginx-engine.md)
- [Nginx-Templates](./module/nginx-templates.md)
- [Proxy-Host](./module/proxy-host.md)
- [Proxy-Host-Konfigurationsvorschau](./module/proxy-host.md#konfigurationsvorschau-vor-dem-speichern)
- [Proxy-Host-Überwachung](./module/proxy-host-monitor.md)
- [Resumable Upload Relay](./module/upload-relay.md)
- [Redirection-Host](./module/redirection-host.md)
- [Dead-Host (404)](./module/dead-host.md)
- [Stream (TCP/UDP)](./module/stream.md)
- [Host (gemeinsame Logik)](./module/host.md)
- [Zertifikate](./module/zertifikate.md)
- [Certbot](./module/certbot.md)
- [Interne PKI](./module/pki.md)
- [Access-Lists](./module/access-lists.md)
- [IP-Firewall pro Proxy-Host](./module/ip-firewall.md)
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
- [2FA-Überblick](./module/2fa.md)
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
- [Proxy-Host-Diagnose](./features/proxy-host-diagnostics.md)
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

### Features

- [Feature-Übersicht](./features/README.md)
- [Swagger UI (API-Dokumentation)](./features/swagger-ui.md)

### Modul-Beziehungen

Die zentrale Engine `backend/internal/nginx.js` rendert Nginx-Konfigurationen mit LiquidJS aus `backend/templates/` und prüft sie mit `nginx -tq` vor dem Reload. Die Host-Module (`proxy-host.js`, `redirection-host.js`, `dead-host.js`, `stream.js`) verwenden sie zusammen mit `host.js`, Zertifikaten und GitOps. Der Proxy-Host integriert zusätzlich Überwachung, Diagnose, Git-Deploy, OAuth2-Proxy und optionalen Upload-Relay.

- **Authentifizierung:** `user.js`, `token.js`, `auth-session-service.js` und `2fa-service.js` verwalten Benutzer, Tokens, Sitzungen und zweite Faktoren; die Routen verbinden diese Dienste.
- **Zugriff und Zertifikate:** `access-list.js`, `oauth2-proxy.js`, `certificate.js`, `certbot.js` und `pki.js` liefern Regeln, SSO und TLS-Material für Hosts. Die eigenständige [IP-Firewall](./module/ip-firewall.md) verbindet zentrale TXT-/HTTPS-Listen mit je Host gewählten Sperren, Ausnahmen und einer eigenen Sperrseite; sie teilt die Listenberechtigung `access_lists`, nicht deren Authentifizierungsablauf.
- **Netzwerk:** `tor.js`, `cloudflared.js`, `wireguard.js`, `ddns.js` und `ip_ranges.js` binden externe Dienste beziehungsweise Systemwerkzeuge ein.
- **Automatisierung:** `gitops.js` importiert und exportiert Konfigurationen; `git-deploy.js` aktualisiert Proxy-Hosts aus Git. `docker.js` erkennt Container über Docker-Labels und bündelt seine eigenen Nginx-Änderungen mit einem 2-Sekunden-Timer.
- **Verwaltung:** `ai.js` bindet Provider und Tools ein; `chat.js` nutzt den AI-Dienst für Telegram. `maintenance.js` erstellt Wartungskonfigurationen, `dashboard_note.js` verwaltet Dashboard-Notizen und `analytics.js` verarbeitet Zugriffslogs. Die React-Oberfläche rendert Diagramme mit Recharts und Karten mit world-atlas.
- **Weitere Integrationen:** `anubis.js` verwaltet die PoW-Gate-Integration. OpenAppSec wird über das Nginx-Attachment und einen externen Agenten eingebunden; ein `openappsec.js`-Backendmodul existiert nicht.

Details und Dateipfade stehen in der [Modulübersicht](./module/README.md) und den verlinkten Modulseiten.

### API-Routen (Überblick)

| Route-Datei                  | API-Pfad                                      | Modul / Thema                           |
| ---------------------------- | --------------------------------------------- | --------------------------------------- |
| `main.js`                    | `/api/`                                       | Hauptendpunkte (health, backup, detect) |
| `users.js`                   | `/api/users`                                  | Benutzerverwaltung                      |
| `tokens.js`                  | `/api/tokens`                                 | Login, Refresh, Logout                  |
| `2fa.js`                     | `/api/users/:user_id/2fa`                     | TOTP, Passkey, Duo, Backup-Codes        |
| `settings.js`                | `/api/settings`                               | Globale Einstellungen                   |
| `services.js`                | `/api/services`                               | Service-Management                      |
| `schema.js`                  | `/api/schema`                                 | Validierungs-Schemata                   |
| `version.js`                 | `/api/version`                                | Versionsabfrage                         |
| `dashboard.js`               | `/api/dashboard`                              | Dashboard-Stats                         |
| `analytics.js`               | `/api/analytics`                              | Frontend-Analytics                      |
| `reports.js`                 | `/api/reports`                                | System-Reports                          |
| `audit-log.js`               | `/api/audit-log`                              | Audit-Log                               |
| `oidc.js`                    | `/api/oidc`                                   | OpenID Connect                          |
| `chat.js`                    | `/api/chat`                                   | ChatOps / Telegram                      |
| `gitops.js`                  | `/api/gitops`                                 | GitOps Pull/Push                        |
| `ai.js`                      | `/api/ai`                                     | AI-Agent                                |
| `password-reset.js`          | CLI, kein API-Endpunkt                        | SQLite-Passwort-Reset                   |
| `nginx/proxy_hosts.js`       | `/api/nginx/proxy-hosts`                      | proxy-host                              |
| `nginx/redirection_hosts.js` | `/api/nginx/redirection-hosts`                | redirection-host                        |
| `nginx/dead_hosts.js`        | `/api/nginx/dead-hosts`                       | dead-host                               |
| `nginx/streams.js`           | `/api/nginx/streams`                          | stream (TCP/UDP)                        |
| `nginx/certificates.js`      | `/api/nginx/certificates`                     | Zertifikate                             |
| `nginx/access_lists.js`      | `/api/nginx/access-lists`                     | access-lists                            |
| `nginx/firewall_lists.js`    | `/api/nginx/firewall-lists`                   | IP-Firewall-Listen                      |
| `nginx/cloudflared.js`       | `/api/nginx/cloudflared-tunnels`              | cloudflared                             |
| `nginx/tor_onion.js`         | `/api/nginx/tor-onion`                        | tor                                     |
| `nginx/wireguard.js`         | `/api/nginx/wireguard`                        | wireguard                               |
| `nginx/ddns_providers.js`    | `/api/nginx/ddns-providers`                   | ddns-provider                           |
| `nginx/analytics.js`         | `/api/nginx/analytics`                        | Nginx-Analytics                         |
| `nginx/upload-relay.js`      | `/api/nginx/proxy-hosts/:hostId/upload-relay` | upload-relay                            |

### Meta

- [Glossar](./glossar.md)
- [Offene Fragen](./offene-fragen.md)
- [Wiki-Pflege](./wiki-pflege.md)
- **Beziehungsgraph (HTML, offline-fähig):** `wiki-graph.html` — wird mit `python3 scripts/wiki-graph.py` neu generiert

---

_Zuletzt aktualisiert: 2026-10-08._

## Verwandte Seiten

- [Projektüberblick](./projekt/ueberblick.md)
- [Architektur-Überblick](./architektur/ueberblick.md)
- [Module](./module/README.md)
- [API-Überblick](./api/ueberblick.md)
- [Wiki-Pflege](./wiki-pflege.md)

## Codeprüfung

- [Codeprüfung Oktober 2026](./entwicklung/code-audit-2026-10.md) — erneute Repository-Scans, Berechtigungs-/Laufzeitkorrekturen, Einzelpfad-Nachweise und Validierungsgrenzen in PR #149.
- [Codeprüfung September 2026](./entwicklung/code-audit-2026-09.md) — Änderungen, Validierung und Betriebsgrenzen einschließlich des sechsten vollständigen Durchgangs in PR #139.
