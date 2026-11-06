# Datenbank

## Zweck

Dokumentation der Datenbank-Konfiguration und -Verwaltung.

## Unterstützte Datenbanken

| Engine          | Paket                | Einsatz                      |
| --------------- | -------------------- | ---------------------------- |
| SQLite          | `better-sqlite3` v13 | Produktionsstandard, einfache Setups |
| MySQL / MariaDB | `mysql2` v3          | Produktion                   |
| PostgreSQL      | `pg` v8              | Produktion                   |

## Konfiguration

Dateien: `backend/lib/config.js` und `backend/db.js`. `backend/knexfile.js` stellt die Knex-Konfiguration zum Erstellen von Migrationsdateien bereit.

Eine neue Installation ohne explizite Konfiguration oder Anwendungsdaten bietet
vor der Benutzeranlage die Auswahl SQLite, MySQL/MariaDB oder PostgreSQL an.
Bestehende oder fehlerhafte explizite Konfigurationen öffnen keinen neuen Wizard.
Die verwaltete Auswahl unter `${DATA_PATH:-/data}/shieldpm/database.json` (0600)
hat nach ausdrücklicher UI-Auswahl Vorrang. Ohne diese Datei bleiben
`default.json`, danach `DB_MYSQL_*`/`DB_POSTGRES_*`, danach SQLite maßgeblich.
Datenbank-Secrets gelangen nicht in die generische Tabelle `setting` oder deren
Auditpfad. Instanzschlüssel bleiben in `keys.json` und werden nicht neu erzeugt.

- **SQLite**: frische Einrichtung `shieldpm/database.sqlite`; nach Rückmigration
  neue `database-<operation-id>.sqlite`, deren Auswahl privat persistiert wird.
- **MySQL/MariaDB**: bestehende `DB_MYSQL_*`-Werte bleiben ohne verwaltete Auswahl gültig.
- **PostgreSQL**: entsprechend `DB_POSTGRES_*`.

`DB_SQLITE_FILE` ist veraltet und wird von der Startvalidierung abgelehnt. Bei der Datenbankauswahl im nativen Installer bleiben vorhandene Alteinträge deshalb für alle Provider auskommentiert, auch beim Wechsel zurück auf SQLite. Der gespeicherte Kommentar wird erhalten; der SQLite-Pfad wird dadurch nicht geändert. `scripts/tests/test_fourth_infrastructure.py` prüft Providerwechsel mit aktiven und auskommentierten Alteinträgen durch die echte Startvalidierung.

## Initialisierung

`index.js` wartet auf `bootstrap-app.js`, bevor `runtime.js` und damit Modelle,
Knex-Singleton, Analytics oder sonstige Schreiber importiert werden. Der
Entwicklungseinstieg verwendet dieselbe Schranke. Der Bootstrap dient nur Auswahl,
Status und kontrollierter Wiederherstellung. Zwei historische Nginx-Migrationen
importieren die Engine erst im normalen Betrieb; getrennte Schemaerstellung darf
keine Modelle an die falsche Datenbank binden.

Ein separates privates SQLite-Kontrollfile hält während des Prozesses eine
Betriebssystem-Schreibsperre. Es ist keine Anwendungsdatenbank und verhindert
parallele Prozesse auf demselben Datenvolume. Unabhängige Instanzen und externe
Schreiber müssen beim Wechsel vom Betreiber gestoppt sein.

## Setup

Datei: `backend/setup.js`

Erstellt beim ersten Start:

- Optionaler Admin-Benutzer aus `INITIAL_ADMIN_EMAIL` und `INITIAL_ADMIN_PASSWORD`; ansonsten Ersteinrichtung in der Oberfläche
- Default-Einstellungen
- Certbot-Verzeichnisse und -Plugins werden vorbereitet; beim Start können Hostkonfigurationen neu erzeugt werden. Das TLS-Standardzertifikat wird im Startskript für Nginx ausgewählt.

## Kontrollierter Providerwechsel

Dateien: `lib/database-{config,switch,copy}.js`, `bootstrap-app.js`,
`internal/database.js`, `routes/database.js` und `runtime.js`.

Die Einstellungen erlauben SQLite ↔ MySQL/MariaDB und SQLite ↔ PostgreSQL.
Direkter Server-zu-Server-Wechsel ist ausdrücklich nicht unterstützt. Ziele müssen
vor der Schemaerstellung vollständig leer und exklusiv sein. Der API-Aufruf
bestätigt Migration und exklusiven Betrieb. Ein geplanter Exitcode 75 startet den
Backend-Prozess über `shieldpm-backend.sh` neu; normale Fehler bleiben kritisch.

Das private, atomar geschriebene und geflushte `database-operation.json` protokolliert
Vorbereitung, Kopie, Verifikation und Aktivierung. Erst nach dem Prozesswechsel
wird kopiert; kein Hintergrunddienst aus dem normalen Lauf darf weiter schreiben.
Quellschreibsperren bleiben bis zur Aktivierungsentscheidung gehalten. Ein
vollständiger privater kanonischer NDJSON-Export entsteht vor dem ersten
Zieldatenschreibvorgang im selben gesperrten Snapshot. Tabellen werden in begrenzten
Batches mit zusammengesetzter Keyset-Paginierung übertragen. Fremdschlüssel,
gegenseitige Sitzungsverweise, Seed-Zeilen und gelöschte ID-Hochwasserstände werden
berücksichtigt. Die lazy Tabelle `login_attempts` wird bei Bedarf materialisiert.

