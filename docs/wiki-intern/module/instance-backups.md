# Verschlüsselte Instanzbackups

## Zweck und Bedienung

Unter **Einstellungen → Backups** können Administratoren vollständige ShieldPM-Instanzarchive erstellen,
herunterladen, hochladen, prüfen und zur Wiederherstellung vormerken. Alle Zugriffe erfordern
`settings:update`; im Demo-Modus ist die Funktion deaktiviert. Ein GitOps-Export bleibt ein eigener,
selektiver Konfigurationsweg und ersetzt dieses Backup nicht.

Ein Archiv erhält ein eigenes Passwort mit mindestens zwölf Zeichen und höchstens 1.024 UTF-8-Bytes.
Dieses Passwort muss außerhalb der Instanz aufbewahrt werden: ShieldPM bietet keine Passwortwiederherstellung.
Die Oberfläche zeigt laufende Aufträge, Ergebnisse und einen vorgemerkten Restore an. Ein erfolgreich
angenommener Auftrag ist zunächst Hintergrundarbeit; erst sein Status `completed` bestätigt den Abschluss.
Die Wiederherstellung wird nach erneuter Prüfung für den nächsten Prozess-/Containerstart vorgemerkt.
Der Benutzer bestätigt dafür genau `RESTORE <Archiv-ID>`.

## Inhalt und Verschlüsselung

Gesichert wird der Inhalt von `DATA_PATH`, standardmäßig `/data`: unter anderem Zertifikate, private
Schlüssel, Instanzschlüssel, `.env`, generierte und eigene Nginx-Konfigurationen sowie Wasm-Artefakte.
Das interne Verzeichnis `instance-backups`, ein vorhandenes `.database`-Arbeitsverzeichnis und Laufzeitsockets
oder Gerätedateien werden ausgelassen. Die aktive SQLite-Datei samt WAL/SHM wird durch einen konsistenten
nativen SQLite-Snapshot ersetzt. Bei PostgreSQL und MySQL/MariaDB enthält das Archiv stattdessen einen
nativen Datenbankdump. Es sichert keine externen Dienste, Container-Images, Datenbankserver-Rollen oder
Dateien außerhalb von `DATA_PATH`.

Die Erstellung hält die globale Konfigurationssperre für Dateikopie und Datenbanksnapshot. Das ist keine
dateisystemweite Momentaufnahme gegen beliebige externe Schreibprozesse; eine während der Kopie veränderte
Dateigröße führt zum Abbruch. Sichere Symlinks innerhalb des Datenverzeichnisses bleiben erhalten, Links
nach außen, verkettete Ausbrüche und Linkzyklen werden abgewiesen.

Das Format `.spmb` verwendet gzip, AES-256-GCM und einen per scrypt abgeleiteten Schlüssel
(`N=32768`, `r=8`, `p=1`), einen zufälligen Salt und eine zufällige IV. Der Header ist authentifiziert;
das verschlüsselte Manifest enthält unter anderem SHA-256 je Datei, Datenbanktyp, Tabellen und Migrationen.
Archivdateien liegen mit Modus `0600`, das Backup-Verzeichnis mit `0700`. Arbeitsdateien und Prüfdaten
können entschlüsselte Secrets enthalten und bleiben ebenfalls in diesem privaten Verzeichnis.

Archiv- und Metadaten-IDs müssen primitive Zeichenketten im kanonischen UUID-Format mit Kleinbuchstaben sein;
beide Dateipfade werden unabhängig auf das private Backup-Verzeichnis begrenzt. Entschlüsselung und Download
öffnen einmal mit `O_NOFOLLOW` und verwenden denselben Dateideskriptor für Typ-/Größenprüfung und Lesen.
Ein nachträglich ausgetauschter Pfad kann dadurch nicht auf einen anderen Dateiinhalt umleiten. Multipart-Uploads
werden ausschließlich aus direkten Dateien des privaten Upload-Verzeichnisses gelesen; Symlinks als
Upload-Verzeichnis oder temporäre Datei werden abgewiesen. Jede Upload-Anfrage besitzt ein eigenes
Arbeitsverzeichnis; auch ungültige Multipart-Felder, überschrittene Limits, Parserfehler und Abbrüche
beenden aktive Writer und räumen diesen Bereich auf, bevor der Operationsslot frei wird.

Katalog, öffentliche Auftragsergebnisse und Audit-Einträge enthalten weder Passwort noch Datenbankzugangsdaten,
Manifestinhalt oder private Dateipfade. Der Katalog zeigt nur ID, Name, Erstellzeit, Version, Provider und Größe.

## Datenbankvoraussetzungen und TLS

