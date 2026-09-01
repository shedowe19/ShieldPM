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

## Migrations-Chronologie

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

- Streams SSL, Port-Strings, Proxy-Protocol, Bandwidth-Limits, Forward-Query, Maintenance-Pages, Rate-Limiting und Buffering
- `20251231000000_analytics_logs` — dialektkompatibler Epoch-Millisekunden-Default für Analytics-Detailzeilen; die Laufzeit setzt den Wert zusätzlich explizit für bestehende Installationen

### ShieldPM Features (2026)

- `20260102000000_add_req_limit` / `20260104000000_fix_req_limit_columns` — Rate-Limit-Spalten und
  retry-sichere Reparatur; jede Spalte wird vor DDL einzeln geprüft, damit insbesondere PostgreSQL-Transaktionen nicht
  durch erwartbare Duplicate-Column-Fehler abgebrochen werden
- `20260103000000_add_access_list_mtls` / `20260105000000_add_access_list_mtls` — mTLS-Support; übernimmt
  bestehende Metadaten sowohl aus JSON-Strings (SQLite/MySQL) als auch aus bereits dekodierten JSON-Objekten
  (PostgreSQL), ohne ungültige Metadaten zu verändern
- `20260107000000_add_maintenance_schedule` — Geplante Wartungsfenster
- `20260108000000_add_cloudflared_tunnel` — Cloudflare Tunnels
- `20260109000000_add_ai_config` — AI-Agent Konfiguration
- `20260110000000_reset_ai_system_prompt` — entfernt nur den veralteten System-Prompt aus der JSON-Konfiguration;
  die Anwendung transformiert und serialisiert das JSON dialektunabhängig und retry-sicher für SQLite, MySQL und
  PostgreSQL
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
- `20260831231500_add_analytics_ingestion_ledger` — transaktionales Analytics-Replay-Ledger mit stabilen Batch-Hashes, Claims und Sequenzgrenzen
- `20260901000000_normalize_analytics_log_created_at` — idempotenter SQLite-Backfill historischer Analytics-Zeitstempel auf Unix-Epoch-Millisekunden

Der Security-Modernisierungsstand ergänzt retry-sichere Migrationen für Initial-Setup-Claim, MFA-Challenges,
OIDC-Identity/Flow-Härtung und Terminal-Host-Key/ACL-Revision. Die konkrete Dateiliste wird aus
`backend/migrations/` abgeleitet und nicht als manuell gepflegte Anzahl dupliziert.

## Verifikation

CI führt den kompletten Migrationsstand auf SQLite, MySQL 8.4 und PostgreSQL 17 aus. Auf einer frischen Datenbank wird
zuerst ein deterministisches Präfix angewendet, anschließend der offene Suffix über das normale `migrate.latest()`
fortgesetzt. Das Gate gleicht nach beiden Phasen das Migrations-Ledger mit der Dateiliste ab und verlangt danach einen
No-op-Lauf ohne offene Migration. Bereits im Ledger erfasste, möglicherweise irreversible Migrationen werden dabei
nicht erneut ausgeführt.

Dieser Ketten-Test belegt die Wiederaufnahme **zwischen** erfolgreich abgeschlossenen Migrationen. Retry-Sicherheit
nach einem Fehler **innerhalb** einer nicht transaktionalen Migration muss zusätzlich ein gezielter Migrationstest mit
einem absichtlich partiellen Schema- oder Datenzustand prüfen; ein pauschaler zweiter Aufruf aller `up()`-Funktionen
wäre destruktiv und kein realistischer Knex-Retry. DDL muss sowohl dialektkompatibel als auch für diesen konkreten
Fehlerfall retry-sicher sein. Ein `down()` darf nur die Felder/Constraints der eigenen Migration entfernen.
`CURRENT_TIMESTAMP`-Defaults gehören auf temporale Spalten und JSON-Defaults dürfen nicht von dialektspezifischen
Literalregeln abhängen. Vor externen DB-Migrationen ist ein nativer, restore-getesteter Dump Pflicht.

## Verwandte Seiten

- [Datenmodell](./datenmodell.md)
- [Datenbank](./datenbank.md)
