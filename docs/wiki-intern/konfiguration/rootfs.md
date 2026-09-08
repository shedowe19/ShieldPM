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
| `entrypoint.sh`      | 839 B  | Entrypoint: Führt Prerun und anschließend `envs.sh` → `migration.sh` → `start.sh` → `launch.sh` aus                                                                                                                                                                                           |
| `healthcheck.sh`     | 1 KB   | Docker-Healthcheck: Prüft API-Erreichbarkeit                                                                                                                                                                                                                                                  |
| `envs.sh`            | 2 KB   | Lädt und exportiert Umgebungsvariablen                                                                                                                                                                                                                                                        |
| `aio.sh`             | 1.5 KB | Richtet den Nextcloud-AIO-Proxy-Host einschließlich TLS-Zertifikat einmalig ein                                                                                                                                                                                                               |
| `update-shieldpm`    | 16 KB  | Update-Script für native Installationen; richtet NodeSource APT ein, installiert/verifiziert Node.js 26 sowie Yarn Classic 1.22.22, aktiviert den System-CA-Store für Node-Netzwerkzugriffe und räumt beim Node-Majorwechsel ausschließlich verwaiste Corepack-Shims vor dem npm-Fallback auf |
| `npm-reset-password` | 45 B   | Passwort-Reset-Wrapper                                                                                                                                                                                                                                                                        |
| `migration.sh`       | 34 B   | Migrations-Wrapper                                                                                                                                                                                                                                                                            |

## Datenmigration und Dateirechte

- `migrate-data.sh` enthält die von `start.sh` verwendeten Migrationsfunktionen. Alte Verzeichnisse werden einschließlich versteckter Dateien übernommen; vorhandene Zieldateien bleiben erhalten. Das Original bleibt unter `/data/shieldpm/migration-backups/<alter-name>.migrated.XXXXXX/original` als Sicherung bestehen. Bei Kopierfehlern bricht der Start vor dem Entfernen der Quelle ab.
- Certbot-Live-Dateien werden nur dann atomar durch Symlinks ersetzt, wenn eine Archivdatei denselben Inhalt besitzt. Bei mehreren passenden Versionen gewinnt die numerisch höchste Version. Nicht passende Live-Dateien und Erneuerungsarchive werden nicht gelöscht.
- Die einzelne alte `/data/database.sqlite` wird über die SQLite-Backup-API migriert, damit bereits bestätigte WAL-Transaktionen erhalten bleiben. Vor der atomaren Veröffentlichung des Ziels wird der vollständige Originalsatz einschließlich WAL-/SHM-Dateien kopiert. Vorhandene Zieldatenbanken werden nicht ersetzt. Kopierfehler lassen die Quelle bestehen; eine fehlgeschlagene Quellbereinigung lässt den vollständigen Sicherungssatz und den Ziel-Snapshot erhalten. Eine beschädigte Quelle bricht den Start ab.
- Temporäre Certbot-Symlinks liegen in einem privaten Zufallsverzeichnis. Ein zurückgebliebener Link eines unterbrochenen Starts blockiert damit keinen erneuten Start.
- Verzeichnisse unter `/data/tls`, `/data/access` und `/data/shieldpm` erhalten Modus `0700`, reguläre Dateien `0600`. Damit werden unter anderem private Schlüssel, Datenbanken und das Tor-Control-Passwort nicht mehr pauschal auf `0770` erweitert.
- Die neuen Sicherungsverzeichnisse benötigen Speicherplatz. Vor einer manuellen Bereinigung müssen insbesondere abweichende Ziel- und Quelldateien verglichen werden.
- Besitzanpassungen verwenden `chown -h` und gebündelte `find -exec`-Aufrufe ausschließlich für `/data` und das eigene Runtime-Verzeichnis `/run/shieldpm`. Symlink-Ziele außerhalb der durchlaufenen Verzeichnisse werden nicht durch die Besitzanpassung verändert. Die Socketbereinigung entfernt ausschließlich ShieldPM-, GoAccess- und PHP-Sockets; fremde `/run/*.sock` wie `docker.sock` bleiben bestehen.
- `/run/shieldpm` und das dortige Home-Verzeichnis erhalten Modus `0700` für `PUID:PGID`. Backend, PHP, GoAccess, Anubis und interne Nginx-Upstreams legen dort ihre Unix-Sockets an. Nginx-PID und die fünf HTTP-Tempverzeichnisse liegen unter `/run/shieldpm/nginx`; GoAccess schreibt seinen Bericht nach `/run/shieldpm/goa`.
- PHP-FPM schreibt seine PID-Dateien nach `/run/shieldpm/php82.pid`, `php83.pid` beziehungsweise `php84.pid`; der konfigurierte Fehlerlogpfad liegt unter `/data/php/XX/php-fpm.log`. Der Start aktualisiert aktive sowie kommentierte Direktiven bei jedem Lauf. PHP-FPM öffnet diese Dateien auch im Vordergrund; alte Pfade unter `/run/php` oder `/var/log` würden den unprivilegierten Start verhindern. `-FOR` gibt die Meldungen weiterhin über das geerbte stderr aus, ohne `/proc/self/fd/2` erneut öffnen oder dessen Besitzer ändern zu müssen. Explizite `listen.owner`-/`listen.group`-Vorgaben werden deaktiviert, sodass die Sockets den effektiven Dienstbenutzer behalten und kein unzulässiger Besitzerwechsel zu `www-data` versucht wird.
- `runtime-config.sh` passt die mitgelieferten Nginx-, UI- und GoAccess-Konfigurationen vor dem Dienststart gezielt an diese Pfade an. Die veränderliche Default-Site liegt unter `/data/nginx/default.conf`; die bisherige Datei unter `/usr/local/nginx/conf/conf.d/default.conf` wird nach Sicherung des alten Inhalts durch ein atomar erzeugtes, root-eigenes Include ersetzt. Eine bereits vorhandene Zielkonfiguration bleibt erhalten. Die Host-Regenerierung löscht weder dieses Ziel noch `ip_ranges.conf`.
- DNS-Plugins werden unter `/data/certbot-plugins` installiert. Der Launcher stellt dieses Verzeichnis dem bestehenden `PYTHONPATH` voran; die Python-Systeminstallation unter `/usr/local` benötigt keine Schreibrechte für den Dienstbenutzer.