| Provider      | Snapshot und Wiederherstellungsziel                                                                              | Erforderliche Rechte und Einschränkungen                                                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite        | Native Backup-API einschließlich bestätigter WAL-Daten; Wiederherstellung zunächst in privaten Dateien           | Zugriff auf die Instanzdateien; `quick_check`, Tabellenliste und Migrationshistorie werden geprüft.                                                                                                                                                                                             |
| PostgreSQL    | `pg_dump --format=custom`, Wiederherstellung mit `pg_restore` in eine neue Datenbank `shieldpm_restore_<Zufall>` | Die konfigurierte Rolle muss Quelldaten lesen, Datenbanken erstellen und ihre Klone wieder löschen sowie das Schema im Klon anlegen können. `CREATEDB` und passende Verbindungs-/Objektrechte müssen administrativ bereitgestellt sein. Besitzer und ACLs aus dem Dump werden nicht übernommen. |
| MySQL/MariaDB | `mariadb-dump --single-transaction`, Import mit `mariadb` in einen neuen Klon                                    | Die konfigurierte Rolle benötigt Leserechte auf der Quelle sowie passende `CREATE`-/`DROP`- und Schema-/Datenrechte für die dynamischen Klondatenbanken. Die Quelltabellen müssen InnoDB verwenden. Benutzer und Grants werden nicht aus dem Archiv wiederhergestellt.                          |

Bei externen Providern verwenden Prüfung und Restore den aktuell konfigurierten Server und dessen
Zugangsdaten. Der ursprüngliche Datenbankname wird nicht überschrieben. Beim Vormerken bleibt der geprüfte
Klon bestehen; nach erfolgreichem Neustart wird dieser Klon zur Anwendungsdatenbank. Eine reine Prüfung
oder ein Abbruch vor Aktivierung entfernt den temporären Klon. Nach erfolgreicher Aktivierung bleiben
die ursprüngliche Datenbank und der private Dateicheckpoint für eine bewusste administrative Bereinigung erhalten.

Native Clients übernehmen die wirksame TLS-Konfiguration: PostgreSQL verwendet bei verifizierter Verbindung
`verify-full`, bei ausdrücklich deaktivierter Zertifikatsprüfung `require`; ohne TLS-Konfiguration `disable`.
MySQL/MariaDB erhält entsprechende TLS- und Zertifikatsprüfoptionen über eine private Clientdatei.
CA und zusammengehörige Clientzertifikat-/Schlüsselpaare werden übernommen. Nicht abbildbare TLS-Optionen
oder widersprüchliche Identitätsprüfung werden abgewiesen, statt die Verbindung stillschweigend abzuschwächen.
Für verifiziertes TLS ohne eigene CA wird bei PostgreSQL der System-CA-Bestand verwendet.

## Prüfung und Vertrauensgrenze

Wiederhergestellt werden ausschließlich eigene, administrativ vertrauenswürdige Archive. Ein gültiges Passwort,
GCM-Tag oder korrekte Dateihashes beweisen die Integrität des Archivs, aber nicht die Harmlosigkeit von SQL,
Lua, Nginx-Konfiguration oder einer später geladenen `.env`. Die Datenbankprüfung in einem separaten Klon
ist **keine Sandbox für feindliches SQL**; der Importclient verwendet die konfigurierten Datenbankrechte.

Die Prüfung verlangt dieselbe ShieldPM-Version und denselben Datenbankprovider. Jede im Archiv verzeichnete
Migration muss in der Installation vorhanden sein. Nach Wiederherstellung müssen Tabellenliste und
Migrationshistorie mit dem Manifest übereinstimmen. Diese Prüfung ist kein vollständiger semantischer Vergleich
aller Spalten, Anwendungsdaten oder Berechtigungen.

Für PostgreSQL und MySQL/MariaDB werden nicht unterstützte benutzerdefinierte Routinen, Trigger, Views und
weitere programmierbare Objekte abgewiesen. PostgreSQL erlaubt keine zusätzlichen Benutzerschemata,
Foreign-/Materialized-Views oder Erweiterungen außer `plpgsql`; MySQL/MariaDB keine Events und keine
nichttransaktionalen Quelltabellen. Zusätzlich werden der PostgreSQL-Dumpkatalog beziehungsweise normale
MySQL-Dumpanweisungen auf nicht unterstützte Konstrukte geprüft. Der MySQL-Parser ist ein begrenzter
lexikalischer Ablehnungsfilter, kein vollständiger SQL-Beweis. SQLite verwendet die oben genannten
Integritäts-/Manifestprüfungen und besitzt keinen entsprechenden allgemeinen SQL-Sicherheitsfilter.

Nginx wird mit getrennten Konfigurationskopien, umgeschriebenen Daten-/Runtime-Pfaden und eigenen temporären
Verzeichnissen geprüft. Aktivierte Wasm-Ketten werden zusätzlich mit den gesicherten Instanzschlüsseln in
einem separaten Arbeitsverzeichnis ausgeführt. Die `.env` erhält eine Syntaxprüfung mit `sh -n`, ohne sie
im laufenden Backend auszuführen. Diese Prüfungen garantieren weder spätere Upstream-Erreichbarkeit noch
funktionierende externe Integrationen und machen vertrauenswürdige eigene Konfiguration nicht überflüssig.

