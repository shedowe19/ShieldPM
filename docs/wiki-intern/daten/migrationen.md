# Migrationen

## Zweck

Dokumentation des Migrations-Systems und aller vorhandenen Migrationen.

## Kontext

Migrationen liegen unter `backend/migrations/` und verwenden Knex.js. Alle Dateien sind ESM-Module.

## Namenskonvention

```
YYYYMMDDHHMMSS_beschreibung.js
```

Beispiel: `20260407000000_add_wireguard_tunnel.js`

## Migration erstellen (Vorlage)

```javascript
import { migrate as logger } from "../logger.js";

const migrateName = "eindeutiger_name";

const up = (knex) => {
  logger.info(`[${migrateName}] Migrating Up...`);
  return knex.schema
    .createTable("tabellenname", (table) => {
      table.increments("id").primary();
      table.string("created_on").notNullable().defaultTo(knex.fn.now());
      table.string("modified_on").notNullable().defaultTo(knex.fn.now());
      // Weitere Spalten
    })
    .then(() => {
      logger.info(`[${migrateName}] Tabelle erstellt`);
    });
};

const down = (knex) => {
  logger.info(`[${migrateName}] Migrating Down...`);
  return knex.schema.dropTable("tabellenname").then(() => {
    logger.info(`[${migrateName}] Tabelle gelöscht`);
  });
};

export { up, down };
```

## Migrations-Chronologie (Auswahl)

### Basis (2018-2021)

- `20180618015850_initial` — Grundtabellen (proxy_host, redirection_host, dead_host, stream, certificate, access_list, user, auth, audit_log, setting)
- `20180929054513_websockets` — WebSocket-Support
- `20181019052346_forward_host` — Forward-Host-Feld
- `20181113041458_http2_support` — HTTP/2-Toggle
- `20181213013211_forward_scheme` — Forward-Scheme
- `20190104035154_disabled` — Disabled-Flag
- `20190215115310_customlocations` — Custom-Locations
- `20190218060101_hsts` — HSTS-Support
- `20190227065017_settings` — Einstellungstabelle
- `20200410143839_access_list_client` — IP-basierte Access-Lists
- `20201014143841_pass_auth` — Auth-Passthrough
- `20210210154702_redirection_scheme` — Redirect-Schema
- `20210423103500_stream_domain` — Stream-Domain-Feld

### Modernisierung (2024-2025)

- Streams SSL, Port-Strings, Proxy-Protocol, Bandwidth-Limits, Forward-Query, Maintenance-Pages, Rate-Limiting, Buffering, Analytics

### ShieldPM Features (2026)

- `20260103000000_add_access_list_mtls` — mTLS-Support
- `20260107000000_add_maintenance_schedule` — Geplante Wartungsfenster
- `20260108000000_add_cloudflared_tunnel` — Cloudflare Tunnels
- `20260109000000_add_ai_config` — AI-Agent Konfiguration
- `20260118000000_add_gitops_config` — GitOps
- `20260121000000_add_ddns` — DDNS-Support
- `20260122100000_add_tor_onion` — Tor Onion Services
- `20260122200000_add_terminal_host` — Web-Terminal
- `20260127000000_add_chat_integration` — ChatOps (Telegram)
- `20260129000000_add_anubis` — Anubis PoW-Gate
- `20260222000000_normalize_domain_names` — Domain-Name-Normalisierung
- `20260316122700_add_auth_sessions` — Session-Verwaltung
- `20260319000001_add_user_2fa` — Zwei-Faktor-Authentifizierung
- `20260407000000_add_wireguard_tunnel` — WireGuard Tunnels
- `20260409000000_add_turbo_loader` — Turbo-Loader
- `20260712000000_fix_analytic_count_aggregation_key` — versionierter, nicht-nullbarer Aggregationsschlüssel für robuste Analytics-Upserts auf SQLite, MySQL und PostgreSQL

