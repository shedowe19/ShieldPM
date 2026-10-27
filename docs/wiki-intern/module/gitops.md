# GitOps

## Zweck

Git-basierte Konfigurationssynchronisierung (Backup, Versionierung, Restore).

## Kontext

GitOps exportiert die unterstützten ShieldPM-Konfigurationsbereiche und Zertifikatsdateien in ein Git-Repository und kann sie importieren. Laufzeitdaten wie Analytics und die lokale Datenbank werden nicht als vollständiges Systembackup gesichert.

## Wichtige Dateien

- `backend/internal/gitops.js` — Export, Import und Git-Synchronisierung
- `backend/lib/gitops-files.js` — sicherer Dateizugriff im GitOps-Verzeichnis
- `backend/routes/gitops.js` — API-Routen
- `frontend/src/pages/Settings/GitOps.tsx` — Konfiguration und manuelle Aktionen

## Verhalten

- Exportiert die Konfiguration als YAML-Dateien unter `/data/gitops/shieldpm-config/` und Zertifikatsdateien als Dateien; die `/export`-API antwortet mit JSON über das Ergebnis, liefert aber kein ZIP-Archiv.
- Synchronisiert mit Remote-Git-Repository via `isomorphic-git`
- Unterstützt HTTP(S)-Repositories mit Tokens für Authentifizierung
- Git-Deploy für Websites ist ein eigenständiger Dienst: [Git-Deploy](./git-deploy.md).

Das GitOps-Repository kann Zertifikatsschlüssel und andere sensible Konfigurationswerte enthalten. Den Remote-Zugriff entsprechend einschränken; `gitops-config` mit den Zugangsdaten für das Git-Remote ist vom Settings-Export ausgenommen.

## Abhängigkeiten

- `isomorphic-git` — Git-Operationen in Node.js
- `js-yaml` — YAML-Serialisierung

### Import- und Exportkonsistenz