## Aktivierung, Journal und Rollback

1. Entschlüsseln, Dateihashes und Kompatibilität prüfen, Datenbankprobe durchführen und Nginx/Wasm prüfen.
2. Geprüfte Dateien und gegebenenfalls den externen Klon privat vormerken. Das laufende System bleibt aktiv.
   Vor dem Neustart lässt sich der ausstehende Restore in der Oberfläche abbrechen; dabei wird sein Klon entfernt.
3. Beim nächsten Start wendet `backup-restore.js --apply` den Restore vor `.env`, Prerun-Skripten, Migrationen
   und Diensten an. Version und erneut berechnete Staging-Hashes müssen weiterhin passen; sonst bleibt der
   Restore als `rejected` liegen und kann abgebrochen werden.
4. Vor dem ersten Dateiverschieben wird das vollständige Aktivierungsjournal dauerhaft geschrieben.
   Die bisherigen Instanzdateien werden privat als `previous` erhalten. Ein Fehler beim Verschieben löst
   eine Rücknahme aus.
5. Erst nach Backend-Startvorbereitung und geöffnetem Backend-Socket wird die Aktivierung bestätigt.
   Ein nächster Start mit einem noch unbestätigten Zustand `activating` oder `activated` stellt den vorherigen
   Dateizustand wieder her. Der Checkpoint wird auch nach erfolgreichem Abschluss nicht automatisch gelöscht.

`--apply` ist ein Offline-Startschritt und darf nicht aus einem laufenden Backend aufgerufen werden.
Das automatische Rückrollen ist eine Wiederanlaufabsicherung, keine fortlaufende Verfügbarkeitsüberwachung
nach einem bereits bestätigten Start.

## Grenzen und Betrieb

- Höchstens ein Hintergrundauftrag oder Upload gleichzeitig, höchstens 50 katalogisierte Archive und
  50 Auftragseinträge im Arbeitsspeicher. Auftragshistorie überlebt keinen Backend-Neustart; Archive und
  vorgemerkte Aktivierung bleiben auf Datenträger erhalten.
- Größenlimit 8 GiB sowohl für erzeugte und hochgeladene Archive als auch den entpackten Datenstrom; Manifest höchstens 16 MiB,
  höchstens 30.000 Archiveinträge einschließlich Verzeichnissen und Links. Beim erzeugten Archiv sind Header und Authentifizierungstag im Größenlimit enthalten.
- Die Restore-Prüfung verlangt mindestens das Dreifache der deklarierten Dateigrößen zuzüglich 64 MiB
  freien Speicher auf dem Backup-Dateisystem. Das ersetzt keine Kapazitätsplanung für externe Datenbankklone
  oder dauerhaft behaltene Rollback-Checkpoints.
- Native Unterprozesse besitzen begrenzte Ausgabe und Laufzeit, normalerweise fünf Minuten, Nginx-Prüfung
  eine Minute und `.env`-Syntaxprüfung zehn Sekunden. Ein entsprechend großer oder langsamer Dump kann daran scheitern.
- Upload prüft zunächst nur Formatkennung und Größe. Erst die passwortgestützte Prüfung entschlüsselt das
  Archiv und bestätigt seine Kompatibilität. Das Hochladen allein bestätigt keinen verwendbaren Restore.

## Wichtige Dateien und Tests

`backend/lib/instance-backup.js` implementiert Archiv, Provider-Snapshots und Aktivierungsjournal;
`backend/lib/backup-database-safety.js` die Grenzen unterstützter externer Datenbankschemas.
`backend/internal/instance-backups.js` verwaltet Rechte, Aufträge und Audit;
`backend/routes/backups.js` die API. `backend/backup-restore.js`, Entrypoint und Backend-Start bestätigen
den Offline-Restore. Die Oberfläche liegt in `frontend/src/pages/Settings/Backups.tsx`.

Gezielte Tests: `backend/test/lib/instance-backup.spec.js`,
`backend/test/lib/instance-backup-providers.spec.js`, `backend/test/internal/instance-backups.spec.js`
und `scripts/tests/test_backup_ops.py`. Provider-Tests mit gemockten Clients belegen deren Aufrufvertrag;
sie ersetzen keinen Restore-Test gegen die tatsächlich eingesetzte PostgreSQL-/MariaDB-Version und Rolle.

## Verwandte Seiten

- [Instanzbackup-API](../api/instance-backups.md)
- [GitOps](./gitops.md)
- [Wasm-Filter](./wasm-filter.md)
- [Nginx-Engine](./nginx-engine.md)
