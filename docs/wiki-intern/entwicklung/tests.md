# Tests

## Zweck

Dokumentation des Test-Setups und der Test-Strategien.

## Test-Framework

**Vitest** wird sowohl im Backend als auch im Frontend verwendet.

## Tests ausführen

```bash
# Backend
(cd backend && yarn test --run)

# Frontend
(cd frontend && yarn test --run)
```

## Frontend-Tests

- Testing Library: `@testing-library/react` + `@testing-library/dom`
- DOM-Environment: `happy-dom`
- Setup-Datei: `frontend/vitest-setup.js`

### Vorhandene Tests

- `frontend/src/components/SiteFooter.test.tsx` — SiteFooter-Komponente
- `frontend/src/locale/Utils.test.tsx` — Locale-Utilities
- `frontend/src/components/Analytics/AnalyticsChart.test.ts` — normalisiert Tooltip-Labels ausschließlich als numerische Unix-Sekunden und verwirft andere React-Labelwerte, damit Dependency-Updates mit strengeren Chart-Typen den Produktionsbuild nicht brechen.
- `frontend/src/modals/DeleteConfirmModal.test.tsx` — wartet auf alle Cache-Invalidierungen, behandelt Lösch- und
  Aktualisierungsfehler getrennt und verhindert eine erneute Löschung nach bereits erfolgreicher Bestätigung.
- `frontend/src/pages/Profile/Security.test.tsx` — prüft neben den 2FA-Lebensdauergrenzen auch verzögerte und
  fehlgeschlagene Status-Invalidierungen sowie den Erhalt bereits ausgegebener Wiederherstellungscodes.

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
- Analytics-Response-Fixtures setzen ihre Zeitzone ausdrücklich auf UTC und stellen die Umgebung danach wieder her;
  Workflow-Vergleichstests verwenden vollständige temporäre Git-Repositories mit lokalem Bare-Origin, einschließlich
  divergierter Zweige und eines gleichnamigen Tags beim Branch-Fetch.
- `backend/test/internal/ai-error-contracts.spec.js` prüft öffentliche Konfigurationsfehler, private Providerdiagnosen,
  erhaltene Fehlerursachen und die Autorisierungsgrenze vor einem Provider-Aufruf. Die AI-Tool-Regressionen prüfen
  zusätzlich, dass interne und unbekannte Fehler nur als `Internal Error` an das Modell gelangen.
- Die DDNS-, Docker-, Tor-, WireGuard- und Upload-Relay-Suites prüfen ihre strukturierten Fehlerverträge. DDNS darf
  keine beliebigen Providerantworten oder Zugangsdaten aus Transportfehlern in `last_error` übernehmen; WireGuard
  darf keine Schlüssel oder Unterprozessdiagnosen öffentlich ausgeben.
- `backend/test/routes/wireguard-error-contracts.spec.js` prüft anhand der erfassten Route-Handler, dass die fünf
  Status-, Einstellungs-, Konfigurations- und QR-Code-Fehlerpfade öffentliche, private und unbekannte Fehler
  unverändert an die zentrale Fehlerbehandlung weiterreichen. Die HTTP-Formatierung durch die echte Middleware
  ist nicht Teil dieses isolierten Router-Tests.
