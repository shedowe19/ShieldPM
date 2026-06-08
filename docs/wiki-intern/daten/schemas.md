# Daten-Schemas

## Zweck

Dokumentation der Datenbankschema-Struktur und Konventionen.

## Kontext

Die Datenbankschemas werden durch Knex.js-Migrationen definiert und durch Objection.js-Modelle abgebildet.

## Wichtige Dateien

- `backend/migrations/` — 74 Migrationsdateien definieren das Schema
- `backend/models/` — 27 Objection.js-Modelle bilden die ORM-Schicht

## Schema-Konventionen

| Konvention        | Beschreibung                                                      |
| ----------------- | ----------------------------------------------------------------- |
| Primärschlüssel   | `id` (auto-incrementing integer)                                  |
| Timestamps        | `created_on`, `modified_on` als `string` (nicht `datetime`)       |
| Booleans (SQLite) | Gespeichert als `0`/`1` Integer, konvertiert im Model             |
| Fremdschlüssel    | `*_id` Namenskonvention (z.B. `certificate_id`, `access_list_id`) |
| Tabellenname      | snake_case (z.B. `proxy_host`, `access_list_auth`)                |

## Modell-Hooks

Die Objection.js-Modelle verwenden folgende Lifecycle-Hooks:

- `$beforeInsert()` — Setzt `created_on` und `modified_on`
- `$beforeUpdate()` — Aktualisiert `modified_on`
- `$afterGet()` — Konvertiert Booleans, berechnet abgeleitete Felder (z.B. `domain_names`)

## Verhalten

- Migrationen laufen beim Anwendungsstart automatisch
- Alle Migrationen sind abwärtskompatibel (`up` + `down`)
- Migrationen verwenden ESM (`export { up, down }`)

## Proxy-Host-Upstream-Felder

`proxy_host` enthält zusätzlich zur klassischen Einzelziel-Konfiguration neue Felder für Upstream-Pools:

| Feld                    | Typ     | Zweck                                                                 |
| ----------------------- | ------- | --------------------------------------------------------------------- |
| `upstream_servers`      | JSON    | Optionales Array aus Upstream-Servern für die Default-Proxy-Location  |
| `load_balancing_method` | String  | Nginx-Upstream-Methode, Standard `round_robin`                        |
| `upstream_http_version` | String  | HTTP-Upstream-Version für HTTP/HTTPS-Proxying, Standard `1.1`         |
| `ssl_early_data`        | Integer | Boolean-Flag für TLS 1.3 0-RTT pro Proxy-Host (`0`/`1` in SQLite/DBs) |

`upstream_servers` wird im Objection-Modell als JSON-Attribut behandelt. API-Requests/Responses werden im Frontend automatisch zwischen camelCase (`upstreamServers`) und snake_case (`upstream_servers`) gewandelt.

Die API-Schemas begrenzen `upstream_servers.host` und `fail_timeout`, weil diese Werte direkt in Nginx-Direktiven gerendert werden. Es dürfen keine freien Nginx-Fragmente oder Secrets im JSON gespeichert werden.

## Analytics-Detailfelder

`analytics_logs` speichert pro Request zusätzliche Protokoll-/TLS-Metadaten aus dem Nginx-JSON-Log:

| Feld                | Typ    | Zweck                                       |
| ------------------- | ------ | ------------------------------------------- |
| `http3`             | String | HTTP/3-/QUIC-Indikator aus `$http3`         |
| `ssl_early_data`    | String | TLS-1.3-0-RTT-Indikator                     |
| `ssl_sigalg`        | String | TLS-Signaturalgorithmus                     |
| `ssl_client_sigalg` | String | Client-Signaturalgorithmus, falls vorhanden |

Diese Felder gehören zur Detailtabelle, nicht zur aggregierten Tabelle `analytic_count`, weil sie einzelne Requests beschreiben.

## Abhängigkeiten

- Knex.js für Schema-Definition
- Objection.js für Modell-Abbildung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Datenmodell](./datenmodell.md)
- [Migrationen](./migrationen.md)
- [Datenbank](./datenbank.md)
