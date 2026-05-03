# ShieldPM — Internes LLM-Wiki

Willkommen im internen Entwickler-Wiki von **ShieldPM** (v4.3.2).

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
- [Entscheidungen](./architektur/entscheidungen.md)
- [Externe Abhängigkeiten](./architektur/externe-abhaengigkeiten.md)

### Entwicklung

- [Setup](./entwicklung/setup.md)
- [Lokale Entwicklung](./entwicklung/lokale-entwicklung.md)
- [Tests](./entwicklung/tests.md)
- [Build](./entwicklung/build.md)
- [Deployment](./entwicklung/deployment.md)

### Module (Backend)

- [Modulübersicht](./module/README.md)
- [Nginx-Engine](./module/nginx-engine.md)
- [Proxy-Host](./module/proxy-host.md)
- [Redirection-Host](./module/redirection-host.md)
- [Dead-Host (404)](./module/dead-host.md)
- [Stream (TCP/UDP)](./module/stream.md)
- [Host (gemeinsame Logik)](./module/host.md)
- [Zertifikate](./module/zertifikate.md)
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
- [Docker Auto-Discovery](./module/docker.md)
- [Analytics](./module/analytics.md)
- [Maintenance](./module/maintenance.md)
- [Dashboard-Notizen](./module/dashboard-notes.md)
- [Terminal (SSH)](./module/terminal.md)
- [Benutzer & Auth](./module/benutzer-auth.md)
- [2FA-Service](./module/2fa.md)
- [Anubis (PoW-Gate)](./module/anubis.md)

### Verwaltung

- [Übersicht](./verwaltung/README.md)
- [Einstellungen](./verwaltung/einstellungen.md)
- [Audit-Log](./verwaltung/audit-log.md)
- [System-Reports](./verwaltung/report.md)

### UI (Frontend)

- [Screens & Pages](./ui/screens.md)
- [Komponenten](./ui/komponenten.md)
- [Frontend-Internas (Hooks, Contexts, Modals)](./ui/frontend-internas.md)
- [Frontend API-Client](./ui/api-client.md)
- [Internationalisierung (i18n)](./ui/i18n.md)
- [Theme & Styling](./ui/theme.md)

### API

- [API-Überblick](./api/ueberblick.md)
- [Routen](./api/routen.md)
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

### Meta

- [Glossar](./glossar.md)
- [Offene Fragen](./offene-fragen.md)
- [Wiki-Pflege](./wiki-pflege.md)

---

_Zuletzt aktualisiert: 2026-05-03_