- Quelltextbasierte Regressionstests verwenden `backend/test/helpers/source-path.js`. Der Helper leitet das Backend-Verzeichnis über `import.meta.url` und `fileURLToPath()` ab, damit Tests in beliebigen Worktrees ohne fest verdrahtete lokale Pfade laufen.
- Tests, die ausschließlich GitOps-Patch-Payloads prüfen, stubben `internalGitOps.initRepo()` gezielt. Dadurch bleibt die Patch-Logik real getestet, ohne dass die CI-Schreibrechte für den Produktionspfad `/data/gitops` benötigt werden.
- `backend/test/ci/js-yaml-esm-compatibility.spec.js` sichert, dass die Anubis- und GitOps-Module unter Node 26 ausschließlich die benannten ESM-Exporte von `js-yaml` verwenden; `dump()` und `load()` werden dabei gegen den tatsächlich exportierten Namespace geprüft. Eine echte YAML-Datei wird zusätzlich über `@apidevtools/swagger-parser` eingelesen, um dessen transitive Parser-Kette zu prüfen. Der frühere scoped Pin auf `js-yaml` 4.3.2 entfällt, weil `@apidevtools/json-schema-ref-parser` 16 bereits `js-yaml` mit `^5.4.2` verlangt. `npm-package-constraints.spec.js` verhindert die Wiedereinführung dieses inkompatiblen Pins; die Sicherheitsuntergrenzen der tatsächlich aufgelösten Pakete prüft weiterhin `dependabot-security-resolutions.spec.js`.
- `backend/test/ci/npm-package-constraints.spec.js` prüft die vollständige Liste der gezielten Sicherheitsauflösungen in beiden Manifesten. Neue Pins müssen zusammen mit dieser Erwartung aktualisiert werden; `dependabot-security-resolutions.spec.js` prüft unabhängig die Lockfile-Untergrenzen. Die in PR #150 ergänzten Auflösungen für `proxy-addr`, `source-map-js` und `seroval` bleiben auf ihre jeweiligen Consumer-Pfade begrenzt.
- `backend/test/lib/ftp-pac-security.spec.js` verwendet echte lokale FTP-Kontroll-/Datenverbindungen aus `backend/test/helpers/local-ftp.js`. Die Suite prüft den Wrapper `backend/lib/proxy-agent.js` bis zur geladenen FTP-PAC-Datei, dekodierte Zugangsdaten und Pfade, den `MDTM`-Verzeichnis-Fallback, Cache-/Missing-File-Verhalten sowie den eigenen Stream-Lebenszyklus. Vorläufige und abschließende Transferablehnungen, vorzeitig zerstörte Streams und fremde passive Datenhosts müssen kontrolliert scheitern und ihre Verbindungen schließen. Begrenzte Node-Unterprozesse mit `--unhandled-rejections=strict` prüfen zusätzlich manipulierte Unix-/MLSD-Listings und PASV-Antworten; HTTP- und Data-PAC bleiben in realen lokalen Aufrufen geprüft. Die Manifest- und Lockfile-Tests sichern dazu `basic-ftp` 6.2.2 sowie die auf `get-uri` begrenzte Resolution ab. Kontext: [FTP-Korrektur](../architektur/externe-abhaengigkeiten.md#ftp-korrektur-in-pr-150).
- `backend/test/ci/node-26-package-default-imports.spec.js` inventarisiert alle statischen Default-Binding-Formen in produktiven Backend-Imports externer Pakete. Für jeden tatsächlichen Consumer löst ein Node-26-ESM-Subprozess den Paketpfad mit dessen Modul-URL als Parent auf und prüft den resultierenden Export-Namespace; Node-Built-ins und relative Module sind bewusst ausgenommen. Der dafür verwendete Parser `es-module-lexer` ist explizit als Backend-Dev-Dependency deklariert, damit der Test nicht implizit von Vitests transitive Abhängigkeit abhängt. Ein Paket ohne passenden `default`-Export blockiert die CI vor dem Containerstart.
- `backend/test/ci/archiver-esm-compatibility.spec.js` sichert für `archiver` 8 die benannte `ZipArchive`-API in der Zertifikats-Downloadlogik und erzeugt dafür einen echten temporären ZIP-Export.
- CI-Regressionstests unter `backend/test/ci/` prüfen Runtime-, Installations-, Workflow- und Paketverträge einschließlich Node 26, eingefrorener Yarn-Installationen, Update-Recovery, Notice-Generierung und Versionsdokumentation. Der Dependency-Updater aktualisiert die Manifeste auf aktuelle Paketversionen, prüft Tests und Build und synchronisiert anschließend die verifizierten Tool-Versionen. Gezielte transitive Sicherheitsauflösungen bleiben im Lockfile erhalten. <!-- verified-vite-baseline:start -->Vite und Vitest verwenden gemeinsam Vite 8.3.3/Rolldown 1.2.13.<!-- verified-vite-baseline:end --> Ergebnisse der aktuellen Sicherheitsprüfung stehen unter [Externe Abhängigkeiten](../architektur/externe-abhaengigkeiten.md).
- `backend/test/migrations/full-schema.spec.js` baut die komplette Migrationskette in einer Transaktion auf SQLite und PostgreSQL auf. `@electric-sql/pglite` ist hierfür eine explizite Dev-Dependency: Der Adapter verwendet Knexs PostgreSQL-Dialekt und die tatsächliche eingebettete PostgreSQL-Engine. SQL-Abfragen, Bindings, Fehler und Transaktionsabbrüche werden wirklich ausgeführt; externe Nginx-Prozessaktionen sind gemockt. Netzwerkprotokoll, Serverbetrieb und Mehrverbindungsrennen werden damit nicht geprüft.
- `backend/test/migrations/data-preservation.spec.js` prüft geänderte Domain- und mTLS-Werte bei Rollback sowie vollständig abgewartete Schemaänderungen in beiden Engines. `backend/test/lib/password-reset.spec.js` und `test/internal/audit-log-sqlite-dates.spec.js` testen atomaren Notfall-Reset und UTC-Grenzen gegen echte SQLite-Dateien beziehungsweise Tabellen.
- `backend/test/migrations/mariadb-full-schema.spec.js` und `mariadb-interrupted-zstd-runner.spec.js` laufen nur mit `SHIELDPM_TEST_MARIADB=1`. Der CI-Job stellt dafür einen echten MariaDB-11.8.3-Service bereit und führt alle `mariadb-*.spec.js` aus. Der Full-Schema-Test erzeugt eine isolierte leere Datenbank, wendet **jede** Datei aus `backend/migrations/` über den produktiven `runMigrations()`-Runner an, vergleicht die vollständig registrierte Migrationsliste mit dem Verzeichnisinhalt, prüft zentrale Tabellen/Spalten und startet denselben Runner erneut ohne neue Migrationen. Damit historische Regenerierungs-Migrationen keinen CI-Runtime-DB-/Schlüsselpfad berühren, führt der Test eine temporäre Kopie derselben Migrationsdateien mit ausschließlich gestubbten Logger- und Nginx-Außeneffekten aus; Abhängigkeiten und der produktive Knex-Runner bleiben real. Der Recovery-Test bildet zusätzlich eine bereits vorhandene Zstd-Spalte ohne Migrationseintrag nach und prüft deren nachträgliche Knex-Registrierung.
- `backend/test/internal/analytics-ingestion-performance.spec.js` verarbeitet 1.000 synthetische Access-Log-Zeilen gegen den echten Parser und prüft die vollständig gefüllten Puffer sowie eine großzügige Laufzeitgrenze. Zusammen mit dem Frontend-Budget ist dies ein reproduzierbarer Frühindikator, kein Ersatz für Lasttests mit Produktionsverkehr.
- `backend/test/ci/frontend-bundle-budget.spec.js` prüft Erfolgs- und Fehlerpfad des Bundle-Skripts mit temporären Assets. Das Workflow-Contract-Testset stellt außerdem sicher, dass das Build-Gate und der MariaDB-Service nicht versehentlich aus der CI entfernt werden.

- `frontend/src/pages/Analytics/AnalyticsMapContent.test.tsx` rendert die lokal aus `world-atlas` gebündelte Länder-Topologie mit einem echten DE-Marker und prüft die SVG-Viewport-Transformationen für pointerzentriertes Scroll-Zoom sowie Ziehen. Damit bleibt die Analytics-Karte unabhängig von `react-simple-maps` und einem Laufzeit-CDN-Abruf.
- `test/internal/proxy-host-pagination.spec.js` sichert für 1.000 synthetische Hosts die Seitengröße, Zählmetadaten sowie die Owner- und Such-Einschränkung vor dem Paging. `proxy-hosts-route-pagination.spec.js` deckt den optionalen API-Vertrag und die Legacy-Arrayantwort ab; `ProxyHosts/TableWrapper.test.tsx` sichert die 100er-Seite, Seitennavigation und die Rückkehr von einer nach Löschen leeren Seite.

## Regressionen der Optimierungsprüfung vom 13. Oktober

- `backend/test/routes/service-credentials.spec.js` prüft tatsächliche HTTP-/JWT-/Capability-/SQLite-Pfade: redaktierte Listen, Einzelobjekte und Schreibantworten, Owner-Sichtbarkeit, verbotene Writes sowie Erhaltung aktueller Secrets bei konkurrierender Rotation.
- `nginx-bulk-validation.spec.js`, `maintenance-schedule.spec.js` und `migrations/maintenance-pending.spec.js` prüfen vollständigen Batchabschluss, Rollbackdateien und dauerhafte Wartungsaufträge einschließlich PostgreSQL, finalem Reloadfehler und gleichzeitiger neuer Planung.
- `proxy-host-monitor.spec.js` verwendet tatsächliche lokale HTTP-Upstreams für 100/120 fällige Hosts, frei werdende Workerplätze und Stopverhalten; die Grenze von fünf gleichzeitigen Probes bleibt geprüft.
- `analytics-domain-lifecycle.spec.js` prüft Domainwechsel, zusammengeführte Abfragen, das Promise-Abschlussrennen, Neustart und Timer-/Subscriptionabbau. Graphtransaktions- und GitOps-Batchtests sichern Benachrichtigungen nach Commit sowie einen Refresh für den vollständigen Import einschließlich Teilfehlern.
- Gemountete Firewall-, Cloudflare-, DDNS-/Access-List-, Tunnel-Race- und Proxy-Host-Suchtests prüfen frische Öffnungssnapshots, Secret-Erhaltung, verspätete Mutationsantworten, Suchverzögerung und tatsächlichen Fetch-Abbruch.
- `scripts/tests/test_native_maintenance.py` führt native Sperr-/Kopier-/Rollback- und Archivprüfungen in isolierten temporären Pfaden aus. `docker-latest-workflow.spec.js` prüft Smoke-Gates und führt die Push-/Digest-Promotion-Skripte mit kontrolliertem Docker aus. Die tatsächlichen Containersmokes laufen auf beiden nativen CI-Architekturen.

## Testqualität und Dependency-Kompatibilität vom 13. Oktober

Der fehlgeschlagene Dependency-Updatejob `38463175903` aktualisierte Refractor auf Version 5. Dessen öffentliche Exportmap unterstützt `refractor/core` und `refractor/<sprache>`; die bisherigen tiefen `lang/*.js`-/`lib/core.js`-Imports führten zu sechs Typfehlern und einer nicht geladenen Editor-Testsuite. Der konfigurierte Editor verwendet nun Refractor 5 mit ausgewählten öffentlichen Imports und den dazu passenden `rehype-prism-plus`-Adapter 2.0.2. Der bisherige Adapter 2.0.0 bezog Refractor-4-/HAST-2-Typen; der vollständige Build erkannte diese zweite Kompatibilitätsgrenze, die Renderingtests allein nicht erkennen. Seine tatsächlichen Renderingtests prüfen Nginx, JSON, PHP, CSS und JavaScript sowie eingebettete Sprachen, unbekannte Sprachen und als Text behandelte HTML-Konfiguration.

`bash scripts/ci/verify-dependencies.sh` führt den überprüften gemeinsamen Dependency-Vertrag aus: Backendtypen und gesamte Backendtests, Frontendlocales und gesamte Frontendtests, Produktionsbuild einschließlich Frontendtypen sowie komprimiertes Bundlebudget. Ausführbare Regressionen verwenden kontrollierte Prozessgrenzen und prüfen Arbeitsverzeichnisse, vollständige Reihenfolge und sofortiges Scheitern an jedem Gate. Der Updateworkflow bewahrt aktualisierte Manifeste, Lockfiles und NCU-Berichte auch nach einer fehlgeschlagenen Verifikation sieben Tage als Artefakt auf.

Die Testbestandsprüfung unterscheidet Strukturprüfung und vertiefte Funktionsprüfung: sämtliche Backend-/Frontend-Testdateien werden inventarisiert und auf fokussierte beziehungsweise übersprungene Fälle, fehlende Assertions und asynchrone Hygiene untersucht; zentrale Auth-, Service-, Timer-, CI- und Infrastrukturpfade werden zusätzlich gelesen und ausgeführt. Das ist keine Behauptung, dass jede Assertion manuell gelesen oder alle externen Produktivintegrationen getestet wurden.

- Zertifikats-Timertests rufen das produktive `initTimer()` auf und prüfen den tatsächlichen Callback an der Zeitgrenze; eine kopierte Intervallformel wäre kein Regressionsschutz. Umgebungsvariablen und Timer werden wiederhergestellt.
- Otplib wird mit den echten Exporten, SQLite, tatsächlicher TOTP-Einrichtung/Anmeldung und einem unabhängigen RFC-6238-Vektor geprüft. QR-Signatur, ungültige Einrichtung und einmalige Verwendung sind abgesichert.
- Benutzer-ID-Middleware und Proxy-Host-Antworttests verwenden die tatsächlichen Funktionen statt nachgebauter Logik; Datumstests verwenden feste Zeiten und genaue Kalenderergebnisse.
- Frontendfixtures setzen Mock-Implementierungen zurück, leeren QueryClients und stellen Spies wieder her. Der Refresh-Test berücksichtigt auch die verspätete Ablehnung einer früheren Sitzung. Die Browser-Smokes scheitern bei unbehandelten `pageerror`-Ereignissen.
- Infrastrukturtests prüfen alle PHP82-/83-/84-Neustartschleifen und verschachtelte CI-Shellskripte. Die virtuelle Healthcheck-Uhr entfernt Bashs special `SECONDS`-Verhalten, das zuvor reale Sekunden addieren und sporadische Fehlmeldungen auslösen konnte.
- Eine fehlende native MaxMind-Bibliothek ist in CI ein Fehler; lokale fehlende Laufzeitvoraussetzungen bleiben explizite Skips. PostgreSQL-spezifische E-Mail-Tests werden auf SQLite absichtlich übersprungen, laufen aber mit PGlite. MariaDB läuft im eigenen CI-Job.
- `scripts/tests/test_dockerlint.py` führt das tatsächliche Dockerlint-Gate mit kontrolliertem Linter aus: Erfolg, Toolabsturz ohne Regelkennung, stderr, alle Dateien nach Fehlern, ungewöhnliche Dateinamen, fehlende Dateien sowie Discovery-/Logfehler. Details im [Build-Vertrag](./build.md).

Der [isolierte Kompatibilitätslauf](https://github.com/shedowe19/ShieldPM/actions/runs/38466520461) prüft die korrigierten Quellen getrennt mit der festgehaltenen und der neuesten Dependency-Linie: beide Jobs erfolgreich, jeweils 2.161 bestandene Backendtests mit vier beabsichtigten Skips, 931 Frontendtests und sieben Browser-Smokes. Typen, Locales, Produktionsbuild und Bundlebudget sowie 73 Scanner-Integrationstests bestehen ebenfalls. Die Infrastruktur schließt lokal 164 Fälle mit 21 Umgebungsskips ab; in CI bleiben zwei erwartete Skips, die echten Containersmokes decken die entsprechenden Laufzeitpfade ab. Die nur für diesen Nachweis angelegte read-only Pipeline wird nach dem Abruf der generierten Lockfiles und Paketnachweise entfernt; die regulären PR-Checks bleiben aktiv.

## Gesamtprüfung und Korrekturen vom 15. Oktober

Die [Gesamtprüfung](./gesamtpruefung-2026-10-15.md) bewahrt die ursprünglichen Timeoutnachweise und dokumentiert die Korrekturen aller 18 Gruppen in PR #154. PGlite- und große Dateiintegrationstests erhalten ausdrücklich begrenzte Zeitbudgets; drei echte Nginx-Childprocessszenarien laufen einzeln mit SIGQUIT-fähiger Fixture und geprüftem regulärem Exit. Ein späterer grüner Retry ersetzt diese Vertragskorrekturen nicht.

Die Regressionen prüfen insbesondere reale SQLite-/PostgreSQL-Constraints und Graphrollbacks, echte MariaDB-Mehrverbindungsrennen, BIGINT-Downloads, lokale SSH-Hostverifikation, HTTP-/WebSocket-Shutdown und den Analytics-Folgepuffer. `mariadb-*.spec.js` umfasst nun auch Domainreservierung und große Detailbytes. Neue Tests verwenden dieselben produktiven Funktionen; äußere Dienste bleiben kontrolliert.

`frontend/e2e/auth-cookie-order.spec.ts` ergänzt zwei echte Chromiumfälle mit verzögerten HTTP-Antworten und HttpOnly-Set-Cookie: Refresh vor Impersonation beziehungsweise Logout. Sie prüfen die nächste tatsächlich gesendete Cookieidentität. Der lokale Testserver verarbeitet nur synthetische Fixtures. Zusammen mit den vorhandenen sieben Smokes sind es neun Browserfälle. Gemountete Auth-/Git-Sync-/Settings-Tests sichern Callbacknavigation, Loading, Konfliktauflösung, Speichersperre und frische Öffnungssnapshots. Tabübergreifende Serialisierung setzt Web Locks voraus; die Browserfälle belegen das ursprüngliche Rennen innerhalb derselben Seite.

Finale vollständige Headnachweise stehen in [PR #154](https://github.com/shedowe19/ShieldPM/pull/154); historische Zahlen früherer Durchgänge unten bleiben als solche erhalten.

## Typprüfung des Backends

`cd backend && node node_modules/typescript/bin/tsc --noEmit` prüft die JavaScript-Module unter `internal/`, `lib/` und `models/` samt importierten Abhängigkeiten mit ihren JSDoc-Verträgen. Die CI führt diese Prüfung vor den Backend-Tests aus. Modellfelder, QueryBuilder-Rückgaben und asynchrone Serviceverträge sind dabei typisiert; die Standardbibliothek umfasst die bereits von Node 26 unterstützten ES2023-APIs. Die Frontend-Typprüfung bleibt Bestandteil des Produktionsbuilds.

## Code-Qualität

Biome wird für Linting und Formatting eingesetzt:

```bash
npx biome check .           # Prüfen
npx biome check --write .   # Auto-Fix
```

### TScanner-Regressionen

```bash
yarn --cwd .tscanner test
```

Die eigenen Node-Tests unter `.tscanner/tests/` prüfen AST-Regeln einschließlich Alias-/Scope-Ausnahmen und
stdin-Protokoll, Bericht-/Baseline-Validierung sowie Index-/Arbeitskopie-Grenzen. Reale native Scannerläufe mit
temporären Git-Repositories sichern vollständige und geänderte-Zeilen-Scans, neue Fehler trotz sichtbarer Altbefunde,
fehlgeschlagene Skriptregeln und ungültige Quellen. Editor-Tests prüfen das gepinnte native Plattform-Binary und die
sichere Bearbeitung lokaler JSONC-Einstellungen; die tatsächliche VSCode-Oberfläche wird dabei nicht geprüft.

Neue Fehler und Scanner-Ausführungswarnungen/-fehler blockieren den Wrapper. Die Baseline-Mechanik gilt nur im
vollständigen Scan, niemals auf geänderten Zeilen; die versionierte Baseline enthält nach der Behebung der
ursprünglichen 57 Befunde keine Ausnahmen mehr. Normale Warnungsbefunde bleiben beratend. Die
[TScanner-Anleitung](../../wiki/TScanner.md) beschreibt Befehle, Regelumfang und Validierungsgrenzen.

## Historische Prüfläufe des Code-Audits 2026-09

Die folgenden Zahlen dokumentieren die damaligen Audit-Prüfläufe und sind keine fortlaufend aktualisierte Testinventur. Für aktuelle Zahlen die oben genannten Testbefehle ausführen und die CI-Ergebnisse des betreffenden Commits prüfen. Historischer Kontext: [Prüfbericht](./code-audit-2026-09.md).

### Zweiter Durchgang

Prüflauf mit Node.js 26.8.1 und den versionierten Yarn-Lockfiles:

- Frontend: 172 Testdateien mit 485 bestandenen Tests; TypeScript-Prüfung und Vite-Produktionsbuild bestanden.
- Backend: 115 Testdateien mit 793 bestandenen Tests; Details und Grenzen im [Prüfbericht](./code-audit-2026-09.md).
- Infrastruktur: 24 Python-Regressionstests für Migration, AIO, Update und Betriebsdateien sowie ShellCheck und Shell-Syntaxprüfung bestanden.
- Beide Codebereiche werden vollständig mit Biome geprüft. Die bisherigen Schema-/Deprecated-Hinweise der Biome-Konfigurationsdateien sind Informationsmeldungen.
- Paketprüfung: Backend und Frontend jeweils ohne gemeldete `yarn audit`-Befunde nach gezielter Remediation.

Ausführen: `cd backend && yarn test --run`; `cd frontend && yarn test --run && yarn build`; `python3 -m unittest discover -s scripts/tests -v` im Repository-Root. Für automatische Einmalläufe ist `--run` erforderlich, weil `yarn test` sonst im Beobachtungsmodus starten kann.

Die neuen Tests decken unter anderem Berechtigungen, einmalige 2FA-Challenges, Refresh-Replay, geschützte Terminal-Upgrades, echte SQLite-Transaktionen mit Fremdschlüsseln, mehrseitigen Import, Symlink-Schutz, Konfigurationsfehler, Prozessrennen und Datums-/Formularverträge ab. Externe Dienste werden gemockt; die Prüfgrenzen stehen im Bericht.

### Dritter Durchgang

Gesamtstand: **903 Backend-Tests in 133 Dateien, 536 Frontend-Tests in 176 Dateien und 37 Infrastrukturtests**, zusammen 1.476 bestandene Tests. Locale-Check, TypeScript, Vite und vollständiges Biome-Linting sind ebenfalls erfolgreich. Lokale Gesamtsuiten verwenden `--maxWorkers=2`.

Zusätzliche Prüfungen sichern TOTP-Einmalverwendung, vollständigen Logout-Widerruf und verspätete Refresh-Antworten über HTTP. SQLite/PGlite testen Passwortmigrationen und Terminal-Up/Down/Up mit langen Schlüsseln. Weitere Tests prüfen Owner-Zuordnungen, Nginx-Backups, echte Lua-Zähler, serialisierte WireGuard-Änderungen, DDNS-/Docker-/Terminal-Lebenszyklen, API-Antwortschemas und wartenden Startup-Abschluss.

Die Frontend-Tests verwenden echte QueryClients für die sieben optimistischen CRUD-Hooks und prüfen verspätete Antworten mit dem tatsächlichen AuthStore. Formular-, Berechtigungs-, Fokus-, Karten- und Clipboard-Regressionen ergänzen den Bereich. `check-locales.test.ts` ersetzt vorübergehend das FormatJS-Binary; der reale Locale-Check läuft daher erst nach Vitest.

Die Infrastrukturtests verwenden temporäre Dateien und echte SQLite-WAL-Snapshots. Sie simulieren Kopier-/Bereinigungsfehler und prüfen reversible Nginx-Optionen, Certbot-Link-Recovery, eigene Socketnamen und LXC-SSH-Hostschlüssel. Diese isolierten Prüfungen starten keine produktive Installation.

### Vierter Durchgang

Mit Node.js 26.8.1 bestehen **970 Backend-Tests in 144 Dateien und 544 Frontend-Tests in 177 Dateien**. Von 56 Python-Infrastrukturtests bestehen lokal 55; nur der echte Unix-Socket-Test wird wegen einer lokalen `EPERM`-Beschränkung übersprungen. In GitHub CI darf dieser Test nicht übersprungen werden. Locale-Check, TypeScript, Vite-Produktionsbuild, OpenAPI und vollständige Biome-Prüfungen sind erfolgreich.

Die neuen Regressionen prüfen atomare Schlüsselveröffentlichung und Duo-Ersetzung, Impersonation bei verspätetem Refresh und Provider-Remount, tatsächliche Nginx-Headervererbung, partielle Einstellungen, atomare IP-Listen, GitOps-Zielbindung, WireGuard-Schlüsseldateien, serialisierte Tor-Lebenszyklen und veröffentlichte API-Verträge. Der gemeinsame Template-Fingerabdruck wird zwischen Backend und echter Shell verglichen, einschließlich Aufruf über einen Symlink. Certbot-Tests prüfen die Erkennung von Plugins aus dem veränderlichen Zielverzeichnis.

Die Infrastrukturtests sichern Installation, Providerwechsel, Prozessneustart, eng begrenzte Besitzänderungen, migrierte Default-Konfigurationen und eigene Runtime-Verzeichnisse ab. Zusätzlich startet `scripts/ci/docker-smoke.sh` in beiden nativen Docker-PR-Jobs das frisch gebaute Image als root und als UID 1000. Es prüft tatsächliche Betriebsbereitschaft, Socketrechte, Nginx-Konfiguration und Reload sowie Schreibrechte und entfernt alle Testressourcen. Der Test läuft ohne externes Netzwerk und benötigt keine echten Anbieterzugangsdaten.

### Fünfter Durchgang

Mit Node.js 26.8.1 bestehen **998 Backend-Tests in 152 Dateien und 567 Frontend-Tests in 179 Dateien**. Die Python-Suite umfasst **58 Tests**, davon lokal 57 bestanden und ein erwarteter Unix-Socket-Skip; in GitHub CI bleibt dieser Test verpflichtend. Gesamtsuiten laufen lokal mit zwei Workern. Die Frontend-Wiederholung ohne parallele Backend-Last besteht nach einem anfänglichen Import-Timeout mit unverändertem Zeitlimit. Locale-Check und Build werden nach Vitest ausgeführt.

Neue Tests prüfen echte Passkey-Signaturen mit konkurrierendem Zählerupdate, Graph-Rollbacks bei SQLite-Triggerfehlern, den tatsächlich ausgeführten CLI-Symlink, lange OpenSSL-SANs und Certbot-Sperren vor Hoständerungen. Verzögerte Cloudflared-, DDNS-, ChatOps- und Frontend-Antworten sichern die Reihenfolge und verhindern die Wiederherstellung veralteter Zustände. Router, AuthProvider, QueryClient und API-Client werden gemeinsam für OIDC-Übernahme, erforderlichen CSRF-Header und normalen Passwortlogin geprüft. Echte HTTP-Tests prüfen Callback-Cookiepfade und veröffentlichte Auth-Antwortschemas.

Der Docker-Smoke rendert beide tatsächlichen gRPC-Vorlagen und prüft mit einem lokalen HTTP/2-Echo Methode, Pfad, Query und Body unter root und UID 1000. Die Python-Regression des Wiki-Generators erzeugt Seiten mit Vorlagenmarkern in ihren Namen und prüft unveränderte Knoten-/Kantenidentitäten. Ausführliche Abdeckung und Grenzen stehen im [Prüfbericht](./code-audit-2026-09.md).

### Sechster Durchgang

Mit Node.js 26.8.1 bestehen **1.061 Backend-Tests in 162 Dateien und 588 Frontend-Tests in 182 Dateien**, ohne Skips. Die 58 Python-Infrastrukturtests ergeben lokal 57 bestandene Tests und den dokumentierten Unix-Socket-Skip; GitHub CI muss alle 58 ausführen. Backend-Typprüfung, OpenAPI, Locale-Check, Frontend-TypeScript, Vite-Produktionsbuild und vollständiges Biome-Linting sind erfolgreich. Die lokalen Gesamtsuiten liefen nacheinander mit zwei Workern.

Die neuen Regressionen prüfen aktuelle Hostgraphen und Metadaten bei verzögerten Nginx-Aufträgen, erhaltene Git-Checkouts bei Clone-/Veröffentlichungsfehlern und verspäteten Konfigurationsänderungen, DDNS-Wiederholungen nach fehlgeschlagenen erzwungenen Updates sowie tatsächliche nullable API-Antworten. SQLite und PGlite führen die relevanten Datenoperationen tatsächlich aus; Git-Tests verwenden temporäre Verzeichnisse.

Echte HTTP-, RSA-, Cookie- und CSRF-Verträge sichern alle Sitzungsübergänge und den verspäteten Health-/Refresh-Fall. Nur eine ausdrücklich markierte CSRF-Ablehnung vor Ausführung der Route erlaubt nach aktuellem Health-Zustand einen einmaligen Client-Retry. Normale 403, eine zweite Ablehnung, Sitzungswechsel und Abbruch erlauben keine weitere Wiederholung. UI-Tests prüfen verspätete zweite Faktoren, Duo-Callbacks, Profilregistrierung und Setup sowie Fehleransichten bei lazy geladenen Modulen.

Weitere Tests verwenden Telegrafs tatsächlich installierte Legacy-Abbruchsignale, erzeugen echte Express-Portkonflikte und prüfen die automatische GeoIP-Auswahl durch den Validator im Kindprozess. Der Workflow prüft Backend-JSDoc-Typen vor den Tests. Alle Abdeckungszahlen, Nachweise und verbleibenden Betriebsgrenzen stehen im [Prüfbericht](./code-audit-2026-09.md).

## Verwandte Seiten

- [Setup](./setup.md)
- [Build](./build.md)
