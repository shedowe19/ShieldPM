# Datenbank

## Zweck

Dokumentation der Datenbank-Konfiguration und -Verwaltung.

## Unterstützte Datenbanken

| Engine          | Paket                  | Einsatz                      |
| --------------- | ---------------------- | ---------------------------- |
| SQLite          | `better-sqlite3` v12.9 | Entwicklung, einfache Setups |
| MySQL / MariaDB | `mysql2` v3.22         | Produktion                   |
| PostgreSQL      | `pg` v8.20             | Produktion                   |

## Konfiguration

Datei: `backend/knexfile.js`

Die Datenbank-Auswahl erfolgt über Umgebungsvariablen:

- **SQLite** (Standard): Keine Konfiguration nötig, Datei unter `/data/database.sqlite`
- **MySQL**: `DB_MYSQL_HOST`, `DB_MYSQL_PORT`, `DB_MYSQL_USER`, `DB_MYSQL_PASSWORD`, `DB_MYSQL_NAME`
- **PostgreSQL**: `DB_POSTGRES_HOST`, `DB_POSTGRES_PORT`, `DB_POSTGRES_USER`, `DB_POSTGRES_PASSWORD`, `DB_POSTGRES_NAME`

## Initialisierung

Datei: `backend/db.js`

Die Datenbank wird beim Anwendungsstart initialisiert. Migrationen laufen automatisch.

## Setup

Datei: `backend/setup.js` (7 KB)

Erstellt beim ersten Start:

- Admin-Benutzer (`admin@example.org`)
- Default-Einstellungen
- Default-Zertifikate

## SQLite-Wartung

Datei: `backend/sqlite-vaccum.js`

Führt `VACUUM` auf der SQLite-Datenbank aus, um ungenutzten Speicher freizugeben.

```bash
node /usr/local/bin/sqlite-vaccum.js
```

## Wichtige Hinweise

- SQLite ist **nur für Entwicklung** geeignet. Produktion sollte MySQL oder PostgreSQL verwenden.
- Migrationen sind so geschrieben, dass sie auf allen drei Engines funktionieren.
- Boolean-Felder: SQLite speichert als `0`/`1`, nicht als `true`/`false`.

## Verwandte Seiten

- [Datenmodell](./datenmodell.md)
- [Migrationen](./migrationen.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
