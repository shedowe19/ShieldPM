# Rootfs-Referenz

## Zweck

Dokumentation aller Overlay-Dateien, die ins Docker-Image oder den nativen Host kopiert werden.

## Kontext

Das `rootfs/`-Verzeichnis enthält Dateien, die direkt ins Dateisystem des Containers kopiert werden. Bei nativer Installation werden sie in die entsprechenden System-Pfade platziert.

## Startup-Scripts (`rootfs/usr/local/bin/`)

| Datei                | Größe  | Zweck                                                                                                                                                                                                                                                                                         |
| -------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start.sh`           | 27 KB  | **Haupt-Startup-Script**: Konfiguriert Nginx, Umgebungsvariablen, Module, Berechtigungen                                                                                                                                                                                                      |
| `launch.sh`          | 6 KB   | Startet Backend-Prozess und optional Tor, GoAccess                                                                                                                                                                                                                                            |
| `entrypoint.sh`      | 839 B  | Docker-Entrypoint: Ruft `start.sh` auf, dann `launch.sh`                                                                                                                                                                                                                                      |
| `healthcheck.sh`     | 1 KB   | Docker-Healthcheck: Prüft API-Erreichbarkeit                                                                                                                                                                                                                                                  |
| `envs.sh`            | 2 KB   | Lädt und exportiert Umgebungsvariablen                                                                                                                                                                                                                                                        |
| `aio.sh`             | 1.5 KB | All-in-One Script für Dienst-Verwaltung                                                                                                                                                                                                                                                       |
| `update-shieldpm`    | 16 KB  | Update-Script für native Installationen; richtet NodeSource APT ein, installiert/verifiziert Node.js 26 sowie Yarn Classic 1.22.22, aktiviert den System-CA-Store für Node-Netzwerkzugriffe und räumt beim Node-Majorwechsel ausschließlich verwaiste Corepack-Shims vor dem npm-Fallback auf |
| `npm-reset-password` | 45 B   | Passwort-Reset-Wrapper                                                                                                                                                                                                                                                                        |
| `migration.sh`       | 34 B   | Migrations-Wrapper                                                                                                                                                                                                                                                                            |

## Datenmigration und Dateirechte

- `migrate-data.sh` enthält die von `start.sh` verwendeten Migrationsfunktionen. Alte Verzeichnisse werden einschließlich versteckter Dateien übernommen; vorhandene Zieldateien bleiben erhalten. Das Original bleibt unter `/data/shieldpm/migration-backups/<alter-name>.migrated.XXXXXX/original` als Sicherung bestehen. Bei Kopierfehlern bricht der Start vor dem Entfernen der Quelle ab.
- Certbot-Live-Dateien werden nur dann atomar durch Symlinks ersetzt, wenn eine Archivdatei denselben Inhalt besitzt. Bei mehreren passenden Versionen gewinnt die numerisch höchste Version. Nicht passende Live-Dateien und Erneuerungsarchive werden nicht gelöscht.
- Verzeichnisse unter `/data/tls`, `/data/access` und `/data/shieldpm` erhalten Modus `0700`, reguläre Dateien `0600`. Damit werden unter anderem private Schlüssel, Datenbanken und das Tor-Control-Passwort nicht mehr pauschal auf `0770` erweitert.
- Die neuen Sicherungsverzeichnisse benötigen Speicherplatz. Vor einer manuellen Bereinigung müssen insbesondere abweichende Ziel- und Quelldateien verglichen werden.

## Wiederholter Start und Zertifikatauswahl

`runtime-config.sh` setzt Certbot-Schlüsseltyp, Must-Staple, TLS-Prüfung und ACME-Profil bei jedem Start auf die aktuellen Umgebungswerte zurück. Ein Wechsel zurück auf Standardwerte wird damit auch bei nativen Installationen wirksam. Dasselbe gilt für die IPv4-/IPv6-Adressen und Ports der Verwaltungsoberfläche und von GoAccess sowie für Worker-Anzahlen, Fehlerprotokollierung, 404-Weiterleitung, Proxy-Pufferung und die IPv6-DNS-Auflösung.

`DEFAULT_CERT_ID` unterstützt Let's Encrypt, hochgeladene und interne Zertifikate. Zertifikat und privater Schlüssel werden immer als vollständiges, nicht leeres Paar ausgewählt; andernfalls greift das Dummy-Paar. Beim Wechsel des Zertifikats oder Abschalten von OCSP werden alte Stapling-Direktiven deaktiviert. Deaktiviertes GoAccess entfernt seine aktive Nginx-Konfiguration unabhängig von `FULLCLEAN`; historische Daten bleiben bei `FULLCLEAN=false` erhalten.

Der Entrypoint überspringt Verzeichnisse ohne passende Prerun-Shellskripte. Ein Fehler beim Verschieben des alten Datenverzeichnisses bricht den Start ab. ZeroSSL-EAB-Anfragen kodieren die E-Mail-Adresse als Formulardaten, haben ein Zeitlimit von 30 Sekunden und melden HTTP-Fehler. Die Startreparatur erkennt fehlende Zertifikate und Schlüssel auch bei internen Zertifikaten.

## Native-Update: NodeSource-Paketversion

`update-shieldpm` läuft mit `set -o pipefail`. Die Node-26-Paketversion wird aus `apt-cache madison nodejs` ermittelt. Das `awk`-Kommando liest dabei die vollständige APT-Ausgabe, übernimmt aber nur die erste passende Version. Ein vorzeitiges Beenden von `awk` würde die vorgelagerte Ausgabe bei langen Versionslisten mit `SIGPIPE` abbrechen und das gesamte Update vor dem Quellcode-Download beenden.

## Native-Update: Yarn-Classic-Fallback

Falls Corepack nicht verfügbar ist, installieren sowohl `update-shieldpm` als auch `scripts/install.sh` Yarn Classic mit `npm install --global --allow-scripts=yarn yarn@1.22.22`. Damit ist ausschließlich das bekannte Yarn-`preinstall`-Skript für diesen Aufruf erlaubt; es gibt keine globale Freigabe fremder Install-Skripte. Zuvor entfernt der Fallback nur verwaiste Corepack-Shims.

## Native-Update: Backend-Health-Check

Nach dem Neustart prüft `update-shieldpm` den Backend-Health-Status über `/run/shieldpm.sock` gegen `http://localhost/`. Der native Backend-Router liefert dort `status: "OK"`; `/api/` ist kein Socket-Präfix und antwortet mit 404. Der Check wartet höchstens 120 Sekunden und meldet nur dann ein erfolgreiches Update, wenn der Dienst aktiv und diese Antwort verfügbar ist.

