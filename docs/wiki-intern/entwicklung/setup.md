# Entwicklungs-Setup

## Zweck

Anleitung zur Einrichtung der lokalen Entwicklungsumgebung.

## Voraussetzungen

- Node.js v22+ (mit Corepack)
- Git

Corepack muss aktiviert sein:

```bash
corepack enable yarn
```

## Frontend starten

```bash
cd frontend
yarn install
yarn dev     # Startet Vite Dev-Server
```

## Backend starten

```bash
cd backend
yarn install
yarn dev     # Startet Nodemon (Annahme: basierend auf index-dev.js)
```

Annahme: Der `dev`-Script ist nicht explizit in `package.json` definiert. Das Backend könnte über `node index-dev.js` gestartet werden.

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

SQLite wird automatisch verwendet. Die Datei wird unter `/data/database.sqlite` erstellt. Migrationen laufen beim Start automatisch.

## Code-Qualität

```bash
# Biome Linting & Formatting
npx biome check .
npx biome check --write .
```

Konfiguration: `biome.json` (Root-Ebene, vereinheitlicht für Backend und Frontend).

## Verwandte Seiten

- [Build](./build.md)
- [Tests](./tests.md)
- [Lokale Entwicklung](./lokale-entwicklung.md)
- [Yarn v4 Migration](../entscheidungen/2026-05-20-yarn-v4-migration.md)
