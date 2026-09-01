# Entwicklungs-Setup

## Zweck

Anleitung zur Einrichtung der lokalen Entwicklungsumgebung.

## Voraussetzungen

- Node.js 24 LTS (passend zu `.nvmrc`)
- Corepack und die in `packageManager` fixierte Yarn-4-Version
- Git

## Frontend starten

```bash
cd frontend
corepack enable
yarn install --immutable
yarn dev     # Startet Vite Dev-Server
```

## Backend starten

```bash
cd backend
yarn install --immutable
yarn dev     # Startet Nodemon (Annahme: basierend auf index-dev.js)
```

Der Backend-`dev`-Script startet den Entwicklungs-Einstiegspunkt mit automatischem Reload.

## Tests ausführen

```bash
# Backend
cd backend
yarn test    # vitest

# Frontend
cd frontend
yarn test    # vitest
```

## Wichtige Dateien für die Entwicklung

| Datei                         | Zweck                                             |
| ----------------------------- | ------------------------------------------------- |
| `backend/index-dev.js`        | Einstiegspunkt für Entwicklung                    |
| `backend/index.js`            | Einstiegspunkt für Produktion                     |
| `backend/knexfile.js`         | Knex-Konfiguration (DB-Verbindung)                |
| `backend/db.js`               | Datenbankinitialisierung                          |
| `backend/setup.js`            | Initial-Setup (Admin-User, Default-Einstellungen) |
| `frontend/vite.config.ts`     | Vite-Konfiguration                                |
| `frontend/tailwind.config.js` | Tailwind-Konfiguration                            |

## Datenbank (Entwicklung)

SQLite wird automatisch verwendet. Die Datei liegt unter `/data/shieldpm/database.sqlite`; Migrationen laufen beim
Start. Für isolierte Tests einen temporären `DATA_PATH` verwenden und niemals eine produktive Datenbank einbinden.

## Code-Qualität

```bash
# Biome Linting & Formatting
yarn check
yarn biome check --write .
```

Konfiguration: `backend/biome.json` und `frontend/biome.json`. Die jeweilige `$schema`-URL muss zur per Lockdatei
installierten Biome-Version passen, damit der Linter keine Schema-Diagnose ausgibt.

## Verwandte Seiten

- [Build](./build.md)
- [Tests](./tests.md)
- [Lokale Entwicklung](./lokale-entwicklung.md)
