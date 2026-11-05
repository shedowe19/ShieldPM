# ShieldPM — LLM-Wiki Index

ShieldPM ist ein sicherheitsfokussierter Nginx-Reverse-Proxy-Manager mit Web-UI:
Proxy-Hosts, TLS, WAF/IPS, Tunnels und DDNS. Version `4.4.1`, proprietär, zwei
Repositories (`ShieldPM` für die Anwendung, `shieldpm-nginx` für den Nginx-Build).

Dieses Wiki ist der Einstieg für Agenten und Menschen. Es fasst zusammen und
verlinkt die Tiefendoku unter `llm-wiki/wiki/reference/`; es kopiert sie nicht.

Kuratierte Seiten (`wiki/…`) sind Synthesen; Modul- und Bereichsdetails werden
zuerst in `wiki/reference/` geändert und hier nur zusammengefasst.

## Hier starten

1. [Überblick](./overview.md) — was das Projekt ist, Stack, Start, Status
2. [Aktueller Projektzustand](./current-project-state.md) — was gerade gilt
3. [Aufgaben](./tasks.md) — was als Nächstes zu tun ist
4. [Log](./log.md) — was zuletzt passiert ist
5. [Architektur](./architecture/overview.md) — Schichten und Grenzen
6. [Lokal starten](./overview.md#starten-testen-bauen) — Node 26, Yarn 1.22.22, Datenbankwahl
7. [Entwicklung (Tiefe)](./reference/entwicklung/lokale-entwicklung.md) — Setup, Debugging, Testbefehle
8. [Glossar](./glossary.md) — Begriffe des Wikis und des Projekts

## Ich will …

| Vorhaben                         | Seite                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Das Projekt lokal starten        | [Überblick](./overview.md#starten-testen-bauen), [lokale Entwicklung](./reference/entwicklung/lokale-entwicklung.md) |
| Verstehen, wie ein Request läuft | [Request-Lebenszyklus](./architecture/request-lifecycle.md)                                                          |
| Einen Endpunkt hinzufügen        | [Backend](./backend/overview.md), [API-Schemas](./api/schemas.md)                                                    |
| Eine Migration schreiben         | [Datenbank und Migrationen](./data/migrations.md)                                                                    |
| Einen Host-Typ ändern            | [Host-Lebenszyklus](./architecture/host-lifecycle.md), [Nginx-Engine](./architecture/nginx-engine.md)                |
| Etwas deployen oder updaten      | [Laufzeit](./infrastructure/runtime.md), [Build und Release](./infrastructure/build-and-release.md)                  |
| Einen Widerspruch prüfen         | [Widersprüche](./contradictions/README.md)                                                                           |

## Bereiche

### Architektur

- [Überblick](./architecture/overview.md) — Schichten, Verzeichnisse, Grenzen
- [Request-Lebenszyklus](./architecture/request-lifecycle.md) — Middleware-Reihenfolge und CSRF
- [Nginx-Engine](./architecture/nginx-engine.md) — Rendern, Prüfen, Reload, Rollback
- [Host-Lebenszyklus](./architecture/host-lifecycle.md) — vier Hosttypen und ihre Invarianten
- [Hintergrundjobs](./architecture/background-jobs.md) — Timer und Startreihenfolge

### Backend und Frontend

- [Backend](./backend/overview.md) — Dienste, Berechtigungen, Fehler, Datenzugriff
- [Frontend](./frontend/overview.md) — Routing, React Query, i18n, Styling

### API

- [Überblick](./api/overview.md) — Konventionen, Auth, Fehlerformat
- [Endpunkte](./api/endpoints.md) — Route-Datei zu API-Pfad
- [Schemas](./api/schemas.md) — Validierung und OpenAPI

### Daten

- [Datenmodell](./data/overview.md) — Modellgruppen und Schreibregeln
- [Datenbank und Migrationen](./data/migrations.md) — Engines und Migrationskette

### Infrastruktur

- [Laufzeit und Start](./infrastructure/runtime.md) — Startkette, Ports, `/data`
- [Build und Release](./infrastructure/build-and-release.md) — Dockerfile, CI, Versionierung
- [Konfiguration](./infrastructure/configuration.md) — Variablengruppen und Dateien

### Sicherheit und Tests

- [Sicherheit](./security/overview.md) — Anwendungsschutz und Nginx-Schutz
- [Tests](./testing/overview.md) — Testarten, Befehle, Regeln

### Module

- [Übersicht](./modules/overview.md) — Landkarte aller Backend-Module mit Tiefenlinks
- [Abdeckung und Inventar](./coverage.md) — was gelesen, stichprobenartig geprüft oder übersprungen wurde

### Entscheidungen

- [Entscheidungen](./decisions/README.md) — ADR-Index
- [ADR-Vorlage](./decisions/adr-template.md) — Gerüst für neue Entscheidungen
- [2026-11-04 Wiki-Struktur](./decisions/2026-11-04-wiki-struktur.md) — warum es drei Doku-Ebenen gibt
- [2026-10-27 Entfernung der Wasm-Laufzeit](./decisions/2026-10-27-entfernung-der-wasm-laufzeit.md) — Ausbau und Migration

### Tiefendoku (migriert)

- [Tiefendoku-Index](./reference/index.md) — die frühere `docs/wiki-intern`, jetzt unter `llm-wiki/wiki/reference/`; alle Modul-, Architektur-, API-, Daten- und Entwicklungsseiten
- [Tiefendoku: Wiki-Pflege](./reference/wiki-pflege.md) — Regeln für die Referenzebene

## Analysen

- [Analysen](./analyses/README.md) - Ablage für wiederverwendbare Antworten.
- [Datei-Audit 2026-11-05](./analyses/2026-11-05-datei-audit.md) - alle 2.066 Dateien mit 173 Agents geprüft; 22 Fehler behoben.
- [Warnungs-Triage 2026-11-05](./analyses/2026-11-05-warnungs-triage.md) - 350 Warnungen sortiert, Folgeaufgaben T-020 bis T-027.

## Widersprüche

- [Übersicht](./contradictions/README.md) — offene und behobene Konflikte
- [SQLite in Produktion](./contradictions/2026-11-04-sqlite-in-produktion.md) — `AGENTS.md` gegen Code
- [Nginx-Reload: Debounce gegen Sperre](./contradictions/2026-11-04-nginx-reload-debounce.md) — `.cursorrules` gegen Engine

## Quellen

- [Raw-Quellen](../raw/README.md) — unveränderliche Belege, derzeit die
  ersetzte `agent.md`-Fassung.
- [Tiefendoku](./reference/index.md) — migrierte, weiterhin gepflegte
  Entwicklerdokumentation. Sie ist **keine** unveränderliche Quelle; bei Konflikt
  entscheidet der Code.

## Zuletzt geändert

Siehe [Log](./log.md) und [Changelog](./changelog.md).

## Offene Fragen

Alle Punkte mit Prüfstelle führt die [Sammelseite](./questions/open-questions.md).

- Swagger-Lücken — Aufgabe `T-004`
- OpenAppSec-Policy im Installer — Aufgabe `T-005`
- Unterstützung von `DATA_PATH` — Policy-Frage, Prüfstelle in der Sammelseite

## Leitplanken

- Code ist die Quelle der Wahrheit; dieses Wiki erklärt ihn.
- Keine Secrets, nur Pfade und Variablennamen.
- Nur relative Markdown-Links.
- Persistente Daten gehören unter `/data/`.
- Nginx-Kompilierung und Root-`nginx.conf` gehören zu `shieldpm-nginx`.
- Reloads nur über `internalNginx.reload()` auslösen; die Engine selbst ruft
  `nginx -s reload` auf.

## Verwandte Seiten

- [Überblick](./overview.md)
- [Aktueller Projektzustand](./current-project-state.md)
- [Wiki-Schema](../README.md)
- [Projekt-Wiki (Tiefe)](reference/index.md)
