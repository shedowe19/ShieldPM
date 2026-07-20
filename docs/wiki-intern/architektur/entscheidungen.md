# Architektur-Entscheidungen

## Zweck

Dokumentation wichtiger technischer Entscheidungen, die aus dem Code und der Projektstruktur ablesbar sind.

## Entscheidungen

### E1: Express.js v5 statt v4

Express 5 wird verwendet (`5.2.1`). Dies bringt native `async/await`-Unterstützung in Route-Handlern und einen moderneren Router.

### E2: ESM statt CommonJS

Das gesamte Projekt ist `"type": "module"`. Kein `require()` erlaubt. Alle Imports verwenden `import/export`-Syntax.

**Ausnahme**: `backend/validate-env.cjs` ist eine CommonJS-Datei (wird vor dem ESM-Setup geladen).

### E3: SQLite als Entwicklungsdatenbank

Entwicklung verwendet SQLite (`better-sqlite3`). Produktion unterstützt MySQL und PostgreSQL. Die Migrations sind so geschrieben, dass sie auf allen drei Engines funktionieren.

**Gotcha**: Boolean-Felder in SQLite werden als `0`/`1` gespeichert. Das Objection.js-Modell konvertiert im `$afterGet()`.

### E4: Nginx-Validierung aktiviert

`nginx -t` wird vor dem Reload **aktiv** ausgeführt (via `test()`-Methode = `nginx -tq`). Das schützt vor trivialen Config-Fehlern. Template-Fehler können Nginx dennoch brechen.

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

1. `frontend` — Baut React-App mit dem gepinnten offiziellen Node-22-Builder
2. `backend` — Installiert Node-22-Dependencies + Anubis + OAuth2-Proxy
3. `final` — Basiert auf `shieldpm-nginx:master`, kopiert Artefakte

### E11: Biome statt ESLint/Prettier

Code-Qualität wird durch Biome (`@biomejs/biome`) sichergestellt, nicht durch ESLint + Prettier.

## Verwandte Seiten

- [Architektur-Überblick](./ueberblick.md)
- [Datenbank](../daten/datenbank.md)
- [ADR-Übersicht](../entscheidungen/README.md)
