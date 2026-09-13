# Entwicklungs-Setup

## Zweck

Anleitung zur Einrichtung der lokalen Entwicklungsumgebung.

## Voraussetzungen

- Node.js v26+ (über das signierte NodeSource-APT-Repository)
- npm / yarn
- Git

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

Für die Infrastrukturregressionen wird zusätzlich Python 3 benötigt:

```bash
python3 -m unittest discover -s scripts/tests -v
```

Die Tests prüfen Datenmigration, Certbot-Verknüpfungen, Shell-Syntax, unveränderte Zugangsdaten nach dem Schreiben der Umgebungsdatei sowie den AIO-Authentifizierungsablauf mit simuliertem Backend. Hinzu kommen wiederholte Konfigurationswechsel, interne Standardzertifikate, OCSP-Deaktivierung, GoAccess-Abschaltung, sichere Wiki-Graph-Ausgabe und die begrenzte CrowdSec-Test-CLI. Sie führen keine Installation und keine Dienständerung durch; HTTP-Anfragen sind vollständig ersetzt. Der Graph-Test verwendet Node.js, das der Shellcheck-Workflow ausdrücklich bereitstellt.

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

Konfiguration: `backend/biome.json` und `frontend/biome.json`. Die jeweilige `$schema`-URL muss zur per Lockdatei
installierten Biome-Version passen, damit der Linter keine Schema-Diagnose ausgibt.

## Verwandte Seiten

- [Build](./build.md)
- [Tests](./tests.md)
- [Lokale Entwicklung](./lokale-entwicklung.md)
