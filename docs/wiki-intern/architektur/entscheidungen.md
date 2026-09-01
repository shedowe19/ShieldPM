# Architektur-Entscheidungen

## Zweck

Dokumentation wichtiger technischer Entscheidungen, die aus dem Code und der Projektstruktur ablesbar sind.

## Entscheidungen

### E1: Express.js v5 statt v4

Express 5 wird verwendet (`5.2.1`). Dies bringt native `async/await`-Unterstützung in Route-Handlern und einen moderneren Router.

### E2: ESM statt CommonJS

Das gesamte Projekt ist `"type": "module"`. Kein `require()` erlaubt. Alle Imports verwenden `import/export`-Syntax.

**Ausnahme**: `backend/validate-env.cjs` ist eine CommonJS-Datei (wird vor dem ESM-Setup geladen).

### E3: SQLite als unterstützter Standard

SQLite ist ohne Zusatzkonfiguration der Standard, auch für kleine Installationen. Externe MySQL-/PostgreSQL-Backends
sind optional. Migrationen und CI müssen alle drei Dialekte abdecken.

**Gotcha**: Boolean-Felder in SQLite werden als `0`/`1` gespeichert. Das Objection.js-Modell konvertiert im `$afterGet()`.

### E4: Nginx-Validierung aktiviert

`nginx -t` wird gegen einen vollständig gestagten Kandidaten ausgeführt. DB-/Dateimutationen verwenden Compensation,
damit ein Render-, Test- oder Reload-Fehler den letzten gültigen Zustand wiederherstellt.

### E5: Kein Debouncing in der Nginx-Engine

Der Nginx-Reload wird **sofort** ausgelöst (keine Verzögerung). Debouncing mit 2s Verzögerung lebt in `docker.js`, nicht in der Nginx-Engine selbst.

### E6: Objection.js statt Raw SQL

Datenbankzugriffe erfolgen ausschließlich über Objection.js Query-Builder. Keine Raw-SQL-Queries im Service-Code.

### E7: `domain_names` ist abgeleitet

Das Feld `domain_names` auf Proxy-Hosts wird im `$afterGet()` aus der `host_domains`-Relation berechnet. Direktes Schreiben in die DB ist nicht möglich.

### E8: Daten-Vertrag: `/data/`

Alle dynamischen Daten müssen unter `/data/` liegen. Docker-Volumes erwarten diese Struktur. Zustandsinformationen dürfen nicht außerhalb gespeichert werden.

### E9: shadcn/ui + Radix als einzige UI-Bibliothek

Keine zusätzlichen UI-Component-Libraries. Frontend verwendet ausschließlich shadcn/ui (Radix UI) + Tailwind CSS.

### E10: Multi-Stage Docker Build

Der Dockerfile verwendet drei Stages:

1. `frontend` — Baut die React-App mit Debian Trixie, signiertem NodeSource-APT und Node 24 LTS
2. `backend` — Installiert immutable Yarn-4-Abhängigkeiten + verifizierte Laufzeit-Artefakte
3. `final` — Verlangt ein freigegebenes `shieldpm-nginx@sha256:<digest>` und kopiert die geprüften Artefakte

### E11: Biome statt ESLint/Prettier

Code-Qualität wird durch Biome (`@biomejs/biome`) sichergestellt, nicht durch ESLint + Prettier.

### E12: Sicherheitszustand ist serverseitig und crash-durable

Auth-Refresh/Impersonation, Initial-Setup, GitOps, Analytics und Terminal verwenden serverseitige Claims, Transaktionen,
One-Time-Werte oder Journale. Browser-/Providertext und erfolgreiche Vorprüfungen sind keine Autorisierung. Details und
Konsequenzen stehen im [Security-Modernisierungs-ADR](../entscheidungen/2026-08-31-security-modernisierung.md).

### E13: Fail-closed Updates und unveränderliche Supply Chain

SQLite-Updates erhalten vor jeder Mutation einen verifizierten Online-Snapshot und einen automatischen Restore-Pfad;
externe Datenbanken erfordern ein ausdrücklich bestätigtes, engine-natives Backup. Container-Bases, Runtime-Archive und
GitHub Actions sind an Digests, Prüfsummen beziehungsweise Commit-SHAs gebunden. Pull-Request-Code darf keine Images
oder Release-Artefakte publizieren.

## Verwandte Seiten

- [Architektur-Überblick](./ueberblick.md)
- [Datenbank](../daten/datenbank.md)
- [ADR-Übersicht](../entscheidungen/README.md)
