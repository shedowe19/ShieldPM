# Tests

## Zweck

Dokumentation des Test-Setups und der Test-Strategien.

## Test-Framework

**Vitest** wird sowohl im Backend als auch im Frontend verwendet.

## Tests ausführen

```bash
# Backend
cd backend
yarn test

# Frontend
cd frontend
yarn test
```

## Frontend-Tests

- Testing Library: `@testing-library/react` + `@testing-library/dom`
- DOM-Environment: `happy-dom`
- Setup-Datei: `frontend/vitest-setup.js`

### Vorhandene Tests

- `frontend/src/components/SiteFooter.test.tsx` — SiteFooter-Komponente
- `frontend/src/locale/Utils.test.tsx` — Locale-Utilities
- `frontend/src/components/Analytics/AnalyticsChart.test.ts` — normalisiert Tooltip-Labels ausschließlich als numerische Unix-Sekunden und verwirft andere React-Labelwerte, damit Dependency-Updates mit strengeren Chart-Typen den Produktionsbuild nicht brechen.

### Mocking-Hygiene

- Modul-Mocks in Frontend-Tests stehen auf Top-Level; verschachtelte `vi.mock()`-Aufrufe werden von Vitest zwar
  hochgezogen, erzeugen aber Warnungen und werden künftig Fehler.
- Tests mit unterschiedlichen Mock-Daten verwenden ein mit `vi.hoisted()` angelegtes veränderbares Mock-Objekt und
  setzen dessen Ausgangszustand in `beforeEach`. Das vermeidet `vi.doMock()`, `vi.resetModules()` und dynamische
  Re-Imports innerhalb einzelner Tests.
- Regressionstests für entfernte statische Abhängigkeiten lesen bei großen Seiten die Quelldatei statt sie parallel
  dynamisch zu importieren. Der Produktions-Build prüft die Typen und Modulauflösung; der gezielte Quelltest verhindert
  zugleich, dass der entfernte Import wieder eingeführt wird, ohne an Vitests Fünf-Sekunden-Import-Timeout zu geraten.

### Browsernahe E2E-Smokes

- Playwright-Konfiguration: `frontend/playwright.config.ts`; der Testserver läuft ausschließlich auf `127.0.0.1:4173`,
  wird nie wiederverwendet, baut das Frontend vor jedem Lauf und startet danach `vite preview`; Service Worker sind gesperrt
  und `en-US` wird für stabile Assertions erzwungen.
- Einmalig vor dem ersten Lauf den verwalteten Chromium-Browser installieren: `yarn exec playwright install chromium`.
- Ausführen: `CI=1 yarn test:e2e:ci` im Verzeichnis `frontend/`. Die Konfiguration startet die lokale Produktionsvorschau
  selbst; sie verwendet keine Produktions-Backends oder externe Ziele.
- `frontend/e2e/app-smoke.spec.ts` erlaubt nur HTTP-Requests an den lokalen Testserver, fängt jeden `/api/`-Request ab und
  bricht bei nicht explizit hinterlegten Endpunkten ab; WebSocket-Verbindungen werden unmittelbar geschlossen. Die
  zustandsbehafteten Fixture-Daten sind synthetisch (`*.e2e.test`) und sichern Anmeldung mit Fokus, den Not-Found-Fallback,
  Skip-Link und Hauptinhalt-Fokus, den Top-Proxy-Host-Link zum 24-Stunden-Analytics-Zeitraum, den Dashboard-Notiz-
  Speichervertrag sowie einen Axe-Scan ohne Farbkontrastregel ab.
- Die bei einem Playwright-Lauf erzeugten Artefakte unter `frontend/test-results/` sind lokal und werden nicht versioniert;
  damit bleibt der Worktree auch nach einem fehlgeschlagenen Browser-Smoke frei von Testausgaben.

## Backend-Tests

