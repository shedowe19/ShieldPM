# Datenbank und Migrationen

Status: active
Last verified: 2026-11-04
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

Die Engine wird in `backend/lib/config.js` gewählt: zuerst
`/data/shieldpm/default.json`, dann Umgebungsvariablen (`DB_MYSQL_*`,
`DB_POSTGRES_*`), sonst SQLite (`backend/lib/config.js:16-113`). Die Knex-Instanz
entsteht in `backend/db.js`.

## Migrationen

- 91 Dateien unter `backend/migrations/`, benannt
  `YYYYMMDDHHMMSS_beschreibung.js`; der Zeitstempel wird als UTC angenommen.
- ESM mit benannten Exporten `up` und `down`; Vorlage:
  `backend/lib/migrate_template.js`.
- Tabelle `migrations` verwaltet den Stand.
- Beim Start laufen sie automatisch (`backend/index.js:45-46` über
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

- TODO: Die Aussage „SQLite nur in Entwicklung“ aus `AGENTS.md` ist veraltet; sie
  widerspricht der Standardkonfiguration. Siehe
  [Widerspruch](../contradictions/2026-11-04-sqlite-in-produktion.md).

## Verwandte Seiten

- [Datenmodell](./overview.md)
- [Konfiguration](../infrastructure/configuration.md)
- [Migrationen (Tiefe)](../reference/daten/migrationen.md)
- [Datenbank (Tiefe)](../reference/daten/datenbank.md)
