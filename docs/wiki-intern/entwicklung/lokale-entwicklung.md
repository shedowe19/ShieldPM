# Lokale Entwicklung

## Zweck

Tipps und Hinweise für die tägliche Entwicklungsarbeit.

## Backend-Einstiegspunkte

| Datei          | Zweck                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `index.js`     | Produktion: Migrationen, Setup, Hintergrunddienste und HTTP-Backend auf `/run/shieldpm.sock`   |
| `index-dev.js` | Entwicklung: führt Migrationen aus, initialisiert danach Analytics und startet den HTTP-Server |
| `app.js`       | Express-App-Konfiguration (Middleware, Routen)                                                 |

## Entwicklungs-Workflow

1. Backend und Frontend parallel starten
2. Frontend kommuniziert über API-Proxy mit Backend
3. Änderungen am Backend werden durch Nodemon automatisch neu geladen
4. Änderungen am Frontend werden durch Vite HMR sofort reflektiert

Vorher Node.js 24 LTS aus `.nvmrc` verwenden, `corepack enable` ausführen und in beiden Workspaces
`yarn install --immutable` nutzen. Der Package-Manager ist Yarn 4; npm darf die Lockfiles nicht neu schreiben.

Die Entwicklungsumgebung darf synthetische Testdaten verwenden, aber keine bekannten Credentials in produktive
Startpfade übernehmen oder Passwörter/Setup-Tokens protokollieren.

## Datenbank-Migrationen

Neue Migrationen werden beim Start automatisch ausgeführt. Zum manuellen Ausführen:

```bash
cd backend
node migrate.js
```

## Neue Migration erstellen

Namenskonvention: `YYYYMMDDHHMMSS_beschreibung.js` (UTC-Timestamp).

Vorlage siehe: [Migrationen](../daten/migrationen.md)

## API-Dokumentation

Swagger/OpenAPI-Schema: `backend/schema/swagger.json`

Die API-Schemas sind aufgeteilt in:

- `schema/common.json` — Gemeinsame Definitionen
- `schema/components/` — Wiederverwendbare Komponenten
- `schema/paths/` — Endpunkt-Definitionen

## Verwandte Seiten

- [Setup](./setup.md)
- [Tests](./tests.md)
- [Build](./build.md)