- Pfad: `backend/test/`
- Enthalten Unit-Tests für `backend/lib/` (z.B. helpers, user-id-from-me) und `backend/internal/` (z.B. 2fa-service, ai, auth-session-service, certificate, ddns, tokens-2fa).
- Führen Tests über Vitest aus.
- Quelltextbasierte Regressionstests verwenden `backend/test/helpers/source-path.js`. Der Helper leitet das Backend-Verzeichnis über `import.meta.url` und `fileURLToPath()` ab, damit Tests in beliebigen Worktrees ohne fest verdrahtete lokale Pfade laufen.
- Tests, die ausschließlich GitOps-Patch-Payloads prüfen, stubben `internalGitOps.initRepo()` gezielt. Dadurch bleibt die Patch-Logik real getestet, ohne dass die CI-Schreibrechte für den Produktionspfad `/data/gitops` benötigt werden.
- `backend/test/ci/js-yaml-esm-compatibility.spec.js` sichert, dass die Anubis- und GitOps-Module unter Node 26 ausschließlich die benannten ESM-Exporte von `js-yaml` verwenden; `dump()` und `load()` werden dabei gegen den tatsächlich exportierten Namespace geprüft.
- `backend/test/ci/node-26-package-default-imports.spec.js` inventarisiert alle statischen Default-Binding-Formen in produktiven Backend-Imports externer Pakete. Für jeden tatsächlichen Consumer löst ein Node-26-ESM-Subprozess den Paketpfad mit dessen Modul-URL als Parent auf und prüft den resultierenden Export-Namespace; Node-Built-ins und relative Module sind bewusst ausgenommen. Der dafür verwendete Parser `es-module-lexer` ist explizit als Backend-Dev-Dependency deklariert, damit der Test nicht implizit von Vitests transitive Abhängigkeit abhängt. Ein Paket ohne passenden `default`-Export blockiert die CI vor dem Containerstart.
- `backend/test/ci/archiver-esm-compatibility.spec.js` sichert für `archiver` 8 die benannte `ZipArchive`-API in der Zertifikats-Downloadlogik und erzeugt dafür einen echten temporären ZIP-Export.
- CI-Regressionstests unter `backend/test/ci/` prüfen Runtime-, Installations-, Workflow- und Paketverträge einschließlich Node 26, eingefrorener Yarn-Installationen, Update-Recovery, Notice-Generierung und Versionsdokumentation. Der Dependency-Updater aktualisiert die Manifeste auf aktuelle Paketversionen, prüft Tests und Build und synchronisiert anschließend die verifizierten Tool-Versionen. Gezielte transitive Sicherheitsauflösungen bleiben im Lockfile erhalten. <!-- verified-vite-baseline:start -->Vite und Vitest verwenden gemeinsam Vite 8.2.2/Rolldown 1.2.6.<!-- verified-vite-baseline:end --> Ergebnisse der aktuellen Sicherheitsprüfung stehen unter [Externe Abhängigkeiten](../architektur/externe-abhaengigkeiten.md).
- `backend/test/migrations/full-schema.spec.js` baut die komplette Migrationskette in einer Transaktion auf SQLite und PostgreSQL auf. `@electric-sql/pglite` ist hierfür eine explizite Dev-Dependency: Der Adapter verwendet Knexs PostgreSQL-Dialekt und die tatsächliche eingebettete PostgreSQL-Engine. SQL-Abfragen, Bindings, Fehler und Transaktionsabbrüche werden wirklich ausgeführt; externe Nginx-Prozessaktionen sind gemockt. Netzwerkprotokoll, Serverbetrieb und Mehrverbindungsrennen werden damit nicht geprüft.
- `backend/test/migrations/data-preservation.spec.js` prüft geänderte Domain- und mTLS-Werte bei Rollback sowie vollständig abgewartete Schemaänderungen in beiden Engines. `backend/test/lib/password-reset.spec.js` und `test/internal/audit-log-sqlite-dates.spec.js` testen atomaren Notfall-Reset und UTC-Grenzen gegen echte SQLite-Dateien beziehungsweise Tabellen.

