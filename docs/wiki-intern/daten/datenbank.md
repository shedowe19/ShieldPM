# Datenbank

## Zweck

Dokumentation der Datenbank-Konfiguration und -Verwaltung.

## Unterstützte Datenbanken

| Engine          | Paket            | Einsatz                                        |
| --------------- | ---------------- | ---------------------------------------------- |
| SQLite          | `better-sqlite3` | Unterstützter Standard, auch kleine Produktion |
| MySQL / MariaDB | `mysql2`         | Optionale externe Datenbank                    |
| PostgreSQL      | `pg`             | Optionale externe Datenbank                    |

## Konfiguration

Datei: `backend/knexfile.js`

Die Datenbank-Auswahl erfolgt über Umgebungsvariablen:

- **SQLite** (Standard): Keine Konfiguration nötig, Datei unter `/data/shieldpm/database.sqlite`
- **MySQL**: `DB_MYSQL_HOST`, `DB_MYSQL_PORT`, `DB_MYSQL_USER`, `DB_MYSQL_PASSWORD`, `DB_MYSQL_NAME`
- **PostgreSQL**: `DB_POSTGRES_HOST`, `DB_POSTGRES_PORT`, `DB_POSTGRES_USER`, `DB_POSTGRES_PASSWORD`, `DB_POSTGRES_NAME`

## Initialisierung

Datei: `backend/db.js`

Die Datenbank wird beim Anwendungsstart initialisiert. Migrationen laufen automatisch.

## Setup

Datei: `backend/setup.js` (7 KB)

Erstellt idempotente Default-Einstellungen und den einmaligen Initial-Setup-Ownership-Claim. Ein Administrator wird nur
durch den atomaren Wizard-Claim mit `X-ShieldPM-Setup-Token` angelegt; es gibt keinen Default-Benutzer.

## SQLite-Wartung

Datei: `backend/sqlite-vaccum.js`

Führt `VACUUM` auf der SQLite-Datenbank aus, um ungenutzten Speicher freizugeben.

```bash
node /usr/local/bin/sqlite-vaccum.js
```

### Verifizierte Online-Backups und Restore

`backend/scripts/sqlite-backup.js` nutzt die Online-Backup-API von `better-sqlite3`, prüft den Snapshot mit
`PRAGMA integrity_check`, synchronisiert Datei und Verzeichnis und veröffentlicht ihn erst danach per atomarem Rename.
Ziel ist standardmäßig `/data/shieldpm/backups`; Verzeichnis und Dateien erhalten `0700` beziehungsweise `0600`.
Unvollständige `.partial`-Dateien werden nie rotiert. Standardmäßig bleiben sieben verifizierte Snapshots erhalten.

```bash
node /app/scripts/sqlite-backup.js

# Nur bei gestoppten Datenbankschreibern:
node /app/scripts/sqlite-backup.js \
  --restore /data/shieldpm/backups/database-<zeit>-<id>.sqlite \
  --destination /data/shieldpm/database.sqlite
```

Quelle und Staging-Datei werden beim Restore erneut verifiziert; das Ziel wird auf demselben Dateisystem atomar
ersetzt. MySQL/PostgreSQL benötigen weiterhin ein engine-natives, extern getestetes Backup.

## Analytics-Ingestion

Die Tabelle `analytics_ingestion_batch` bildet gemeinsam mit dem persistenten NDJSON-Spool die Absturzgrenze der
Analytics-Ingestion. Ein Ledger-Eintrag enthält Batch-ID, Payload-Hash, Claim-Token, Datensatzanzahl sowie erste und
letzte Spool-Sequenz. Er wird in derselben Transaktion wie Detail-Logs und aggregierte Zähler auf `committed` gesetzt.
Eine Bereinigung darf nur Sequenzen unterhalb des physisch noch replaybaren Spool-Bereichs löschen.

## Wichtige Hinweise

- SQLite ist der unterstützte Standard. Für HA/externen Betrieb können MySQL/PostgreSQL verwendet werden.
- Migrationen sind so geschrieben, dass sie auf allen drei Engines funktionieren.
- Boolean-Felder: SQLite speichert als `0`/`1`, nicht als `true`/`false`.
- Die sichere Backup-Funktion nutzt für SQLite einen konsistenten Snapshot plus Synchronisierung. Externe Datenbanken
  brauchen einen operator-bestätigten nativen Dump; Payload-/Datei-Rollback stellt sie nicht wieder her.
- Backend-Shutdown wartet auf In-Flight-Arbeit und schließt die Knex-Verbindung erst danach.

## Verwandte Seiten

- [Datenmodell](./datenmodell.md)
- [Migrationen](./migrationen.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
