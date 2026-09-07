# Datenbank

## Zweck

Dokumentation der Datenbank-Konfiguration und -Verwaltung.

## Unterstützte Datenbanken

| Engine          | Paket                | Einsatz                      |
| --------------- | -------------------- | ---------------------------- |
| SQLite          | `better-sqlite3` v13 | Entwicklung, einfache Setups |
| MySQL / MariaDB | `mysql2` v3          | Produktion                   |
| PostgreSQL      | `pg` v8              | Produktion                   |

## Konfiguration

Datei: `backend/knexfile.js`

Die Datenbank-Auswahl erfolgt über Umgebungsvariablen:

- **SQLite** (Standard): Keine Konfiguration nötig, Datei unter `${DATA_PATH:-/data}/shieldpm/database.sqlite`
- **MySQL**: `DB_MYSQL_HOST`, `DB_MYSQL_PORT`, `DB_MYSQL_USER`, `DB_MYSQL_PASSWORD`, `DB_MYSQL_NAME`
- **PostgreSQL**: `DB_POSTGRES_HOST`, `DB_POSTGRES_PORT`, `DB_POSTGRES_USER`, `DB_POSTGRES_PASSWORD`, `DB_POSTGRES_NAME`

## Initialisierung

Datei: `backend/db.js`

Die Datenbank wird beim Anwendungsstart initialisiert. Migrationen laufen automatisch.

## Setup

Datei: `backend/setup.js` (7 KB)

Erstellt beim ersten Start:

- Optionaler Admin-Benutzer aus `INITIAL_ADMIN_EMAIL` und `INITIAL_ADMIN_PASSWORD`; ansonsten Ersteinrichtung in der Oberfläche
- Default-Einstellungen
- Default-Zertifikate

## Wechsel von SQLite zu MySQL oder PostgreSQL

Datei: `backend/lib/db-migrate.js`

Beim Start mit einer noch unbenutzten Server-Datenbank wird eine vorhandene SQLite-Datei unter `${DATA_PATH:-/data}/shieldpm/database.sqlite` erkannt. Vor dem Wechsel muss dieselbe ShieldPM-Version einmal mit SQLite gestartet worden sein: Tabellen, Spalten und ausgeführte Migrationen müssen zum Zielschema passen. Bei abweichendem Schema bricht der Import mit einer entsprechenden Fehlermeldung ab.

Der Import entdeckt alle Anwendungstabellen aus dem Datenbankschema. Damit werden auch Access-List-Passwörter, normalisierte Domains, Sitzungen, 2FA-Methoden und Backup-Codes, Tunnel, DDNS, Notizen und Analytics übertragen. Die Migrationstabellen selbst bleiben unter Kontrolle von Knex.

- Quelldaten werden aus einem konsistenten SQLite-Lesesnapshot in begrenzten Batches gelesen; große Integer bleiben als Dezimalzeichenketten präzise.
- Alle importierten Zeilen und Einstellungen werden in einer Zieltransaktion geschrieben; bei MySQL/MariaDB werden hierfür InnoDB-Tabellen vorausgesetzt. Vorhandene Daten außerhalb der durch Migrationen vorbelegten Einstellungen führen zum Abbruch.
- Fremdschlüssel bleiben aktiviert. Eltern werden vor Kindern importiert; gegenseitige Sitzungsverweise werden nach dem Einfügen aller Sitzungen wiederhergestellt.
- SQLite-Zeitstempel und PostgreSQL-Booleans werden anhand der Zielspaltentypen konvertiert. PostgreSQL-Sequenzen werden auf die importierten IDs gesetzt. Enthält die Quelle tatsächlich einen Integer-Primärschlüssel `0`, muss MySQL den SQL-Modus `NO_AUTO_VALUE_ON_ZERO` verwenden; sonst wird der Import abgebrochen, statt eine andere ID zu erzeugen.
- Vorbelegte Einstellungen werden mit den Quellwerten zusammengeführt. Bei Fehlern werden die importierten Daten zurückgerollt; das durch Knex vorbereitete Zielschema kann bestehen bleiben.
- Die SQLite-Datei und ihre WAL-Begleitdateien bleiben auch nach Erfolg unverändert als Rückfallmöglichkeit erhalten. Ein erneuter Start mit bereits vorhandenen Zielbenutzern importiert nicht erneut.

Während des Datenbankwechsels darf keine weitere ShieldPM-Instanz in die Quelldatenbank schreiben. Ein früherer unvollständiger Import mit bereits vorhandenen Zielbenutzern wird nicht automatisch überschrieben.

## SQLite-Wartung

Datei: `backend/sqlite-vaccum.js`

Führt `VACUUM` auf der vorhandenen SQLite-Datenbank unter `${DATA_PATH:-/data}/shieldpm/database.sqlite` aus. Eine fehlende Datei wird nicht stillschweigend als leere Datenbank angelegt.

```bash
node /usr/local/bin/sqlite-vaccum.js
```

## Wichtige Hinweise

- SQLite ist die Standard-Engine; MySQL/MariaDB und PostgreSQL werden ebenfalls unterstützt.
- Die vollständige Migrationskette wird mit SQLite und der eingebetteten PostgreSQL-Engine PGlite ausgeführt. Ein echter MySQL/MariaDB-Server ist durch diesen Test nicht abgedeckt.
- Boolean-Felder werden sowohl aus SQLite-/MySQL-Integerwerten als auch aus nativen PostgreSQL-Booleans korrekt gelesen.

## Verwandte Seiten

- [Datenmodell](./datenmodell.md)
- [Migrationen](./migrationen.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
