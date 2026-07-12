# Lokale Entwicklung

## Zweck

Tipps und Hinweise für die tägliche Entwicklungsarbeit.

## Backend-Einstiegspunkte

| Datei          | Zweck                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `index.js`     | Produktion: führt Migrationen aus, initialisiert danach Analytics und startet den HTTPS-Server |
| `index-dev.js` | Entwicklung: führt Migrationen aus, initialisiert danach Analytics und startet den HTTP-Server |
| `app.js`       | Express-App-Konfiguration (Middleware, Routen)                                                 |

## Entwicklungs-Workflow

1. Backend und Frontend parallel starten
2. Frontend kommuniziert über API-Proxy mit Backend
3. Änderungen am Backend werden durch Nodemon automatisch neu geladen
4. Änderungen am Frontend werden durch Vite HMR sofort reflektiert

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
