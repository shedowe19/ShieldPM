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

## Migrations-Chronologie (76 Dateien)

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

## Verwandte Seiten

- [Datenmodell](./datenmodell.md)
- [Datenbank](./datenbank.md)
