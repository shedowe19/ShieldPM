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
| Primärschlüssel   | Häufig `id` (Auto-Increment-Integer); Ausnahmen wie Einstellungen in der jeweiligen Migration prüfen |
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
- `login_attempts` wird bei Bedarf durch `backend/routes/tokens.js` angelegt und nicht durch eine Datei unter `backend/migrations/`. Der SQLite-Import entdeckt Anwendungstabellen aus dem Schema und berücksichtigt sie beim Datenbankwechsel.

### Zertifikatsprofil

Die Tabelle `certificate` speichert die ACME-Auswahl im vorhandenen JSON-Feld `meta.letsencrypt_profile` (`standard` oder `shortlived`); es gibt keine zusätzliche Spalte oder Migration. Neue Erstellungsanfragen ohne Profil werden mit `standard` gespeichert. Bestehende Datensätze ohne Feld behalten dagegen ihre bisherige Certbot-Konfiguration. Certbot persistiert die Ausstellungsoptionen zusätzlich je Lineage in `/data/tls/certbot/renewal/npm-<id>.conf`. ShieldPM wendet explizite Profile bei jeder Erneuerung pro Zertifikat erneut an, damit eine globale INI-Vorgabe diese Einstellungen nicht überschreibt. Siehe [Zertifikate](../module/zertifikate.md).

## Abhängigkeiten

- Knex.js für Schema-Definition
- Objection.js für Modell-Abbildung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Datenmodell](./datenmodell.md)
- [Migrationen](./migrationen.md)
- [Datenbank](./datenbank.md)
