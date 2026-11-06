# Datenbank und Migrationen

Status: active
Last verified: 2026-11-06
Confidence: high

## Zweck

Diese Seite beschreibt, welche Datenbanken unterstützt werden, wie die Verbindung
konfiguriert wird und wie Migrationen geschrieben und geprüft werden.

## Unterstützte Datenbanken

| Umgebung      | Engine   | Treiber          |
| ------------- | -------- | ---------------- |
| Standard      | SQLite   | `better-sqlite3` |
| MySQL/MariaDB | `mysql2` | `mysql2`         |
| PostgreSQL    | `pg`     | `pg`             |

Neue Installationen wählen die Datenbank vor der Benutzeranlage. Später ist ein
verifizierter Wechsel unter Einstellungen möglich. Eine ausdrücklich gespeicherte
Auswahl in `/data/shieldpm/database.json` hat Vorrang vor der alten Datei
`default.json` und den Umgebungsvariablen. Ohne verwaltete Auswahl bleiben die
bestehenden Konfigurationswege maßgeblich. Secrets liegen außerhalb der Datenbank-
Settings. Details in der [Datenbank-Referenz](../reference/daten/datenbank.md).

## Providerwechsel

Unterstützt sind SQLite ↔ MySQL/MariaDB und SQLite ↔ PostgreSQL; direkte Wechsel
zwischen Serverprovidern werden abgewiesen. Ein DB-unabhängiger Bootstrap läuft
vor Modell-/Knex-Importen. Der kontrollierte Prozessneustart stoppt alle eigenen
Schreiber; andere Instanzen und externe Schreiber müssen gestoppt werden.
Snapshot, privater Export, Übertragung und kanonische Integritätsprüfung passieren
unter Quellschreibsperren. Erst dann wird die Zielauswahl atomar aktiviert.

Ein Rückwechsel verwendet aktuelle Daten und eine neue Zieldatenbank. Eine alte
SQLite-Quelldatei nach Serverwechsel wieder zu öffnen wäre Datenverlust und ist
kein Wiederherstellungsverfahren. Unklare Aktivierung bleibt in Wartung.
[Entscheidung und Betriebsgrenzen](../decisions/2026-11-06-datenbank-bootstrap-und-providerwechsel.md).

## Migrationen

- 92 Dateien unter `backend/migrations/`, benannt
  `YYYYMMDDHHMMSS_beschreibung.js`; der Zeitstempel wird als UTC angenommen.
- ESM mit benannten Exporten `up` und `down`; Vorlage:
  `backend/lib/migrate_template.js`.
- Tabelle `migrations` verwaltet den Stand.
- Beim Start laufen sie automatisch (`backend/runtime.js` über
  `backend/migrate.js`).
- Zusätzlich existiert ein Pfad zur Migration von SQLite in eine andere Datenbank
  (`backend/lib/db-migrate.js`).

Beispielgerüst:

```javascript
import { migrate as logger } from "../logger.js";

const migrateName = "add_my_feature";

const up = (knex) => {
  logger.info(`[${migrateName}] Migrating Up...`);
  return knex.schema.createTable("my_feature", (table) => {
    table.increments("id").primary();
    table.string("created_on").notNullable().defaultTo(knex.fn.now());
    table.string("modified_on").notNullable().defaultTo(knex.fn.now());
  });
};

const down = (knex) => {
  logger.info(`[${migrateName}] Migrating Down...`);
  return knex.schema.dropTable("my_feature");
};

export { up, down };
```

## Prüfung

- `backend/test/migrations/full-schema.spec.js` baut das vollständige Schema.
- `backend/test/migrations/mariadb-full-schema.spec.js` prüft MariaDB-spezifische
  Fälle.
- `backend/test/migrations/data-preservation.spec.js` stellt sicher, dass
  Migrationen bestehende Daten behalten.
- Einzelne Migrationen haben eigene Regressionstests (z. B.
  `retired-host-runtime.spec.js`, `maintenance-pending.spec.js`).

## Risiken und Stolperfallen

- **Kein Rückweg:** `down` wird im Betrieb nicht automatisch ausgeführt. Eine
  destruktive `up`-Migration ist praktisch endgültig; vorher Backup.
- **SQLite-Dialekt:** `ALTER TABLE` ist eingeschränkt; manche Migrationen bauen
  Tabellen neu. Das muss die Daten erhalten.
- **MariaDB-Konflikte:** Monitor- und Host-Rollback-Pfade wiederholen exakt
  Snapshot-, Deadlock- und Lock-Timeout-Fehler bis zu dreimal.
- **Zeitstempel:** SQLite und MySQL liefern unterschiedliche Typen; Tests decken
  das ab (`audit-log-sqlite-dates.spec.js`, `certificate-datetime.spec.js`).
- **PostgreSQL-Sequenzen:** GitOps-Import muss Sequenzen nachziehen
  (`gitops-postgres-sequences.spec.js`).

## Offene Fragen

- Keine offenen Fragen auf dieser Seite. Der frühere Widerspruch „SQLite nur in
  Entwicklung“ ist mit `T-001` aufgelöst: `AGENTS.md` und `.cursorrules`
  beschreiben SQLite als unterstützte Produktionsoption
  ([Widerspruch](../contradictions/2026-11-04-sqlite-in-produktion.md)).

## Verwandte Seiten

- [Datenmodell](./overview.md)
- [Konfiguration](../infrastructure/configuration.md)
- [Migrationen (Tiefe)](../reference/daten/migrationen.md)
- [Datenbank (Tiefe)](../reference/daten/datenbank.md)
