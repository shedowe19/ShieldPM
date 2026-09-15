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

+## Vollständige Dateiliste (Prüfstand 2026-09-15)

- +Die Auswahl oben erklärt die fachlichen Meilensteine. Diese Pfadliste enthält alle 77 versionierten Migrationen und ist
  +der direkte Abgleichspunkt für LLMs und Reviews:
-
- backend/migrations/20180618015850_initial.js
  backend/migrations/20180929054513_websockets.js
  backend/migrations/20181019052346_forward_host.js
  backend/migrations/20181113041458_http2_support.js
  backend/migrations/20181213013211_forward_scheme.js
  backend/migrations/20190104035154_disabled.js
  backend/migrations/20190215115310_customlocations.js
  backend/migrations/20190218060101_hsts.js
  backend/migrations/20190227065017_settings.js
  backend/migrations/20200410143839_access_list_client.js
  backend/migrations/20200410143840_access_list_client_fix.js
  backend/migrations/20201014143841_pass_auth.js
  backend/migrations/20210210154702_redirection_scheme.js
  backend/migrations/20210210154703_redirection_status_code.js
  backend/migrations/20210423103500_stream_domain.js
  backend/migrations/20211108145214_regenerate_default_host.js
  backend/migrations/20240427161436_stream_ssl.js
  backend/migrations/20240711144745_change_incoming_port_to_string.js
  backend/migrations/20240921100301_regenerate_default_host.js
  backend/migrations/20241230192345_change_forwarding_port_to_string.js
  backend/migrations/20250123132545_allow_empty_forwarding_port.js
  backend/migrations/20250518142020_allow_empty_stream_forwarding_port.js
  backend/migrations/20250627140440_stream_proxy_protocol_forwarding.js
  backend/migrations/20251111090000_redirect_auto_scheme.js
  backend/migrations/20251212000000_add_bandwidth_limit.js
  backend/migrations/20251213000000_add_forward_query.js
  backend/migrations/20251225000000_add_maintenance_failure.js
  backend/migrations/20251229000000_add_req_limit.js
  backend/migrations/20251230000000_add_disable_buffering.js
  backend/migrations/20251231000000_analytics.js
  backend/migrations/20251231000000_analytics_logs.js
  backend/migrations/20260101000000_extend_analytics_path.js
  backend/migrations/20260102000000_add_req_limit.js
  backend/migrations/20260103000000_add_access_list_mtls.js
  backend/migrations/20260104000000_fix_req_limit_columns.js
  backend/migrations/20260105000000_add_access_list_mtls.js
  backend/migrations/20260106000000_add_access_list_mtls_internal.js
  backend/migrations/20260107000000_add_maintenance_schedule.js
  backend/migrations/20260108000000_add_cloudflared_tunnel.js
  backend/migrations/20260109000000_add_ai_config.js
  backend/migrations/20260110000000_reset_ai_system_prompt.js
  backend/migrations/20260111000000_add_ai_num_ctx.js
  backend/migrations/20260112000000_add_ai_num_batch.js
  backend/migrations/20260113000000_add_ai_advanced_options.js
  backend/migrations/20260114000000_update_ai_options.js
  backend/migrations/20260115000000_add_system_prompt.js
  backend/migrations/20260116000000_hash_access_list_passwords.js
  backend/migrations/20260118000000_add_gitops_config.js
  backend/migrations/20260119000000_add_git_sync.js
  backend/migrations/20260119000000_add_php_ini_override.js
  backend/migrations/20260119000000_add_php_mode.js
  backend/migrations/20260121000000_add_ddns.js
  backend/migrations/20260121000000_add_service_icon.js
  backend/migrations/20260122000000_add_ddns_ip_ver.js
  backend/migrations/20260122100000_add_tor_onion.js
  backend/migrations/20260122200000_add_terminal_host.js
  backend/migrations/20260123000000_add_user_permission_analytics.js
  backend/migrations/20260123000000_terminal_on_proxy_host.js
  backend/migrations/20260124000000_add_security_crowdsec.js
  backend/migrations/20260126000000_add_host_notes.js
  backend/migrations/20260126010000_add_dashboard_notes.js
  backend/migrations/20260126020000_add_index_file.js
  backend/migrations/20260127000000_add_chat_integration.js
  backend/migrations/20260127000000_add_user_avatar.js
  backend/migrations/20260128000000_add_analytic_count_composite_index.js
  backend/migrations/20260129000000_add_anubis.js
  backend/migrations/20260219120000_add_anubis_rules.js
  backend/migrations/20260221220000_add_core_indexes.js
  backend/migrations/20260222000000_normalize_domain_names.js
  backend/migrations/20260302223641_add_missing_permissions.js
  backend/migrations/20260316122700_add_auth_sessions.js
  backend/migrations/20260319000001_add_user_2fa.js
  backend/migrations/20260407000000_add_wireguard_tunnel.js
  backend/migrations/20260409000000_add_turbo_loader.js
  backend/migrations/20260505130000_add_user_permission_chat.js
  backend/migrations/20260712000000_fix_analytic_count_aggregation_key.js
  backend/migrations/20260907000000_fix_analytics_log_created_at.js
-

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
