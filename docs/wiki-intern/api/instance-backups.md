# Instanzbackup-API

## Rechte und Ausführung

Die Routen liegen unter `/api/backups` und verwenden die normale JWT-/Session-Authentifizierung.
Jeder Zugriff, einschließlich Katalog und Download, verlangt `settings:update`. Im Demo-Modus sind alle
Operationen gesperrt. Antworten erhalten `Cache-Control: no-store`.

Erstellen, Prüfen und Restore-Vormerken antworten mit HTTP `202` und einem Hintergrundauftrag.
Die Annahme bestätigt noch keinen erfolgreichen Abschluss. Der Client fragt `GET /api/backups` ab und
wertet `jobs[].status`, `phase`, `result` und `error` aus. Es gibt höchstens einen aktiven Auftrag oder
Upload gleichzeitig. Sensible POST-Routen teilen ein Rate-Limit von zehn Anfragen pro Minute je Client-IP.

Die Schnittstelle verarbeitet vollständige, eigene und administrativ vertrauenswürdige Instanzarchive.
Ein gültiges Passwort bestätigt keine harmlose Datenbank-/Nginx-Konfiguration. Ein externer Datenbankklon
ist keine Sandbox für feindliches SQL. Voraussetzungen, unterstützte Provider, TLS und Rollback-Grenzen
stehen im [Modulhandbuch](../module/instance-backups.md).

## Endpunkte

| Methode | Pfad                         | Erfolg | Bedeutung                                                             |
| ------- | ---------------------------- | ------ | --------------------------------------------------------------------- |
| GET     | `/api/backups`               | `200`  | Archivkatalog, Auftragshistorie, ausstehender Restore und Limits      |
| POST    | `/api/backups`               | `202`  | Verschlüsseltes Instanzarchiv im Hintergrund erstellen                |
| POST    | `/api/backups/upload`        | `201`  | Ein verschlüsseltes Archiv als Multipart-Datei `archive` aufnehmen    |
| GET     | `/api/backups/:id/download`  | `200`  | Archiv als `shieldpm-<id>.spmb` herunterladen                         |
| POST    | `/api/backups/:id/preflight` | `202`  | Entschlüsseln, Kompatibilität und isolierte Wiederherstellung prüfen  |
| POST    | `/api/backups/:id/restore`   | `202`  | Erneut prüfen und für den nächsten Neustart vormerken                 |
| DELETE  | `/api/backups/pending`       | `200`  | Noch nicht aktivierten Restore einschließlich externem Klon abbrechen |
| DELETE  | `/api/backups/:id`           | `200`  | Gespeichertes Archiv und Katalogeintrag löschen                       |

`:id` ist die vom Server vergebene kanonische UUID in Kleinbuchstaben; Pfadbestandteile und abweichende Formate werden abgewiesen. Ein für Restore vorgemerktes Archiv muss vor dem Löschen
abgebrochen werden. Während eines laufenden Auftrags oder Uploads sind konkurrierende Änderungen gesperrt.
Ein bereits aktivierter Restore lässt sich über die laufende Instanz nicht abbrechen.

## JSON-Eingaben

Erstellen, Prüfen und Vormerken verwenden ein geschlossenes Schema: Unbekannte Eigenschaften werden
abgewiesen. `password` ist erforderlich, mindestens zwölf Zeichen lang und im API-Schema auf 1.024 Zeichen
begrenzt; die Kryptografie verlangt zusätzlich höchstens 1.024 UTF-8-Bytes. `name` ist optional und höchstens
80 Zeichen lang. `confirmation` ist ebenfalls auf 80 Zeichen begrenzt und beim Restore exakt zu prüfen.

Erstellen:

```json
{
  "name": "Vor dem Update",
  "password": "<separat aufbewahrtes Archivpasswort>"
}
```

Prüfen:

```json
{ "password": "<Archivpasswort>" }
```

Vormerken:

```json
{
  "password": "<Archivpasswort>",
  "confirmation": "RESTORE <id>"
}
```

Die Restore-Anfrage führt ihre eigene vollständige Prüfung aus. Ein vorheriger erfolgreicher Preflight
ersetzt sie nicht. Keine dieser Anfragen startet den Container automatisch neu oder ersetzt die aktive
Datenbank während des laufenden Betriebs.

## Archivupload und Download

`POST /upload` erwartet `multipart/form-data` mit genau einer Datei unter dem Namen `archive`.
Maximalgröße ist 8.589.934.592 Bytes, also 8 GiB. Der Upload wird über eine private temporäre Datei
verarbeitet. Jede Anfrage erhält ein eigenes privates Unterverzeichnis. Erfolg, ungültige Felder, mehrere
Dateien, Größenüberschreitung, Parserfehler und Verbindungsabbruch räumen ausschließlich dieses Verzeichnis
auf; der Operationsslot wird erst danach freigegeben. Aktive Multipart-Writer werden beim Abbruch beendet.
Lese- und Löschpfade bleiben auf diese anfrageeigenen Dateien begrenzt; Symlinks werden nicht als Archive gelesen. Die Datei muss die Formatkennung `SPMBKP01` besitzen und mindestens 52 Bytes groß sein.
Ein erfolgreicher Upload erzeugt einen neuen lokalen Archiveintrag mit Name `Imported backup`;
`app_version` und `database` sind dort zunächst `null`.

