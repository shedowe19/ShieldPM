# Tests und Qualitätsgates

## Zweck

Backend und Frontend verwenden Vitest. Die CI behandelt Typprüfung, Lint/Format, Tests, Build, Locale-Parität,
Browser-Smokes, Dependency-Audit und Datenbankmigrationen als blockierende Gates.

## Lokal ausführen

```bash
corepack enable

cd backend
yarn install --immutable
yarn check
yarn tsc --noEmit
yarn test

cd ../frontend
yarn install --immutable
yarn check
yarn test
yarn build
```

`yarn check` ist der jeweilige Workspace-Einstiegspunkt. Abhängigkeiten werden nicht mit npm oder einem anderen
Yarn-Major neu aufgelöst.

## Browser-Smokes

Die Playwright-Konfiguration startet eine lokale Produktionsvorschau, blockiert nicht erlaubte externe Requests und
nutzt synthetische Fixtures. Einmalig ist der verwaltete Chromium-Browser nötig:

```bash
cd frontend
yarn exec playwright install chromium
CI=1 yarn test:e2e:ci
```

Ein blockierter Browser-Download ist eine externe CDN-/Netzgrenze und kein Grund, den CI-Smoke zu entfernen.

## Sicherheits- und Regressionstests

Gezielte Tests decken insbesondere ab:

- Initial-Admin-Claim, scheme-gebundene Cookies, Refresh-Rotation, Replay und Impersonation;
- MFA-/Step-up-Challenges, Passkeys, OIDC-Identitäten und sichere Migrationen;
- Analytics-Spool-Replay, Ledger-Idempotenz, Grenzen und Shutdown-Drain;
- Nginx-Staging/Compensation, Terminal-Tickets/HMAC/ACL/SSH-Host-Key und DDNS-SSRF;
- GitOps-v2-Manifest, Pfad-/Größen-/Secret-Prüfungen, Dry Run, Rollback und Crash Recovery;
- strikte AI-Tool-Schemas, serverseitige Limits/Bestätigungen und ChatOps-Principals;
- Installer/Updater, Backups, Signatur-/Digest-Prüfungen und Graceful Shutdown.

Quelltextbasierte CI-Vertragstests dürfen keine distributionsspezifischen absoluten Pfade oder einen Runtimenamen im
Dateinamen festschreiben. Node-Kompatibilität gilt für Node 24 LTS und die zusätzlich geprüfte neuere CI-Runtime.

## Datenbankmatrix

Migrationen werden mindestens auf SQLite, MySQL 8.4 und PostgreSQL 17 ausgeführt. Die CI wendet auf einem frischen
Stand zuerst ein Präfix an, setzt anschließend den offenen Suffix fort, prüft das vollständige Knex-Ledger und verlangt
einen abschließenden No-op-Lauf. Damit wird eine Wiederaufnahme zwischen abgeschlossenen Migrationen geprüft, ohne
irreversible `up()`-Funktionen erneut auszuführen. Fehlerzustände innerhalb einer nicht transaktionalen Migration
müssen gezielte Tests über vorbereitete partielle Schema- oder Datenzustände abdecken. Dialektabhängige DDL muss in
Migrationen gekapselt sein; Servicecode verwendet Objection/Knex.

## Dependency- und Supply-Chain-Gates

Die automatisierte Aktualisierung gleicht die tatsächlich gemeinsam aufgelöste Build-Baseline mit dieser Markierung ab:
<!-- verified-vite-baseline:start -->Vite und Vitest verwenden gemeinsam Vite 8.2.2/Rolldown 1.2.6.<!-- verified-vite-baseline:end -->

- `yarn install --immutable` muss ohne Lockfile-Änderung erfolgreich sein.
- Neu veröffentlichte Pakete durchlaufen vor der Auflösung eine explizite 24-Stunden-Quarantäne
  (`npmMinimalAgeGate: 1440`); Ausnahmen müssen versionsgenau geprüft und begründet werden.
- Audits laufen fail-closed; dokumentierte, zeitlich begrenzte Ausnahmen brauchen eine begründete Entscheidung.
- Drittanbieterhinweise werden deterministisch aus den direkt installierten Manifesten erzeugt; ein fehlendes Paket
  lässt die bestehende Notice unverändert und bricht den Generator ab.
- GitHub Actions und heruntergeladene Binärartefakte werden auf unveränderliche Identitäten geprüft.

## Verwandte Seiten

- [Build](./build.md)
- [Lokale Entwicklung](./lokale-entwicklung.md)
- [Deployment](./deployment.md)
- [Security-Modernisierung](../entscheidungen/2026-08-31-security-modernisierung.md)