- `20260907000000_fix_analytics_log_created_at` — numerischer Standardwert für `analytics_logs.created_at`; gültige alte SQLite-Zeitstempeltexte werden in Unix-Millisekunden umgerechnet. Neue Logeinträge setzen den tatsächlichen Erfassungszeitpunkt im Dienst. Die ursprüngliche Tabellenmigration verwendet ebenfalls den kompatiblen numerischen Standardwert, damit PostgreSQL-Neuinstallationen funktionieren.

## Datenintegrität bei Migrationen

Die Schemaänderungen werden innerhalb der Knex-Callbacks vollständig registriert; nachgelagerte Datenänderungen werden erst nach Abschluss der Schemaänderung ausgeführt und vollständig abgewartet. Einzelne historische Callbacks sind als `async` deklariert, registrieren ihre Schemaoperationen aber vor dem ersten `await`; neue Callbacks sollen synchron bleiben. Bereits vorhandene Rate-Limit-Spalten werden vor DDL geprüft, weil ein abgefangener Duplicate-Column-Fehler die PostgreSQL-Transaktion trotzdem abbrechen würde. JSON-Metadaten werden sowohl als Zeichenkette als auch als natives Treiberobjekt verarbeitet; der AI-Prompt-Reset erhält alle übrigen Konfigurationswerte.

Beim Rollback der Domainnormalisierung werden die aktuellen Domainrelationen in die Legacy-Spalte zurückgeschrieben. Damit bleiben zwischenzeitliche Neuanlagen und Umbenennungen erhalten. Der mTLS-Rollback schreibt die aktuellen Werte zurück in `meta`; der Rate-Limit-Rollback entfernt alle drei zugehörigen Spalten.

Die Access-List-Passwortmigration erkennt vollständige bcrypt- und APR1-Hashes. Diese bleiben unverändert; Klartext wird auch dann mit bcrypt gehasht, wenn er mit `$2` beginnt.

Die Terminalmigration bewahrt den ursprünglichen Namen, Typ und die Metadaten. Ihr Rollback übernimmt aktuelle Zugangsdaten in `terminal_host`, verwendet für verschlüsselte Passwörter und SSH-Schlüssel Textspalten und entfernt erfolgreich zurückkopierte Terminal-Proxyzeilen. Dadurch entstehen bei einem anschließenden Upgrade keine doppelten aktiven Hosts mit verlorenen Zugangsdaten. Gewöhnliche HTTP-Proxyzeilen bleiben erhalten. Verweisen noch Tor-Dienste, Analytics oder Domainrelationen auf einen betroffenen Terminalhost, bricht der Rollback vor Schemaänderungen ab, um referenzierte Daten zu erhalten. `backend/test/migrations/third-database-credentials.spec.js` prüft diese Up-/Down-/Up-Abläufe einschließlich langer Schlüssel und Tor-Referenzen mit SQLite und PGlite.

Die Tests `backend/test/migrations/full-schema.spec.js` und `data-preservation.spec.js` führen diese Abläufe mit SQLite und der echten PostgreSQL-Engine in PGlite aus. Dabei werden nur die externen Nginx-Aktionen gemockt. Änderungen historischer Migrationen wirken auf noch nicht ausgeführte Upgrades und auf Rollbacks; bereits durch frühere Versionen verlorene Werte lassen sich daraus nicht automatisch rekonstruieren.

## Wechsel der Datenbank-Engine

Der SQLite-Import in `backend/lib/db-migrate.js` ist vom Knex-Schema-Upgrade getrennt. Er setzt gleiche ausgeführte Migrationen auf Quelle und Ziel voraus und importiert Anwendungsdaten atomar. Ablauf, Schutz vor Teilimporten und erhaltene Quelldateien sind unter [Datenbank](./datenbank.md#wechsel-von-sqlite-zu-mysql-oder-postgresql) dokumentiert.

## Verwandte Seiten

- [Datenmodell](./datenmodell.md)
- [Datenbank](./datenbank.md)