## Wiederholter Start und Zertifikatauswahl

`runtime-config.sh` setzt Certbot-Schlüsseltyp, Must-Staple, TLS-Prüfung und ACME-Profil bei jedem Start auf die aktuellen Umgebungswerte zurück. Ein Wechsel zurück auf Standardwerte wird damit auch bei nativen Installationen wirksam. Dasselbe gilt für die IPv4-/IPv6-Adressen und Ports der Verwaltungsoberfläche und von GoAccess sowie für Worker-Anzahlen, Fehlerprotokollierung, 404-Weiterleitung, Proxy-Pufferung und die IPv6-DNS-Auflösung.

Optionale Nginx-Module, ihre GeoIP-Blöcke, OpenAppSec-bedingte Kompressionseinstellungen, PROXY-Protokoll, HSTS-Subdomains und optionale Rotationslogs werden ebenfalls in beide Richtungen aktualisiert. Änderungen betreffen ausdrücklich benannte Direktiven; fremde auskommentierte Blöcke bleiben erhalten. Der GeoIP-Zusatz des JSON-Logs bleibt vollständig als Nginx-Zeichenkette gequotet. Die Konfigurationsdatei wird atomar ersetzt; das permanente JSON-Analytics-Log bleibt aktiv.

`DEFAULT_CERT_ID` unterstützt Let's Encrypt, hochgeladene und interne Zertifikate. Zertifikat und privater Schlüssel werden immer als vollständiges, nicht leeres Paar ausgewählt; andernfalls greift das Dummy-Paar. Beim Wechsel des Zertifikats oder Abschalten von OCSP werden alte Stapling-Direktiven deaktiviert. Deaktiviertes GoAccess entfernt seine aktive Nginx-Konfiguration unabhängig von `FULLCLEAN`; historische Daten bleiben bei `FULLCLEAN=false` erhalten.

Der Entrypoint überspringt Verzeichnisse ohne passende Prerun-Shellskripte. Ein Fehler beim Verschieben des alten Datenverzeichnisses bricht den Start ab. ZeroSSL-EAB-Anfragen kodieren die E-Mail-Adresse als Formulardaten, haben ein Zeitlimit von 30 Sekunden und melden HTTP-Fehler. Die Startreparatur erkennt fehlende Zertifikate und Schlüssel auch bei internen Zertifikaten.

## Native-Update: NodeSource-Paketversion

