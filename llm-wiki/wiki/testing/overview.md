# Tests

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite beschreibt, wie ShieldPM geprüft wird, welche Testarten existieren und
welche Befehle vor einer Änderung laufen sollten.

## Testarten

| Art                      | Werkzeug                 | Umfang                                                          |
| ------------------------ | ------------------------ | --------------------------------------------------------------- |
| Backend-Unit/Integration | Vitest                   | 278 Testdateien (`.spec.js`/`.test.js`) unter `backend/test/`   |
| Frontend-Unit            | Vitest + Testing Library | 219 Dateien unter `frontend/src/`                               |
| Browser-Smoke            | Playwright               | `frontend/e2e/app-smoke.spec.ts`, `firewall-block-page.spec.ts` |
| Infrastruktur            | Python `unittest`        | 14 Dateien unter `scripts/tests/`                               |
| Scanner                  | TScanner                 | `node scripts/ci/tscanner.mjs`                                  |
| Abhängigkeiten           | Shell/Node               | `scripts/ci/verify-dependencies.sh`                             |

Verteilung Backend: `internal` 165, `lib` 49, `routes` 22, `migrations` 13,
`schema` 4, `ci` 20, `integration` 2, `benchmarks` 1, `helpers` 1 und
`config.test.js` im Wurzelordner — zusammen 278.

## Befehle

```bash
# Backend
cd backend && yarn test --run

# Frontend
cd frontend && yarn test --run
cd frontend && yarn build          # tsc + vite build
# Bundle-Budget separat (CI):
# node frontend/scripts/ci/check-bundle-budget.cjs --dist frontend/dist --budget frontend/performance-budget.json

# Browser
cd frontend && yarn test:e2e

# Scanner
yarn --cwd .tscanner install --frozen-lockfile --ignore-scripts --production=false
node scripts/ci/tscanner.mjs

# Abhängigkeiten
bash scripts/ci/verify-dependencies.sh
```

Quellen: `README.md:112-123`, `frontend/package.json:19-26`, `GEMINI.md:136-148`.

## Was die Tests besonders abdecken

- **Datenbankdialekte:** MariaDB- und PostgreSQL-Sonderfälle
  (`mariadb-*.spec.js`, `gitops-postgres-sequences.spec.js`).
- **Migrationen:** vollständiges Schema und Datenerhalt
  (`migrations/full-schema.spec.js`, `data-preservation.spec.js`).
- **Berechtigungen:** eigene Tests je Modul, z. B.
  `routes/upload-relay-permissions.spec.js`, `two-fa-authorization.spec.js`.
- **Nginx-Rendering:** Regressions- und Bulk-Validierung
  (`nginx-render-regressions.spec.js`, `nginx-bulk-validation.spec.js`).
- **CI-Verträge:** Workflow- und Toolchain-Prüfungen unter `test/ci/`.
- **Frontend-Barrel/Imports:** z. B. `Router.component-barrel.test.ts`,
  `components/app-shell-component-imports.test.ts`.

## Regeln

- Externe Dienste (Docker, Nginx, Tor, Telegram) werden in Tests gemockt, nie echt
  angesprochen (`.cursorrules:206`).
- Ein Test, der eine globale Funktion ersetzt, stellt sie wieder her.
- Zeitabhängige Tests nutzen eine kontrollierte Uhr, nicht echte Wartezeiten.
- Scanner-Befunde sind keine Warnungen: neue Fehler blockieren. Die Baseline
  enthält keine Ausnahmen für bestehende Fehler (`GEMINI.md:160-166`).

## Risiken und Stolperfallen

- **Node-Version:** Gefordert ist Node 26. Ein Lauf auf einer älteren Version kann
  an Syntax oder Paket-Exports scheitern.
- **Fehlende Installation:** Ohne `node_modules` in `backend/` und `frontend/`
  laufen die Befehle nicht; das Repository liefert keine Abhängigkeiten mit.
- **MariaDB-Tests** brauchen einen erreichbaren Server
  (`SHIELDPM_TEST_MARIADB=1`); **PostgreSQL-Tests** laufen in-process über PGlite
  und sind offline (`backend/test/helpers/postgres.js`).
- **Playwright** braucht installierte Browser.

## Python-Tests in CI

Der Shellcheck-Workflow führt alle Python-Tests aus:
`python3 -m unittest discover -s scripts/tests -v`
(`.github/workflows/shellcheck.yml:25`). Die frühere offene Frage ist damit
beantwortet.

## Offene Fragen

- Keine offenen Fragen auf dieser Seite; übergreifende Punkte stehen in
  [Offene Fragen](../questions/open-questions.md).

## Verwandte Seiten

- [Build und Release](../infrastructure/build-and-release.md)
- [Backend](../backend/overview.md)
- [Frontend](../frontend/overview.md)
- [Tests (Tiefe)](../reference/entwicklung/tests.md)
- [TScanner (öffentlich)](../../../docs/wiki/TScanner.md)
