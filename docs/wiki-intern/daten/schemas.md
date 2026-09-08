# Daten-Schemas

## Zweck

Dokumentation der Datenbankschema-Struktur und Konventionen.

## Kontext

Die Datenbankschemas werden durch Knex.js-Migrationen definiert und durch Objection.js-Modelle abgebildet.

## Wichtige Dateien

- `backend/migrations/` — Versionierte Migrationen definieren das Schema
- `backend/models/` — Objection.js-Modelle bilden die ORM-Schicht

## Schema-Konventionen

| Konvention        | Beschreibung                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Primärschlüssel   | `id` (auto-incrementing integer)                                                                     |
| Timestamps        | Je Tabelle `dateTime` oder `string`; Analytics-Zähler und Log-Erfassungszeit besitzen eigene Formate |
| Booleans (SQLite) | Gespeichert als `0`/`1` Integer, konvertiert im Model                                                |
| Fremdschlüssel    | `*_id` Namenskonvention (z.B. `certificate_id`, `access_list_id`)                                    |
| Tabellenname      | snake_case (z.B. `proxy_host`, `access_list_auth`)                                                   |

## Modell-Hooks

Die Objection.js-Modelle verwenden folgende Lifecycle-Hooks:

- `$beforeInsert()` — Setzt `created_on` und `modified_on`
- `$beforeUpdate()` — Aktualisiert `modified_on`
- `$parseDatabaseJson()` / `$formatDatabaseJson()` — Konvertieren in den betreffenden Modellen Datenbank-Booleans beim Lesen und Schreiben
- Host-spezifische Hooks berechnen abgeleitete Felder, beispielsweise `domain_names` aus der Domainrelation

## Verhalten

- Migrationen laufen beim Anwendungsstart automatisch
- Migrationen exportieren `up` und `down`, sind aber nicht durchgängig rückgängig zu machen. Beispielsweise enthalten frühe Schemaänderungen leere Rollbacks; gehashte Passwörter können nicht in Klartext zurückverwandelt werden. Ein erfolgreicher `down`-Aufruf garantiert daher keine Wiederherstellung des vollständigen früheren Schemas oder Datenstands.
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