`update-shieldpm` läuft mit `set -o pipefail`. Die Node-26-Paketversion wird aus `apt-cache madison nodejs` ermittelt. Das `awk`-Kommando liest dabei die vollständige APT-Ausgabe, übernimmt aber nur die erste passende Version. Ein vorzeitiges Beenden von `awk` würde die vorgelagerte Ausgabe bei langen Versionslisten mit `SIGPIPE` abbrechen und das gesamte Update vor dem Quellcode-Download beenden.

## Native-Update: Versionsprüfung und Selbstupdate

Alte Updater verwenden für den GitHub-Commit `curl | grep | head | cut`. Bei umfangreichen Commit-Antworten kann `head` die Pipe vorzeitig schließen; mit `pipefail` endet das Skript dann unmittelbar nach `Checking for application updates...` mit Status 141 und ohne weitere Meldung. Ein Update des Repositorys allein ersetzt diesen bereits installierten Updater nicht.

Die aktuelle Prüfung kodiert den Branchnamen und liest die vollständige JSON-Antwort mit Node.js. Download- und Parsefehler werden ausdrücklich abgefangen; nur ein gültiger vollständiger Commit-Hash erlaubt die Fortsetzung. Die Versionsanzeige liest ebenfalls JSON und zeigt bei fehlenden oder ungültigen lokalen Versionsdaten `unknown`. GitHub-Abfragen haben zehn Sekunden Verbindungs- und 60 Sekunden Gesamtlaufzeit.

Das Selbstupdate lädt das Skript aus genau dem aufgelösten Ziel-Commit, statt unabhängig von `-b` immer `develop` zu verwenden. Dadurch ersetzt ein Update auf einen Feature-Branch dessen korrigierten Updater nicht wieder durch einen älteren Stand. Syntaxprüfung, ursprüngliche Argumente und die Begrenzung auf einen Selbstupdate-Neustart bleiben erhalten. `scripts/tests/test_update_preflight.py` führt diese Vorprüfung mit echten Bash-/Node-Prozessen, temporären Dateien und simulierten Downloads aus; Paketinstallationen oder Dienständerungen werden dabei nicht gestartet. Hinweise für Altinstallationen stehen unter [Deployment](../entwicklung/deployment.md).

## Native-Update: Yarn-Classic-Fallback

Falls Corepack nicht verfügbar ist, installieren sowohl `update-shieldpm` als auch `scripts/install.sh` Yarn Classic mit `npm install --global --allow-scripts=yarn yarn@1.22.22`. Damit ist ausschließlich das bekannte Yarn-`preinstall`-Skript für diesen Aufruf erlaubt; es gibt keine globale Freigabe fremder Install-Skripte. Zuvor entfernt der Fallback nur verwaiste Corepack-Shims.

## Native-Update: Backend-Health-Check

Nach dem Neustart prüft `update-shieldpm` den Backend-Health-Status über `/run/shieldpm/shieldpm.sock` gegen `http://localhost/`. Der native Backend-Router liefert dort `status: "OK"`; `/api/` ist kein Socket-Präfix und antwortet mit 404. Der Check wartet höchstens 120 Sekunden und meldet nur dann ein erfolgreiches Update, wenn der Dienst aktiv und diese Antwort verfügbar ist.

## Native-Update: Austausch und Fehlerbehandlung

Das Update läuft aus einem privaten, mit `mktemp` angelegten Verzeichnis. Selbstupdates werden vor der Ausführung mit `bash -n` geprüft und höchstens einmal pro Aufruf durchgeführt. Der tatsächlich geklonte Commit wird als installierter Stand gespeichert. Der Frontend-Build installiert seine Entwicklungsabhängigkeiten auch dann, wenn `NODE_ENV=production` gesetzt ist.

Vor dem Austausch werden Backend und Frontend gesichert und der Dienst gestoppt. Ein Abbruch vor dem ersten Start der neuen Datenbankmigrationen stellt diese Anwendungsdateien wieder her und versucht, den Dienst erneut zu starten. Sobald Migrationen beginnen, erfolgt kein automatisches Zurücksetzen auf den vorherigen Anwendungscode: Ein solcher Wechsel könnte mit dem bereits geänderten Datenbankschema inkompatibel sein. Das ist keine vollständige Systemsicherung; Systempakete, Nginx-Binaries und Rootfs-Konfigurationen können bereits aktualisiert worden sein.

Scheitern Neustart oder Healthcheck nach diesem Punkt, bleiben die Recovery-Dateien im ausgegebenen privaten Arbeitsverzeichnis erhalten. Vor einer manuellen Wiederherstellung muss der Stand der Datenbankmigrationen geprüft werden.

