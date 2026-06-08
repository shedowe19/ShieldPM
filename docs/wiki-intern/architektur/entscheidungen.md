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

### E4: Nginx-Validierung aktuell deaktiviert

`nginx -t` wird in `backend/internal/nginx.js` aktuell **nicht** ausgeführt. Die `test()`-Methode ist ein No-op und gibt `true` zurück. Dadurch sind Template- und Laufzeitfehler schneller, aber riskanter: Fehlerhafte generierte Konfigurationen werden nicht vor dem Reload durch Nginx validiert.

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

1. `frontend` — Baut React-App (Debian Trixie)
2. `backend` — Installiert Node-Dependencies + Anubis + OAuth2-Proxy
3. `final` — Basiert auf `shieldpm-nginx:master`, kopiert Artefakte

### E11: Biome statt ESLint/Prettier

Code-Qualität wird durch Biome (`@biomejs/biome`) sichergestellt, nicht durch ESLint + Prettier.

### E12: NGINX-1.31.x Vorteile als Basis-/Startskript-Kombination

Root-Features wie `quic_host_key`, `proxy_cache_path`, HTTP/3/TLS-Logfelder und globale Maps liegen im externen `shieldpm-nginx`-Repository. ShieldPM aktiviert zustandsabhängige Teile beim Start über `rootfs/usr/local/bin/start.sh`, nachdem die persistenten `/data/nginx`-Dateien und Ordner existieren.

### E13: Proxy-Host-Upstreams als JSON-Feld statt eigener Relation

Mehrere Upstream-Ziele für Proxy-Hosts werden über `proxy_host.upstream_servers` als JSON-Array gespeichert. Die bestehenden Einzelziel-Felder `forward_scheme`, `forward_host` und `forward_port` bleiben Quelle der Wahrheit, solange das Array leer ist.

Begründung:

- Die bestehende Proxy-Host-API und UI können ohne zusätzliche CRUD-Routen erweitert werden.
- Bestehende Hosts bleiben ohne Datenmigration ihrer Zielwerte kompatibel.
- Nginx benötigt für die Generierung nur den Host-Datensatz; eine zusätzliche Relation würde die Config-Generierung und API-Expansion komplexer machen.

Einschränkung: Custom-Locations behalten ihre eigene Einzelziel-Konfiguration und nutzen den hostweiten Upstream-Pool aktuell nicht automatisch.

### E14: 0-RTT nur explizit pro Proxy-Host

TLS 1.3 0-RTT wird nicht global aktiviert. Das Feld `ssl_early_data` aktiviert `ssl_early_data on` nur für den jeweiligen Proxy-Host. Die Root-`nginx.conf` im separaten `shieldpm-nginx`-Repository definiert Maps, die replay-riskante Early-Data-Methoden mit HTTP `425` abweisen.

Begründung:

- 0-RTT kann Requests replaybar machen und ist daher sicherheitsrelevant.
- Der Nutzer muss das Risiko pro Host bewusst aktivieren.
- Safe Methods (`GET`, `HEAD`, `OPTIONS`) bleiben möglich, während schreibende Methoden in Early Data blockiert werden.

## Verwandte Seiten

- [Architektur-Überblick](./ueberblick.md)
- [Datenbank](../daten/datenbank.md)
- [Nginx Config Templates](../module/nginx-templates.md)
- [ADR-Übersicht](../entscheidungen/README.md)
