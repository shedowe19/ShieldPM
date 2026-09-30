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

Die Tabelle `certificate` speichert die individuelle ACME-Auswahl im vorhandenen JSON-Feld `meta.letsencrypt_profile` (`standard` oder `shortlived`); dafür gibt es keine zusätzliche Spalte. Neue Erstellungsanfragen ohne Profil speichern die aktuell aufgelöste globale Vorgabe. Diese individuelle Wahl bleibt bei späteren Änderungen der globalen Einstellung erhalten.

Die globale Vorgabe liegt im vorhandenen `setting`-Datensatz mit `id: "acme-profile"`. Die Migration `20260930000000_add_acme_profile_setting.js` legt ihn mit `value: "standard"` und leeren Metadaten an, falls er noch fehlt; vorhandene Werte bleiben bestehen. `20260930000100_normalize_acme_profile_setting.js` ersetzt den früheren `inherit`-Wert durch `standard`, ohne explizit gespeicherte Profilwahlen zu ändern oder Umgebungswerte zu lesen. Die UI speichert `standard` oder `shortlived` als globale Vorgabe.

Certbot persistiert die Ausstellungsoptionen zusätzlich je Lineage in `/data/tls/certbot/renewal/npm-<id>.conf`. ShieldPM wendet bei jeder Erneuerung pro Zertifikat dessen explizites Profil oder die aktuelle globale Vorgabe erneut an. Standard leert dabei erforderliche und bevorzugte Profiloptionen, sodass alte INI-/Lineage-Profile nicht weiterwirken. Bestehende Zertifikate ohne Profilfeld folgen der globalen Datenbankvorgabe. Siehe [Zertifikate](../module/zertifikate.md) und [Einstellungen](../verwaltung/einstellungen.md).

## Abhängigkeiten

- Knex.js für Schema-Definition
- Objection.js für Modell-Abbildung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Datenmodell](./datenmodell.md)
- [Migrationen](./migrationen.md)
- [Datenbank](./datenbank.md)