Der Export enthält neben Hosts, Streams, Zertifikaten, Benutzern und Einstellungen auch Proxy-Host-Monitor-Konfigurationen, Access Lists mit Auth-/Client-Einträgen, [Firewall-Listen](./ip-firewall.md#gitops-und-wiederherstellung) mit Quellmetadaten und validiertem Cache, Cloudflared-Tunnels und DDNS-Provider. Die Import-Feldlisten entsprechen den tatsächlichen Modellen. Unbekannte Top-Level-Felder werden vor der Datenbankoperation verworfen; Benutzerberechtigungen und Access-List-Kindobjekte werden separat bereinigt. Proxy-Domains werden beim Import in die normalisierte `host_domains`-Relation umgewandelt.

Neue Objekte behalten ihre positiven ganzzahligen Export-IDs, damit Zertifikats-, Benutzer- und Access-List-Referenzen erhalten bleiben. DDNS-Provider haben kein `is_deleted`-Feld; der Import fügt diese Spalte nicht hinzu.

Access Lists werden vor der Host-Aktivierung lokal materialisiert: `meta.authorization_revision` ist
instanzgebundener Laufzeitstatus und wird weder neu exportiert noch aus älteren Backups übernommen.
Nach dem transaktionalen Import der Liste und ihrer Auth-/Client-Kinder erzeugt der normale ACL-Builder
neue unveränderliche Passwort-/CA-Dateien unter der beibehaltenen lokalen Listen-ID. Erst danach wird die
neue zufällige Revision gespeichert und der gemeinsame Host-Batch gerendert. Klartextpasswörter werden
bereits vor dem Datenbankschreiben mit bcrypt-Kostenfaktor 13 gehasht; vollständige bcrypt- und bestehende
APR1-Verifier bleiben erhalten. Fehlerantworten und Logs geben keine importierten Passwortwerte oder
SQL-Diagnosen der ACL-Schreibvorgänge aus. Doppelte Listen-IDs in mehreren Importdateien werden abgewiesen. Proxy-Kandidaten mit fehlender, gelöschter
oder in diesem Lauf fehlgeschlagener ACL-Referenz werden nicht geschrieben; ein abgelehnter Listenimport
darf dadurch keinen neuen öffentlichen Host erzeugen.

Vor ACL-Änderungen werden ihre bisherigen Felder, Auth-/Client-Einträge samt IDs und Zeitstempeln sowie
betroffene Hoststände erfasst. Ein fehlgeschlagener Dateineubau stellt diese Liste sofort wieder her;
ein gescheiterter Gesamt-Reload stellt alle ACL-Kandidaten vor dem Proxy-Rollback und dessen Reload zurück.
Neue abgelehnte Listen werden entfernt. Unveränderliche Kandidatendateien bleiben privat erhalten, weil
bei einem Fehler nach dem Reload-Signal noch auslaufende Worker darauf zugreifen können. Die Full-Sync-
Bereinigung fehlender Listen prüft erst die endgültigen Host-Zuordnungen und lehnt weiterhin zugewiesene
Listen ab, statt einem beibehaltenen Host seine Authentifizierung zu entziehen.

Bei PostgreSQL sperrt jeder Restore-Schreibvorgang mit einer automatisch vergebenen numerischen Modell-ID seine Tabelle innerhalb einer kurzen Datenbanktransaktion. Der Import schreibt die exportierte ID und hebt danach die zugehörige Sequenz bei Bedarf auf die höchste vorhandene ID an. Bereits höhere Sequenzstände bleiben erhalten; normale Neuanlagen können dadurch keine importierten IDs erneut vergeben. Modelle ohne zugehörige Sequenz, Settings mit Text-IDs sowie SQLite und MySQL behalten ihren bisherigen Schreibpfad. Berechtigungs-, Access-List- und Domain-Kindobjekte übernehmen keine exportierten Kind-IDs: Die Importbereinigung entfernt diese Felder beziehungsweise baut Domainrelationen aus `domain_names` neu auf. Diese Beziehungen erhalten neue automatisch vergebene IDs.

`backend/test/internal/gitops-postgres-sequences.spec.js` prüft den tatsächlichen Import mit den produktiven Modellen und der echten PostgreSQL-Engine in PGlite: normale Neuanlagen nach Restore, beide Überschreibmodi, Graph-Insert/-Upsert, bereinigte Relations-IDs, höhere gebrauchte und ungebrauchte Sequenzstände, Sperrreihenfolge und Rücknahme eines fehlgeschlagenen einzelnen Schreibvorgangs. Die Transaktion umfasst diesen Modell-Schreibvorgang und ersetzt keine Gesamttransaktion für den vollständigen Import.

Bei `overwrite` löst ein fehlendes Modulverzeichnis keine Löschung aus. Enthält der Import eines Moduls ungültige Dateien oder schlägt eine Datenbankoperation fehl, wird die Bereinigung fehlender Objekte für dieses Modul übersprungen. Der aktuelle Administrator wird bei der Benutzerbereinigung nicht gelöscht. Importfehler ergeben `success: false`; die Fehlerliste bleibt Teil der Antwort.

Die Bereinigung fehlender Cloudflared-Tunnel stoppt deren lokalen Prozess über den serialisierten Cloudflared-Service, nachdem die Soft-Löschung in der Datenbank erfolgreich war. Ein Stop-Fehler ergibt `success: false`; die bereits persistierte Soft-Löschung bleibt im Rahmen des partiellen Imports bestehen und ein erneuter Import kann den Stop wiederholen. Tunnel, die im Import enthalten sind, werden durch die Bereinigung nicht neu gestartet oder gestoppt.

Firewall-Listen werden vor Proxy-Hosts importiert; zugewiesene Listen werden vor dem Host-Schreibvorgang geprüft. URL-Listen benötigen mindestens einen gültigen gecachten IP-/CIDR-Eintrag, auch bei deaktivierter Quelle; die Prüfung lädt nichts aus dem Netzwerk. Ihre Bereinigung bei `overwrite` wird bis nach allen fehlerfreien Importen, erfolgreicher Nginx-Sammelvalidierung und erfolgreichem Reload verschoben. GitOps hält dafür die gemeinsame Konfigurationssperre und verwendet `bulkGenerateConfigGroupsUnlocked(groups, {throwOnError: true, reload: true})`: Render-, Syntax- und Reloadfehler rollen gestagte Dateien zurück und verhindern die Listenbereinigung. Noch zugewiesene Listen bleiben geschützt; ein älteres Backup ohne `firewall-lists`-Verzeichnis erhält vorhandene Listen.

Vor Import und Export prüft `backend/lib/gitops-files.js` den Konfigurationsbaum und seine Pfadkomponenten auf symbolische Links. Solche Repository-Einträge werden abgewiesen, bevor Datenbank- oder Exportoperationen starten. Generierte Dateien werden innerhalb des GitOps-Verzeichnisses mit `O_NOFOLLOW` und Modus `0600` geschrieben; Export-Dateinamen für Settings kodieren Pfadtrenner. Die Bereinigung verwendet `lstat()` und folgt keinen symbolischen Verzeichnislinks.

Nach erfolgreichem Revert wird ausschließlich der Backend-Prozess per SIGTERM neu gestartet; PID 1 des Containers oder nativen Hosts wird nicht signalisiert.

Proxy-Host-Änderungen einschließlich Full-Sync-Löschungen werden bis zur erfolgreichen Nginx-Aktivierung als Kandidaten behandelt. Scheitert die Aktivierung, stellt GitOps die vorherigen Datenbankfelder, Domainrelationen, Domain-Claims und exakten Konfigurationsdateien wieder her und lädt den vorherigen Stand erneut. Neue abgewiesene Hosts bleiben ausgeblendet. Vorherige und neue Domainnamen bleiben bis zum Aktivierungsergebnis reserviert. Die kurzen Datenbanktransaktionen enden vor den Nginx-Prüfungen und Reloads; dabei laufen keine langsamen Nginx-Befehle unter einer offenen Schreibtransaktion. Revisionshistorie und Laufzeitdienste übernehmen erst den angenommenen Stand.

Die Metadaten früherer Host-Module werden beim Import älterer Backups und beim Export vorhandener Hosts verworfen.
Ein Host mit zuvor aktiven Bindungen wird vor dieser Bereinigung deaktiviert, damit die Entfernung einer früheren
Zugriffsprüfung keine zuvor geschützte Anwendung freigibt. Dies gilt für beide historischen Schreibweisen der
Metadaten. Hosts ohne Bindungen oder mit ausschließlich deaktivierten Bindungen behalten ihren Aktivierungszustand.
Die Bereinigung gilt für Host-Metadaten; die DNS-Zugangsdaten eines Zertifikats bleiben für dessen Wiederherstellung
erhalten. `gitops-import-validation.spec.js` prüft beide Grenzen. `gitops-proxy-activation.spec.js` prüft mit echten
SQLite-Modellen weiterhin fehlgeschlagene Aktivierungen, Domain-Claim-Rücknahme, Full-Sync-Löschungen und exakte
Dateiwiederherstellung.

Der Import ist weiterhin nicht als Gesamttransaktion über alle Module implementiert. Bereits erfolgreich importierte Benutzer, Zertifikate, Einstellungen und externe Integrationen können bei späteren Fehlern bestehen bleiben. ACL- und Proxy-Kandidaten erhalten die oben beschriebene Aktivierungskompensation; ein bereits erfolgreich aktivierter Stand wird wegen eines nachfolgenden Integrationsfehlers nicht zurückgenommen. GitOps verwendet `isomorphic-git` über HTTP(S); native SSH-Schlüssel-Authentifizierung wird nicht unterstützt. Die Oberfläche bietet deshalb ausschließlich Token-Authentifizierung an.

### Einstellungen und manuelle Aktionen

Die GitOps-Seite zeigt bei fehlgeschlagener Erstabfrage keine speicherbaren Standardwerte an. Verbindungstests und Git-Aktionen verwenden die gespeicherte Backend-Konfiguration und bleiben gesperrt, solange die angezeigten Einstellungen ungespeicherte Änderungen enthalten. Während einer Mutation sind weitere Git-Aktionen und Änderungen der Konfiguration gesperrt. Ein neu eingegebener Token wird nach erfolgreichem Speichern aus dem Formular entfernt; leere Token-Felder erhalten die gespeicherten Zugangsdaten.

Import- und Revert-Dialoge schließen nur bei einer Antwort mit `success: true`. Die Seitenzustände werden in `frontend/src/pages/Settings/GitOps.test.tsx` geprüft.

### Synchronisation und Wiederholungen

Bei deaktivierter GitOps-Konfiguration werden weder Startup-Pull noch automatischer Export oder Push ausgeführt.
Die deaktivierte Konfiguration wird unmittelbar vor der automatischen Ausführung erneut gelesen; manuelle Push-
und Pull-Aufrufe lehnen den Netzwerkzugriff ebenfalls ab. Das Speichern von `enabled: false`, `auto_push: false`
oder einer leeren Repository-URL entfernt zusätzlich einen noch ausstehenden Debounce-Timer. Er wird durch
späteres Wiedereinschalten nicht wiederbelebt; erst eine neue Konfigurationsänderung plant einen neuen Backup-Lauf.
Bereits gestartete Netzwerkoperationen werden durch das Entfernen eines Timers nicht rückwirkend abgebrochen.
`gitops-disabled.spec.js` prüft diese Grenzen mit den tatsächlichen Service-Einstiegspunkten und kontrollierter Zeit.

Die Referenzprüfung beim Erstellen eines Hosts läuft vor dessen GitOps-Autopush. `certificate_id: 0` und die
Zeichenkette `"0"` bedeuten dort ausdrücklich „kein Zertifikat“ und dürfen keine Zertifikat-0-Abfrage auslösen.
Dies gilt unabhängig vom GitOps-Schalter; die Ressourcenprüfung für andere Zertifikate bleibt erhalten.

Jedes exportierte Modul enthält eine `.gitkeep`-Datei. Damit bleibt auch ein leeres Modul im Git-Commit erhalten und ein vollständiger Restore kann dessen letztes Objekt löschen. Fehlende Verzeichnisse älterer Backups bleiben weiterhin unverändert. `overwrite` akzeptiert nur einen echten Boolean; Fehler beim Abruf zu löschender Objekte werden als Importfehler zurückgegeben.

Vor dem Commit werden entfernte Dateien ausdrücklich aus dem Git-Index gelöscht. Ein erneuter Push wird auch bei unverändertem Arbeitsverzeichnis ausgeführt, damit ein zuvor fehlgeschlagener Upload nachgeholt wird. Vor Push und Pull wird `origin` auf die aktuell konfigurierte URL gesetzt; Zugangsdaten gehen dadurch nicht an einen früheren Repository-Endpunkt. Push verwendet den aktuellen lokalen Commit und den konfigurierten Remote-Branch.

Push und Pull übergeben zusätzlich die Repository-URL aus demselben Konfigurationsstand wie die Zugangsdaten direkt an `isomorphic-git`. Eine gleichzeitige Änderung von `origin` kann dadurch den authentifizierten Netzwerkaufruf nicht auf ein anderes Repository umleiten. `fourth-integrations-gitops-destination.spec.js` prüft beide Wege mit einem echten lokalen Git-Repository und einem HTTP-Stub, ohne einen Provider zu kontaktieren.

Sync-Metadaten liegen in `setting.meta`. Nach Netzwerkoperationen wird die private Konfiguration erneut geladen, damit zwischenzeitlich aktualisierte Zugangsdaten erhalten bleiben. Bereits ausgecheckte Exportdateien werden beim Schreiben ebenfalls auf Modus `0600` gesetzt. Regressionen prüfen echte lokale Git-Commits, Push-Wiederholungen und die Entschlüsselbarkeit unveränderter Zugangsdaten.

### Aktivierung importierter Cloudflared-Tunnel

Ein direkter Import aktiviert neu angelegte Tunnel und geänderte Tokens nach der erfolgreichen Nginx-Aktivierung
über die serialisierte Cloudflared-Lifecycle-Queue. Unveränderte Tunnel behalten ihren bisherigen Prozesszustand.
Exportierte Statusfelder werden nicht als lokaler Laufzeitzustand übernommen. Ein fehlgeschlagener Start erzeugt
einen Importfehler und Status `error`; der nächste Import versucht ihn erneut. Damit unterscheidet sich ein
persistierter Datensatz von einer tatsächlich gestarteten lokalen Tunnelinstanz. Die lokalen Tests verwenden
echte Modelle/Migrationen und kontrollierte Kindprozesse.

Hostnamen werden auch beim GitOps-Write über das gemeinsame atomare Domainregister beansprucht;
PostgreSQL-Sequenzkorrektur und Host-Write verwenden dabei dieselbe Transaktion. Teilimporte ohne Domainänderung
erhalten die aktuellen Claims, die Bereinigung gelöschter Hosts gibt sie frei.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Git-Deploy](./git-deploy.md)
- [Modulübersicht](./README.md)
- [Deployment](../entwicklung/deployment.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