Diese Prüfung öffnet den verschlüsselten Inhalt noch nicht. Passwort, Authentizität, Dateihashes,
Datenbankprovider und Versionskompatibilität werden erst beim Preflight oder Vormerken geprüft.
Der Download liefert ausschließlich das verschlüsselte `.spmb`-Archiv. API-Antworten enthalten weder
Archivpasswort noch Manifest, Dateipfade, Zertifikatschlüssel oder Datenbankzugangsdaten.

## Statusantwort und Aufträge

`GET /api/backups` liefert:

```json
{
  "backups": [
    {
      "id": "<Archiv-ID>",
      "name": "Vor dem Update",
      "created_on": "2026-10-17T12:00:00.000Z",
      "app_version": "4.4.1",
      "database": "sqlite",
      "size": 123456
    }
  ],
  "jobs": [],
  "pending": null,
  "limits": { "max_bytes": 8589934592 },
  "activation": "next_restart"
}
```

Die Katalog-Provider sind `sqlite`, `mysql`, `postgres` oder bei ungeprüften Uploads `null`.
`jobs` enthält maximal 50 Einträge, neueste zuerst, und wird im Arbeitsspeicher geführt.
Ein Auftrag enthält `id`, `kind`, `phase`, `status`, `created_on`, `result` und `error`.

| Feld     | Werte und Bedeutung                                                                     |
| -------- | --------------------------------------------------------------------------------------- |
| `kind`   | `create`, `preflight`, `restore`                                                        |
| `phase`  | `queued`, `snapshot`, `encrypting`, `decrypting`, `database`, `validating`, `completed` |
| `status` | `running`, `completed`, `failed`                                                        |
| `result` | Bis zum Erfolg `null`; danach Katalogeintrag oder Prüfergebnis                          |
| `error`  | `null` oder eine öffentliche Fehlermeldung ohne native Diagnosen und Secrets            |

Ein erfolgreiches Prüfergebnis enthält `id`, `valid: true`, `app_version`, `database`, `files` und
`activation`. Letzteres ist beim reinen Preflight `null`, beim vorgemerkten Restore `next_restart`.
Die Aufträge verschwinden nach einem Backend-Neustart; Katalog und Vormerkung sind persistent.

`pending` ist `null` oder ein Objekt aus `id`, `phase` und `created_on`. `pending` bedeutet geprüft und
für den nächsten Start vorgemerkt. `rejected` bedeutet, dass die Startprüfung die Version oder den
unveränderten Staging-Inhalt nicht bestätigen konnte. `activating` und `activated` beschreiben die
Offline-Aktivierung; erst die Bestätigung durch das bereitgestellte Backend entfernt die Vormerkung.
Ein weiterer Start vor dieser Bestätigung stellt die vorherigen Instanzdateien aus dem Journal wieder her.

Abbrechen liefert `{ "canceled": true }`, Löschen `{ "deleted": true }`.

## Fehler und Prüfgrenzen

Fehlende Berechtigung oder Demo-Modus ergeben `403`, ungültige Eingaben beziehungsweise konkurrierende
Operationen eine Validierungsantwort, unbekannte Download-Archive `404` und das Rate-Limit `429`.
Ein Größenverstoß beim Multipart-Upload kann bereits vor der Archivverarbeitung mit `413` enden.
Nach `202` auftretende Fehler stehen im Auftrag mit `status: "failed"`; der Client darf aus einem
erfolgreichen HTTP-Annahmestatus keine Wiederherstellbarkeit ableiten.

Preflight und Vormerken verlangen dieselbe ShieldPM-Version und denselben Datenbankprovider, vorhandene
Migrationsdateien sowie zur Manifestbeschreibung passende Tabellen-/Migrationslisten. Sie prüfen
Dateihashes, sichere Pfade und Links, begrenzte Größen und Eintragszahlen, Datenbankintegrität beziehungsweise
Providerimport sowie Nginx und aktivierte Wasm-Ketten. `.env` wird nur auf Shell-Syntax geprüft.
Nicht geprüft wird die spätere Erreichbarkeit sämtlicher Upstreams oder externer Integrationen.

Audit-Einträge verwenden den vorhandenen Typ `setting`, `setting_id: "instance-backups"` und beschreiben
die Operation mit Archiv-ID, gegebenenfalls Name und Provider. Passwörter und Datenbanksecrets werden
nicht in Audit, Katalog oder öffentliche Jobfehler übernommen.

## Implementierung und Schemata

- `backend/routes/backups.js` und `backend/internal/instance-backups.js`
- `backend/schema/components/instance-backup-input.json`
- `backend/schema/components/instance-backup-record.json`
- `backend/schema/components/instance-backup-job.json`
- `backend/schema/components/instance-backup-state.json`
- `backend/schema/paths/backups/` und `backend/schema/swagger.json`

## Verwandte Seiten

- [Verschlüsselte Instanzbackups](../module/instance-backups.md)
- [API-Überblick](./ueberblick.md)
- [Routen](./routen.md)
- [Schemas](./schemas.md)
