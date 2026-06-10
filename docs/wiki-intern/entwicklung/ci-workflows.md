# CI-Workflows

## Zweck

Diese Seite dokumentiert projektinterne GitHub-Actions-Workflows, die Build-, Prüf- und Wartungsaufgaben automatisieren.

## Wichtige Dateien

| Datei                                   | Zweck                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `.github/workflows/npm-updates.yml`     | Erstellt automatisierte Dependency-Update-PRs für Frontend und Backend. |
| `.github/workflows/lint-and-format.yml` | Führt Biome, Vitest und Locale-Sortierung aus.                          |
| `.github/workflows/docker.yml`          | Baut das Docker-Image und Release-Artefakte.                            |
| `.github/workflows/json.yml`            | Prüft JSON-Dateien.                                                     |

## NPM Dependency Updates

Der Workflow `NPM Dependency Updates` läuft täglich um Mitternacht und kann manuell per `workflow_dispatch` gestartet werden. Er aktualisiert Frontend- und Backend-Abhängigkeiten nur auf Minor-/Patch-Versionen und erstellt bei Änderungen einen PR gegen `develop`.

Wichtiges Verhalten:

1. Corepack wird aktiviert, damit Yarn 4.15.0 verwendet wird.
2. `npm-check-updates` wird mit `yarn dlx npm-check-updates` ausgeführt, nicht mit `npx`.
3. Fehler von `npm-check-updates` dürfen nicht mit `|| true` verschluckt werden. Ein kaputter Update-Lauf soll rot werden statt einen irreführenden PR zu erzeugen.
4. `.yarn/install-state.gz` ist lokale Installations-Metadaten und darf nicht Bestandteil automatischer Dependency-Update-PRs sein.
5. Der erzeugte PR soll nur diese Pfade aufnehmen:
   - `THIRD-PARTY-NOTICES.md`
   - `frontend/package.json`
   - `frontend/yarn.lock`
   - `backend/package.json`
   - `backend/yarn.lock`

## Warum Yarn statt npx?

Das Projekt nutzt Yarn 4 mit `nodeLinker: node-modules`. Die `package.json`-Dateien enthalten sowohl `resolutions` als auch `overrides` für Security- und Kompatibilitäts-Pins. `npx` verwendet npm-Semantik und kann diese `overrides` anders validieren als Yarn.

Bekanntes Symptom:

```text
npm error code EOVERRIDE
npm error Override for postcss@^8.5.12 conflicts with direct dependency
```

In diesem Fall startet `npm-check-updates` über `npx` nicht zuverlässig. `yarn dlx npm-check-updates` verwendet dagegen die Yarn-Projektsemantik und kann die Updates korrekt ermitteln.

## Verwandte Seiten

- [Build](./build.md)
- [Setup](./setup.md)
- [Tests](./tests.md)
- [Yarn v4 Migration](../entscheidungen/2026-05-20-yarn-v4-migration.md)

_Zuletzt aktualisiert: 2026-06-10_