## Native-Update: Austausch und Fehlerbehandlung

Das Update läuft aus einem privaten, mit `mktemp` angelegten Verzeichnis. Selbstupdates werden vor der Ausführung mit `bash -n` geprüft und höchstens einmal pro Aufruf durchgeführt. Der tatsächlich geklonte Commit wird als installierter Stand gespeichert. Der Frontend-Build installiert seine Entwicklungsabhängigkeiten auch dann, wenn `NODE_ENV=production` gesetzt ist.

Vor dem Austausch werden Backend und Frontend gesichert und der Dienst gestoppt. Ein Abbruch vor dem ersten Start der neuen Datenbankmigrationen stellt diese Anwendungsdateien wieder her und versucht, den Dienst erneut zu starten. Sobald Migrationen beginnen, erfolgt kein automatisches Zurücksetzen auf den vorherigen Anwendungscode: Ein solcher Wechsel könnte mit dem bereits geänderten Datenbankschema inkompatibel sein. Das ist keine vollständige Systemsicherung; Systempakete, Nginx-Binaries und Rootfs-Konfigurationen können bereits aktualisiert worden sein.

Scheitern Neustart oder Healthcheck nach diesem Punkt, bleiben die Recovery-Dateien im ausgegebenen privaten Arbeitsverzeichnis erhalten. Vor einer manuellen Wiederherstellung muss der Stand der Datenbankmigrationen geprüft werden.

## Healthcheck und AIO

`healthcheck.sh` liest `/data/.env` selbst, weil ein Docker-Healthcheck die nachträglichen Exporte des Entrypoints nicht erbt. HTTP-Anfragen haben einen Zeitrahmen von zehn Sekunden.

`aio.sh` verwendet den Backend-Unix-Socket, JSON-Erzeugung mit `jq`, eine private Cookie-Datei und einen CSRF-Token aus der authentifizierten Sitzung. Die Datei `/data/aio.lock` entsteht erst nach erfolgreicher Host-Erstellung. Bei aktivierter Zwei-Faktor-Anmeldung muss die Einrichtung interaktiv erfolgen. Docker leitet Stoppsignale mit `tini -g` an die gesamte Prozessgruppe weiter.

## Konfigurationsdateien (`rootfs/etc/`)

| Datei                           | Zweck                             |
| ------------------------------- | --------------------------------- |
| `certbot.ini`                   | Certbot-Konfiguration             |
| `crowdsec/collection.yaml`      | CrowdSec-Collection-Definitionen  |
| `crowdsec/parser.yaml`          | CrowdSec-Parser für ShieldPM-Logs |
| `crowdsec/shieldpm-acquis.yaml` | CrowdSec-Log-Acquisition          |
| `logrotate`                     | Log-Rotations-Konfiguration       |
| `tor/torrc.tpl`                 | Tor-Konfigurationstemplate        |

## Umgebungsvariablen (`rootfs/.env.example`)

Referenz-Datei für alle verfügbaren Umgebungsvariablen (2.9 KB). Wird als Vorlage für native Installationen verwendet.

Die gleiche Datei existiert als `rootfs/data/.env` für den Container.

## HTML-Seiten (`rootfs/html/`)

| Pfad                           | Zweck                             |
| ------------------------------ | --------------------------------- |
| `default/index.html`           | Standard-Begrüßungsseite (1.9 KB) |
| `404deadpage/404deadpage.html` | Custom 404-Seite (1.5 KB)         |
| `maintenance.html`             | Wartungsseite (16 KB)             |
| `terminal/index.html`          | Web-Terminal UI (7 KB)            |
| `turbo_loader.html`            | Turbo-Loader Download-UI (24 KB)  |
| `fancyindex/header.html`       | FancyIndex Header (3 KB)          |
| `fancyindex/footer.html`       | FancyIndex Footer (1.4 KB)        |

## Systemd-Service (`rootfs/usr/lib/systemd/system/`)

| Datei              | Zweck                                |
| ------------------ | ------------------------------------ |
| `shieldpm.service` | Systemd-Unit für native Installation |

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Build](../entwicklung/build.md)
- [Deployment](../entwicklung/deployment.md)
- [Umgebungsvariablen](./umgebungsvariablen.md)
