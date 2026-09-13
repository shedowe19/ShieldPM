# GitOps

## Zweck

Git-basierte Konfigurationssynchronisierung (Backup, Versionierung, Restore).

## Kontext

GitOps ermöglicht es, die gesamte ShieldPM-Konfiguration in einem Git-Repository zu sichern und wiederherzustellen.

## Wichtige Dateien

- `backend/internal/gitops.js` (38 KB) — Haupt-Business-Logik (größtes Modul)
- `backend/internal/git-deploy.js` (11 KB) — Auto-Deploy von Git-Repos
- `backend/routes/gitops.js` (3 KB) — API-Routen
- `frontend/src/pages/Settings/GitOps.tsx` — Konfiguration und manuelle Aktionen

## Verhalten

- Exportiert Konfiguration als JSON/YAML
- Synchronisiert mit Remote-Git-Repository via `isomorphic-git`
- Unterstützt HTTP(S)-Repositories mit Tokens für Authentifizierung
- Git-Deploy: Automatisches Klonen und Deployen von statischen Sites

## Abhängigkeiten

- `isomorphic-git` — Git-Operationen in Node.js
- `archiver` — ZIP-Archivierung für Export
- `js-yaml` — YAML-Serialisierung

### Import- und Exportkonsistenz

Der Export enthält neben Hosts, Streams, Zertifikaten, Benutzern und Einstellungen auch Access Lists mit Auth-/Client-Einträgen, Cloudflared-Tunnels und DDNS-Provider. Die Import-Feldlisten entsprechen den tatsächlichen Modellen. Unbekannte Top-Level-Felder werden vor der Datenbankoperation verworfen; Benutzerberechtigungen und Access-List-Kindobjekte werden separat bereinigt. Proxy-Domains werden beim Import in die normalisierte `host_domains`-Relation umgewandelt.

Neue Objekte behalten ihre positiven ganzzahligen Export-IDs, damit Zertifikats-, Benutzer- und Access-List-Referenzen erhalten bleiben. DDNS-Provider haben kein `is_deleted`-Feld; der Import fügt diese Spalte nicht hinzu.

Bei `overwrite` löst ein fehlendes Modulverzeichnis keine Löschung aus. Enthält der Import eines Moduls ungültige Dateien oder schlägt eine Datenbankoperation fehl, wird die Bereinigung fehlender Objekte für dieses Modul übersprungen. Der aktuelle Administrator wird bei der Benutzerbereinigung nicht gelöscht. Importfehler ergeben `success: false`; die Fehlerliste bleibt Teil der Antwort.

Vor Import und Export prüft `backend/lib/gitops-files.js` den Konfigurationsbaum und seine Pfadkomponenten auf symbolische Links. Solche Repository-Einträge werden abgewiesen, bevor Datenbank- oder Exportoperationen starten. Generierte Dateien werden innerhalb des GitOps-Verzeichnisses mit `O_NOFOLLOW` und Modus `0600` geschrieben; Export-Dateinamen für Settings kodieren Pfadtrenner. Die Bereinigung verwendet `lstat()` und folgt keinen symbolischen Verzeichnislinks.

Nach erfolgreichem Revert wird ausschließlich der Backend-Prozess per SIGTERM neu gestartet; PID 1 des Containers oder nativen Hosts wird nicht signalisiert.

Unklar: Der Import ist weiterhin nicht als Gesamttransaktion über alle Module implementiert. Bereits erfolgreich importierte Objekte bleiben bei späteren Fehlern bestehen. GitOps verwendet `isomorphic-git` über HTTP(S); native SSH-Schlüssel-Authentifizierung wird nicht unterstützt. Die Oberfläche bietet deshalb ausschließlich Token-Authentifizierung an.

### Einstellungen und manuelle Aktionen

Die GitOps-Seite zeigt bei fehlgeschlagener Erstabfrage keine speicherbaren Standardwerte an. Verbindungstests und Git-Aktionen verwenden die gespeicherte Backend-Konfiguration und bleiben gesperrt, solange die angezeigten Einstellungen ungespeicherte Änderungen enthalten. Während einer Mutation sind weitere Git-Aktionen und Änderungen der Konfiguration gesperrt. Ein neu eingegebener Token wird nach erfolgreichem Speichern aus dem Formular entfernt; leere Token-Felder erhalten die gespeicherten Zugangsdaten.

Import- und Revert-Dialoge schließen nur bei einer Antwort mit `success: true`. Die Seitenzustände werden in `frontend/src/pages/Settings/GitOps.test.tsx` geprüft.

### Synchronisation und Wiederholungen

Jedes exportierte Modul enthält eine `.gitkeep`-Datei. Damit bleibt auch ein leeres Modul im Git-Commit erhalten und ein vollständiger Restore kann dessen letztes Objekt löschen. Fehlende Verzeichnisse älterer Backups bleiben weiterhin unverändert. `overwrite` akzeptiert nur einen echten Boolean; Fehler beim Abruf zu löschender Objekte werden als Importfehler zurückgegeben.

Vor dem Commit werden entfernte Dateien ausdrücklich aus dem Git-Index gelöscht. Ein erneuter Push wird auch bei unverändertem Arbeitsverzeichnis ausgeführt, damit ein zuvor fehlgeschlagener Upload nachgeholt wird. Vor Push und Pull wird `origin` auf die aktuell konfigurierte URL gesetzt; Zugangsdaten gehen dadurch nicht an einen früheren Repository-Endpunkt. Push verwendet den aktuellen lokalen Commit und den konfigurierten Remote-Branch.

Push und Pull übergeben zusätzlich die Repository-URL aus demselben Konfigurationsstand wie die Zugangsdaten direkt an `isomorphic-git`. Eine gleichzeitige Änderung von `origin` kann dadurch den authentifizierten Netzwerkaufruf nicht auf ein anderes Repository umleiten. `fourth-integrations-gitops-destination.spec.js` prüft beide Wege mit einem echten lokalen Git-Repository und einem HTTP-Stub, ohne einen Provider zu kontaktieren.

Sync-Metadaten liegen in `setting.meta`. Nach Netzwerkoperationen wird die private Konfiguration erneut geladen, damit zwischenzeitlich aktualisierte Zugangsdaten erhalten bleiben. Bereits ausgecheckte Exportdateien werden beim Schreiben ebenfalls auf Modus `0600` gesetzt. Regressionen prüfen echte lokale Git-Commits, Push-Wiederholungen und die Entschlüsselbarkeit unveränderter Zugangsdaten.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Git-Deploy](./git-deploy.md)
- [Modulübersicht](./README.md)
- [Deployment](../entwicklung/deployment.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
