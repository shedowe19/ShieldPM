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
- CI-Regressionstests unter `backend/test/ci/` lesen Workflows als Quelldatei und sichern deren Sicherheitsvertrag. `npm-updates-workflow.spec.js` verlangt vollständige Git-Historie, fehlertoleranzfreie Yarn-Update-Scans, Manifest-basierte PR-Erzeugung, Build-/Test-Verifikation und den dedizierten PR-Token. Es sichert außerdem, dass der Dependency-Updater nicht das mit dem GitHub-Runner gekoppelte Yarn nutzt: alle Projekt-Yarn-Aufrufe erfolgen über `npx --yes --package yarn@1.22.22 yarn`, während `ncu` und `license-checker` über das von `actions/setup-node` bereitgestellte npm installiert und fail-closed in `GITHUB_PATH` gelegt werden. `node-26-runtime-contract.spec.js` und `update-shieldpm-node-runtime.spec.js` sichern den Debian-/NodeSource-APT-Builder mit Node 26, den Verzicht auf Node-Basisimages, den signierten nativen NodeSource-Pfad samt kontrolliertem Major-Wechsel, den für Node-/npm-/Yarn-Netzwerkzugriffe aktivierten Debian-System-CA-Store ohne TLS-Abschwächung, die Bereinigung ausschließlich verwaister Corepack-Shims beim npm-Yarn-Fallback, den Yarn-Classic-Corepack-/npm-Fallback, eingefrorene Yarn-Installationen, erforderliche native Build-Voraussetzungen, Node‑26-Workflow-Runtimes und die Engine-Metadaten. `generate-notices.spec.js` führt den Generator in einem temporären Fixture mit simuliertem `license-checker` aus, verwendet dafür `process.execPath` statt einer distributionsspezifischen Node-Position und stellt sicher, dass ein fehlgeschlagener Scan die vorhandene Notice-Datei unverändert lässt. `lint-and-format-workflow.spec.js` sichert den expliziten `refs/heads/`-Fetch der Default-Branch-Ref gegen einen gleichnamigen Tag. Die 2FA-Service-Suite erzwingt bei Backup-Codes zehn alphanumerische Zeichen selbst für Bytes, die bei Base64URL Sonderzeichen erzeugen würden.
- `test/internal/proxy-host-pagination.spec.js` sichert für 1.000 synthetische Hosts die Seitengröße, Zählmetadaten sowie die Owner- und Such-Einschränkung vor dem Paging. `proxy-hosts-route-pagination.spec.js` deckt den optionalen API-Vertrag und die Legacy-Arrayantwort ab; `ProxyHosts/TableWrapper.test.tsx` sichert die 100er-Seite, Seitennavigation und die Rückkehr von einer nach Löschen leeren Seite.

## Code-Qualität

Biome wird für Linting und Formatting eingesetzt:

```bash
npx biome check .           # Prüfen
npx biome check --write .   # Auto-Fix
```

## Verwandte Seiten

- [Setup](./setup.md)
- [Build](./build.md)
