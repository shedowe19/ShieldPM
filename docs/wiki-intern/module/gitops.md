# GitOps

## Zweck

Git-basierte Konfigurationssynchronisierung (Backup, Versionierung, Restore).

## Kontext

GitOps ermöglicht es, die gesamte ShieldPM-Konfiguration in einem Git-Repository zu sichern und wiederherzustellen.

## Wichtige Dateien

- `backend/internal/gitops.js` (38 KB) — Haupt-Business-Logik (größtes Modul)
- `backend/internal/git-deploy.js` (11 KB) — Auto-Deploy von Git-Repos
- `backend/routes/gitops.js` (3 KB) — API-Routen

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

Unklar: Der Import ist weiterhin nicht als Gesamttransaktion über alle Module implementiert. Bereits erfolgreich importierte Objekte bleiben bei späteren Fehlern bestehen. GitOps verwendet `isomorphic-git` über HTTP(S); native SSH-Schlüssel-Authentifizierung wird nicht unterstützt, auch wenn die Oberfläche eine entsprechende Auswahl anbietet.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Git-Deploy](./git-deploy.md)
- [Modulübersicht](./README.md)
- [Deployment](../entwicklung/deployment.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
