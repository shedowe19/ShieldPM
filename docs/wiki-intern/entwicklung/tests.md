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

## Backend-Tests

- Pfad: `backend/test/`
- Enthalten Unit-Tests für `backend/lib/` (z.B. helpers, user-id-from-me) und `backend/internal/` (z.B. 2fa-service, ai, auth-session-service, certificate, ddns, tokens-2fa).
- Führen Tests über Vitest aus.
- Quelltextbasierte Regressionstests verwenden `backend/test/helpers/source-path.js`. Der Helper leitet das Backend-Verzeichnis über `import.meta.url` und `fileURLToPath()` ab, damit Tests in beliebigen Worktrees ohne fest verdrahtete lokale Pfade laufen.

## Code-Qualität

Biome wird für Linting und Formatting eingesetzt:

```bash
npx biome check .           # Prüfen
npx biome check --write .   # Auto-Fix
```

## Verwandte Seiten

- [Setup](./setup.md)
- [Build](./build.md)
