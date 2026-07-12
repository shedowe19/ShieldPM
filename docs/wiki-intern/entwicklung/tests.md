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
  Skip-Link und Hauptinhalt-Fokus, den Dashboard-Notiz-Speichervertrag sowie einen Axe-Scan ohne Farbkontrastregel ab.
- Die bei einem Playwright-Lauf erzeugten Artefakte unter `frontend/test-results/` sind lokal und werden nicht versioniert;
  damit bleibt der Worktree auch nach einem fehlgeschlagenen Browser-Smoke frei von Testausgaben.

## Backend-Tests

- Pfad: `backend/test/`
- Enthalten Unit-Tests für `backend/lib/` (z.B. helpers, user-id-from-me) und `backend/internal/` (z.B. 2fa-service, ai, auth-session-service, certificate, ddns, tokens-2fa).
- Führen Tests über Vitest aus.
- Quelltextbasierte Regressionstests verwenden `backend/test/helpers/source-path.js`. Der Helper leitet das Backend-Verzeichnis über `import.meta.url` und `fileURLToPath()` ab, damit Tests in beliebigen Worktrees ohne fest verdrahtete lokale Pfade laufen.
- Tests, die ausschließlich GitOps-Patch-Payloads prüfen, stubben `internalGitOps.initRepo()` gezielt. Dadurch bleibt die Patch-Logik real getestet, ohne dass die CI-Schreibrechte für den Produktionspfad `/data/gitops` benötigt.
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
