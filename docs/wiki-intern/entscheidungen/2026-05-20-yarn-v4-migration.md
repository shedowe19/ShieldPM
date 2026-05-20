# Yarn v4 Migration (Corepack)

## Status

**Akzeptiert** — 2026-05-20

## Kontext

Das Projekt verwendete Yarn v1 (Classic), das seit Ende 2023 offiziell End-of-Life ist und keine Sicherheitsupdates mehr erhält. Die globale Installation via `npm install -g yarn` führte zu Versionskonflikten zwischen Entwicklern, CI und Docker.

## Entscheidung

Migration auf **Yarn 4.15.0** (Berry) mit folgenden Maßnahmen:

- **Corepack** als Installationsmethode statt `npm install -g yarn`
- **`packageManager`-Feld** in `backend/package.json` und `frontend/package.json` pinnt die exakte Version
- **`nodeLinker: node-modules`** in `.yarnrc.yml` erzwingt klassische `node_modules`-Struktur (kein PnP)
- **`enableScripts: true`** erlaubt Build-Scripts für native Module (better-sqlite3, ssh2)

## Betroffene Dateien

| Datei | Änderung |
| --- | --- |
| `.yarnrc.yml` (Root, NEU) | Zentrale Yarn-Konfiguration |
| `backend/package.json` | `packageManager: yarn@4.15.0` |
| `frontend/package.json` | `packageManager: yarn@4.15.0` |
| `Dockerfile` | `corepack enable yarn` statt `npm install -g yarn` |
| `rootfs/usr/local/bin/update-shieldpm` | Altes Yarn deinstallieren, Corepack aktivieren |
| `.github/workflows/lint-and-format.yml` | `corepack: true` + expliziter Enable-Step |
| `backend/.yarnrc.yml` | Gelöscht (durch Root ersetzt) |
| `frontend/.yarnrc.yml` | Gelöscht (durch Root ersetzt) |

## Entfernte Yarn-v1-Flags

- `--production=false` → `yarn install` (v4 installiert standardmäßig alle Dependencies)
- `--production` → entfernt (v4: `yarn workspaces focus --production`)
- `--silent` → entfernt (kein Äquivalent in v4)
- `yarn cache clean` → `yarn cache clean --all`

## Vorteile

- Reproduzierbare Builds durch gepinnte Version via Corepack
- Kein `npm install -g yarn` mehr nötig
- Schnellerer, parallelisierter Resolver
- Automatische Deduplizierung
- Aktive Wartung und Sicherheitsupdates

## Risiken

- PnP-Standardverhalten kann bestehende Skripte brechen → durch `nodeLinker: node-modules` mitigiert
- Lockfile-Format v10 ist nicht abwärtskompatibel mit Yarn v1

## Verwandte Seiten

- [Build](../entwicklung/build.md)
- [Config-Dateien](../konfiguration/config-dateien.md)
- [Setup](../entwicklung/setup.md)