## Healthcheck und AIO

`healthcheck.sh` liest `/data/.env` selbst, weil ein Docker-Healthcheck die nachträglichen Exporte des Entrypoints nicht erbt. HTTP-Anfragen haben einen Zeitrahmen von zehn Sekunden.

Bei `NPM_LISTEN_LOCALHOST=true` beziehungsweise `GOA_LISTEN_LOCALHOST=true` verwendet der Healthcheck wie die Startvalidierung `127.0.0.1`, auch wenn zusätzlich eine andere Bind-Adresse konfiguriert ist.

`aio.sh` verwendet den Backend-Unix-Socket, JSON-Erzeugung mit `jq`, eine private Cookie-Datei und einen CSRF-Token aus der authentifizierten Sitzung. Die Datei `/data/aio.lock` entsteht erst nach erfolgreicher Host-Erstellung. Bei aktivierter Zwei-Faktor-Anmeldung muss die Einrichtung interaktiv erfolgen. Docker leitet Stoppsignale mit `tini -g` an die gesamte Prozessgruppe weiter.

Die Wiederanlaufschleifen für PHP 8.2/8.3/8.4 und GoAccess warten nach einem beendeten Prozess eine Sekunde. Ein sofortiger Startfehler erzeugt dadurch keine ungebremste Schleife aus Prozessen und Logmeldungen. Fehlende GoAccess-Eingangslogs werden weiterhin nach zehn Sekunden erneut geprüft.

Kann das Backend seinen Unix-Socket nicht binden, protokolliert es den Fehler und beendet sich mit Status 1. Der vorhandene Backend-Loop in `launch.sh` startet es nach einer Sekunde erneut. Der Express-5-Listen-Callback erhält auch Bindefehler; nur ein erfolgreicher Aufruf meldet Bereitschaft und initialisiert das Terminal. Bei `SIGTERM` schließt der gestartete HTTP-Server und beendet den Backend-Prozess. Der Entwicklungsstart behandelt einen belegten TCP-Port ebenso als Fehler und beendet sich mit Status 1.

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

Beispielwerte mit Leerzeichen oder Shell-Sonderzeichen sind gequotet und können durch Entfernen des Kommentarpräfixes übernommen werden. Installer und Updater aktivieren Anubis beziehungsweise OpenAppSec nur über den exakten Variablennamen; gleichnamige Textteile in anderen Werten bleiben erhalten.

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

| Datei                           | Zweck                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shieldpm.service`              | Systemd-Unit für native Installation                                                                                                                       |
| `shieldpm-ssh-hostkeys.service` | Im LXC-Template vor `ssh.service` aktivierter Dienst zur einmaligen Erzeugung fehlender SSH-Hostkeys; vorhandene Schlüssel bleiben bei Neustarts erhalten. |

Der Turbo-Loader setzt auch URL-Pfade mit führendem `//` auf derselben Origin fort. Probe, parallele Downloads und Standard-Download wechseln dadurch nicht auf einen aus dem Pfad abgeleiteten Fremdhost.

## Offene Fragen

Frühere Versionen änderten bei `PUID != 0` rekursiv den Besitz von `/usr/local`, `/run` und `/tmp`. Neue Starts begrenzen dies auf ShieldPM-Daten und das eigene Runtime-Verzeichnis. Bereits veränderte Eigentümer fremder Dateien oder übergeordneter Systemverzeichnisse lassen sich nicht automatisch zuverlässig rekonstruieren; betroffene native Hosts benötigen eine individuelle Prüfung und Wiederherstellung durch ihre Administration. Das neue root-eigene Default-Include behebt keine früheren Schreibrechte auf dessen übergeordnete Verzeichnisse.

Die Infrastrukturtests prüfen Dateirechte, wiederholte Pfadkonfiguration, Default-Migration und eine echte Unix-Socket-Bindung mit Schreibzugriff auf alle Runtime-Arbeitsverzeichnisse. In eingeschränkten lokalen Prüfumgebungen, die bereits `socket(AF_UNIX)` verbieten, wird nur dieser Systemaufruf-Test mit ausdrücklichem Grund übersprungen; in CI bleibt er verpflichtend.

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Build](../entwicklung/build.md)
- [Deployment](../entwicklung/deployment.md)
- [Umgebungsvariablen](./umgebungsvariablen.md)