- `frontend/src/pages/Analytics/AnalyticsMapContent.test.tsx` rendert die lokal aus `world-atlas` gebündelte Länder-Topologie mit einem echten DE-Marker und prüft die SVG-Viewport-Transformationen für pointerzentriertes Scroll-Zoom sowie Ziehen. Damit bleibt die Analytics-Karte unabhängig von `react-simple-maps` und einem Laufzeit-CDN-Abruf.
- `test/internal/proxy-host-pagination.spec.js` sichert für 1.000 synthetische Hosts die Seitengröße, Zählmetadaten sowie die Owner- und Such-Einschränkung vor dem Paging. `proxy-hosts-route-pagination.spec.js` deckt den optionalen API-Vertrag und die Legacy-Arrayantwort ab; `ProxyHosts/TableWrapper.test.tsx` sichert die 100er-Seite, Seitennavigation und die Rückkehr von einer nach Löschen leeren Seite.

## Code-Qualität

Biome wird für Linting und Formatting eingesetzt:

```bash
npx biome check .           # Prüfen
npx biome check --write .   # Auto-Fix
```

## Abschlussprüfung nach dem zweiten Durchgang

Prüflauf mit Node.js 26.8.1 und den versionierten Yarn-Lockfiles:

- Frontend: 172 Testdateien mit 485 bestandenen Tests; TypeScript-Prüfung und Vite-Produktionsbuild bestanden.
- Backend: 115 Testdateien mit 793 bestandenen Tests; Details und Grenzen im [Prüfbericht](./code-audit-2026-09.md).
- Infrastruktur: 24 Python-Regressionstests für Migration, AIO, Update und Betriebsdateien sowie ShellCheck und Shell-Syntaxprüfung bestanden.
- Beide Codebereiche werden vollständig mit Biome geprüft. Die bisherigen Schema-/Deprecated-Hinweise der Biome-Konfigurationsdateien sind Informationsmeldungen.
- Paketprüfung: Backend und Frontend jeweils ohne gemeldete `yarn audit`-Befunde nach gezielter Remediation.

Ausführen: `cd backend && yarn test --run`; `cd frontend && yarn test --run && yarn build`; `python3 -m unittest discover -s scripts/tests -v` im Repository-Root. Für automatische Einmalläufe ist `--run` erforderlich, weil `yarn test` sonst im Beobachtungsmodus starten kann.

Die neuen Tests decken unter anderem Berechtigungen, einmalige 2FA-Challenges, Refresh-Replay, geschützte Terminal-Upgrades, echte SQLite-Transaktionen mit Fremdschlüsseln, mehrseitigen Import, Symlink-Schutz, Konfigurationsfehler, Prozessrennen und Datums-/Formularverträge ab. Externe Dienste werden gemockt; die Prüfgrenzen stehen im Bericht.

## Regressionen des dritten Durchgangs

Gesamtstand: **903 Backend-Tests in 133 Dateien, 536 Frontend-Tests in 176 Dateien und 37 Infrastrukturtests**, zusammen 1.476 bestandene Tests. Locale-Check, TypeScript, Vite und vollständiges Biome-Linting sind ebenfalls erfolgreich. Lokale Gesamtsuiten verwenden `--maxWorkers=2`.

Zusätzliche Prüfungen sichern TOTP-Einmalverwendung, vollständigen Logout-Widerruf und verspätete Refresh-Antworten über HTTP. SQLite/PGlite testen Passwortmigrationen und Terminal-Up/Down/Up mit langen Schlüsseln. Weitere Tests prüfen Owner-Zuordnungen, Nginx-Backups, echte Lua-Zähler, serialisierte WireGuard-Änderungen, DDNS-/Docker-/Terminal-Lebenszyklen, API-Antwortschemas und wartenden Startup-Abschluss.

Die Frontend-Tests verwenden echte QueryClients für die sieben optimistischen CRUD-Hooks und prüfen verspätete Antworten mit dem tatsächlichen AuthStore. Formular-, Berechtigungs-, Fokus-, Karten- und Clipboard-Regressionen ergänzen den Bereich. `check-locales.test.ts` ersetzt vorübergehend das FormatJS-Binary; der reale Locale-Check läuft daher erst nach Vitest.