Unabhängige kanonische Verifikation vergleicht Zeilenzahlen und Inhaltsdigests;
JSON-Zahlen umgehen IEEE-754, JSON-null bleibt von SQL-NULL getrennt. Datum und
Zeitzone, Mikrosekunden, Boolean, Binärdaten und Bigint-Grenzen werden geprüft.
Nicht verlustfrei darstellbare Werte verhindern die Aktivierung. Schlüssel- oder
Kollationskonflikte werden nicht durch Überschreiben aufgelöst. Schema-Registry-
Vergleiche sortieren Dateinamen in JavaScript statt mit providerabhängiger Kollation.

Die verwaltete Auswahl wird erst nach Verifikation atomar veröffentlicht. Bei
unklarer Aktivierung bleibt der Bootstrap in Wartung und prüft das Ziel vor
Anwendungsimporten erneut. Voraktivierungsfehler lassen die Quelle bestehen;
die Oberfläche kann den Fehler bestätigen und zum bisherigen Betrieb zurückkehren.
Ein manueller Neustart nach gescheitertem Wechsel verwendet ebenfalls die bisherige
Auswahl. Ein gescheitertes Erstsetup bleibt im Einrichtungs-/Bestätigungsablauf.
Nach Aktivierung ist das Ziel verbindlich: alte Quelldaten sind nur Archiv.
Ein Rückwechsel benötigt eine neue Migration der aktuellen Daten.

## Kompatibler ENV-Import

`lib/db-migrate.js` bleibt für nicht verwaltete Altinstallationen erhalten und wird
bei verwalteter Auswahl übersprungen. Der SQLite-Import in leere Serverdatenbanken
unterstützt zusammengesetzte Primärschlüssel, unveränderte Claim-Lock-Seeds und lazy
Login-Daten. Erweiterte oder zusätzliche Zielzeilen werden zurückgewiesen.
Vorher muss die SQLite-Quelle mit derselben ShieldPM-Version aktualisiert sein.
Die alte Quelldatei ist nach Erfolg keine laufend aktuelle Rückfall-Datenbank.

## SQLite-Wartung

Datei: `backend/sqlite-vaccum.js`

Führt `VACUUM` auf der aktuell gewählten SQLite-Datei aus. Eine fehlende Datei wird nicht stillschweigend als leere Datenbank angelegt. Diese vollständige Umschreibung ist bewusst **keine** Startoperation: `start.sh` führt nur den normalen Startpfad aus. Wartung wird explizit und in einem geplanten Wartungsfenster ausgelöst.

```bash
/usr/local/bin/shieldpm-vacuum
```

## Wichtige Hinweise

- SQLite ist die Standard-Engine; MySQL/MariaDB und PostgreSQL werden ebenfalls unterstützt.
- Die vollständige Migrationskette wird mit SQLite, der eingebetteten PostgreSQL-Engine PGlite und einer frischen MariaDB-11.8.3-Datenbank ausgeführt. Der CI-Job `mariadb-migration` lässt jede Datei aus `backend/migrations/` über den produktiven Knex-Runner laufen, verifiziert die komplette Migrationsregistrierung und prüft anschließend einen wiederholten leeren Lauf. Zusätzlich bleibt der Zstd-Unterbrechungs-Recovery-Fall auf MariaDB abgedeckt.
- Boolean-Felder werden sowohl aus SQLite-/MySQL-Integerwerten als auch aus nativen PostgreSQL-Booleans korrekt gelesen.

## Verifizierte Provider-Matrix

Aktuell isoliert geprüft: SQLite 3.53.4, MariaDB 11.8.3, Oracle MySQL 8.4.13 und
PostgreSQL 17.6. `test/lib/database-copy.spec.js` prüft unter anderem Präzision,
Binärdaten und Quellsperren gegen echte Server.
`test/lib/database-switch-providers.spec.js` führt die aktuelle vollständige
Migrationskette in kalten Prozessen aus und prüft aktivierte Wiederaufnahme,
private Backups, neue Schreibvorgänge beim Rückweg und unveränderte alte Quellen.
Der CI-Job `database-provider-matrix` stellt alle drei Server isoliert bereit.

Die Oracle-Prüfung fand drei historische ungültige Default-Ausdrücke (DDNS-JSON,
Chat-/Domain-Varchar-Zeitstempel) sowie unterschiedliche Großschreibung des
InnoDB-Metadatenfeldes. Diese sind korrigiert und real erneut geprüft. Diese Matrix
belegt repräsentative Daten im vollständigen Anwendungsschema; zusätzliche
Betreibertabellen oder unvereinbare Werte werden nicht stillschweigend konvertiert.

## Verwandte Seiten

- [Datenmodell](./datenmodell.md)
- [Migrationen](./migrationen.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
