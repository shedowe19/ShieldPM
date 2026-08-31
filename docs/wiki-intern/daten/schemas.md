# Daten-Schemas

## Zweck

Dokumentation der Datenbankschema-Struktur und Konventionen.

## Kontext

Die Datenbankschemas werden durch Knex.js-Migrationen definiert und durch Objection.js-Modelle abgebildet.

## Wichtige Dateien

- `backend/migrations/` — versionierte ESM-Migrationen definieren das Schema
- `backend/models/` — Objection.js-Modelle bilden die ORM-Schicht

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
- Migrationen stellen `up` und gezielte `down`-Pfade bereit; ein externer DB-Rollback bleibt eine Operatoraufgabe
- Migrationen verwenden ESM (`export { up, down }`)

## Abhängigkeiten

- Knex.js für Schema-Definition
- Objection.js für Modell-Abbildung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Datenmodell](./datenmodell.md)
- [Migrationen](./migrationen.md)
- [Datenbank](./datenbank.md)