Die Infrastrukturtests verwenden temporäre Dateien und echte SQLite-WAL-Snapshots. Sie simulieren Kopier-/Bereinigungsfehler und prüfen reversible Nginx-Optionen, Certbot-Link-Recovery, eigene Socketnamen und LXC-SSH-Hostschlüssel. Diese isolierten Prüfungen starten keine produktive Installation.

## Regressionen des vierten Durchgangs

Mit Node.js 26.8.1 bestehen **970 Backend-Tests in 144 Dateien und 544 Frontend-Tests in 177 Dateien**. Von 56 Python-Infrastrukturtests bestehen lokal 55; nur der echte Unix-Socket-Test wird wegen einer lokalen `EPERM`-Beschränkung übersprungen. In GitHub CI darf dieser Test nicht übersprungen werden. Locale-Check, TypeScript, Vite-Produktionsbuild, OpenAPI und vollständige Biome-Prüfungen sind erfolgreich.

Die neuen Regressionen prüfen atomare Schlüsselveröffentlichung und Duo-Ersetzung, Impersonation bei verspätetem Refresh und Provider-Remount, tatsächliche Nginx-Headervererbung, partielle Einstellungen, atomare IP-Listen, GitOps-Zielbindung, WireGuard-Schlüsseldateien, serialisierte Tor-Lebenszyklen und veröffentlichte API-Verträge. Der gemeinsame Template-Fingerabdruck wird zwischen Backend und echter Shell verglichen, einschließlich Aufruf über einen Symlink. Certbot-Tests prüfen die Erkennung von Plugins aus dem veränderlichen Zielverzeichnis.

Die Infrastrukturtests sichern Installation, Providerwechsel, Prozessneustart, eng begrenzte Besitzänderungen, migrierte Default-Konfigurationen und eigene Runtime-Verzeichnisse ab. Zusätzlich startet `scripts/ci/docker-smoke.sh` in beiden nativen Docker-PR-Jobs das frisch gebaute Image als root und als UID 1000. Es prüft tatsächliche Betriebsbereitschaft, Socketrechte, Nginx-Konfiguration und Reload sowie Schreibrechte und entfernt alle Testressourcen. Der Test läuft ohne externes Netzwerk und benötigt keine echten Anbieterzugangsdaten.

## Regressionen des fünften Durchgangs

Mit Node.js 26.8.1 bestehen **998 Backend-Tests in 152 Dateien und 567 Frontend-Tests in 179 Dateien**. Die Python-Suite umfasst **58 Tests**, davon lokal 57 bestanden und ein erwarteter Unix-Socket-Skip; in GitHub CI bleibt dieser Test verpflichtend. Gesamtsuiten laufen lokal mit zwei Workern. Die Frontend-Wiederholung ohne parallele Backend-Last besteht nach einem anfänglichen Import-Timeout mit unverändertem Zeitlimit. Locale-Check und Build werden nach Vitest ausgeführt.

Neue Tests prüfen echte Passkey-Signaturen mit konkurrierendem Zählerupdate, Graph-Rollbacks bei SQLite-Triggerfehlern, den tatsächlich ausgeführten CLI-Symlink, lange OpenSSL-SANs und Certbot-Sperren vor Hoständerungen. Verzögerte Cloudflared-, DDNS-, ChatOps- und Frontend-Antworten sichern die Reihenfolge und verhindern die Wiederherstellung veralteter Zustände. Router, AuthProvider, QueryClient und API-Client werden gemeinsam für OIDC-Übernahme, erforderlichen CSRF-Header und normalen Passwortlogin geprüft. Echte HTTP-Tests prüfen Callback-Cookiepfade und veröffentlichte Auth-Antwortschemas.

Der Docker-Smoke rendert beide tatsächlichen gRPC-Vorlagen und prüft mit einem lokalen HTTP/2-Echo Methode, Pfad, Query und Body unter root und UID 1000. Die Python-Regression des Wiki-Generators erzeugt Seiten mit Vorlagenmarkern in ihren Namen und prüft unveränderte Knoten-/Kantenidentitäten. Ausführliche Abdeckung und Grenzen stehen im [Prüfbericht](./code-audit-2026-09.md).

## Verwandte Seiten

- [Setup](./setup.md)
- [Build](./build.md)
