# Architektur-Entscheidungen

## Zweck

Dokumentation wichtiger technischer Entscheidungen, die aus dem Code und der Projektstruktur ablesbar sind.

## Entscheidungen

### E1: Express.js v5 statt v4

Express 5 wird verwendet (`5.2.1`). Dies bringt native `async/await`-Unterstützung in Route-Handlern und einen moderneren Router.

### E2: ESM statt CommonJS

Backend und Frontend verwenden ESM. Backend-Module verwenden `import/export`-Syntax.

**Ausnahme**: `backend/validate-env.cjs` ist eine CommonJS-Datei (wird vor dem ESM-Setup geladen).

### E3: SQLite als Entwicklungsdatenbank

SQLite (`better-sqlite3`) ist die Standard-Datenbank auch für einfache produktive Installationen. MySQL/MariaDB und PostgreSQL sind ebenfalls unterstützt. Die Migrationskette wird für alle drei Engines getestet.

**Gotcha**: Boolean-Felder in SQLite werden als `0`/`1` gespeichert. Die betreffenden Objection.js-Modelle konvertieren sie in `$parseDatabaseJson()` und `$formatDatabaseJson()`.

### E4: Nginx-Validierung aktiviert

`nginx -tq` wird vor dem Reload ausgeführt. Bei einem ungültigen Host wird die vorherige Datei wiederhergestellt und der Fehler im Hoststatus festgehalten. Die Konfigurationsvorschau ist nur ein Rendern und ersetzt die Prüfung beim Speichern nicht.

### E5: Kein Debouncing in der Nginx-Engine

Der reguläre Nginx-Reload wird ohne globale Verzögerung ausgelöst. Das Docker-Auto-Discovery-Modul sammelt seine eigenen Hoständerungen kurzzeitig und führt dann eine gemeinsame Konfiguration und einen validierten Reload aus. Die Nginx-Engine selbst serialisiert Konfigurationsänderungen.

### E6: Objection.js und gezielte direkte SQL-Abfragen

Modelle verwenden Objection.js und Knex. Einzelne Funktionen benötigen direkte Knex-/SQL-Abfragen, etwa Datenbankstatistiken, Aggregationen und den SQLite-Import. Diese Abfragen sind auf die jeweilige Datenbank-Engine abgestimmt.

### E7: `domain_names` ist abgeleitet

Das Feld `domain_names` auf Proxy-Hosts wird im `$afterFind()` aus der `host_domains`-Relation berechnet. Direktes Schreiben in die DB ist nicht möglich.

### E8: Daten-Vertrag: `/data/`

Persistente Anwendungsdaten liegen unter `/data/` und müssen bei Docker-Installationen entsprechend gemountet werden. Temporäre Laufzeitdateien und Systemkonfiguration können außerhalb liegen.

### E9: shadcn/ui + Radix als einzige UI-Bibliothek

Die primären UI-Komponenten verwenden shadcn/ui, Radix UI und Tailwind CSS; spezialisierte Bibliotheken wie TanStack Table, Recharts und Xterm werden für Tabellen, Charts und Terminal eingesetzt.

### E10: Multi-Stage Docker Build

Der Dockerfile verwendet drei Stages:

1. `frontend` — Baut die React-App mit Debian Trixie, dem eingecheckten NodeSource-APT-Setup und Node 26
2. `backend` — Installiert Node‑26-Dependencies + Anubis + OAuth2-Proxy
3. `final` — Basiert auf `shieldpm-nginx:master`, kopiert Artefakte

### E11: Biome statt ESLint/Prettier

JS/TS-Code wird mit Biome (`@biomejs/biome`) geprüft. Die Markdown-Dateien des internen Wiki werden mit Prettier formatiert.

## Verwandte Seiten

- [Architektur-Überblick](./ueberblick.md)
- [Datenbank](../daten/datenbank.md)
- [ADR-Übersicht](../entscheidungen/README.md)
