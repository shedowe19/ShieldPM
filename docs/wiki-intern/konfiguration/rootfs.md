# Rootfs-Referenz

## Zweck

Dokumentation aller Overlay-Dateien, die ins Docker-Image oder den nativen Host kopiert werden.

## Kontext

Das `rootfs/`-Verzeichnis enthält Dateien, die direkt ins Dateisystem des Containers kopiert werden. Bei nativer Installation werden sie in die entsprechenden System-Pfade platziert.

## Startup-Scripts (`rootfs/usr/local/bin/`)

| Datei                | Zweck                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `start.sh`           | Konfiguriert Nginx, Environment, Module, Datenpfade und Rechte                |
| `launch.sh`          | Startet Backend sowie optionale Tor-/GoAccess-Prozesse und propagiert Signale |
| `entrypoint.sh`      | Docker-Entrypoint für Vorbereitung und Launch                                 |
| `healthcheck.sh`     | Prüft die Backend-API über den internen Unix-Socket                           |
| `envs.sh`            | Lädt Umgebungsvariablen und generische `_FILE`-Secrets vor der Validierung    |
| `load-env-secrets.sh`| Prüft Pfade, Inodes, Rechte und Größe von Secret-Dateien fail-closed          |
| `aio.sh`             | Einmalige Nextcloud-AIO-Anlage mit explizitem kurzlebigem Access-Token        |
| `update-shieldpm`    | Verifiziertes, staged und health-geprüftes Native-Update mit Payload-Rollback |
| `npm-reset-password` | SQLite-only Passwort-Reset-Wrapper mit E-Mail- und Passwortargument           |
| `migration.sh`       | Migrations-Wrapper                                                            |

## Native-Update: Runtime und Atomizität

`update-shieldpm [-b|--branch <branch>]` validiert den Branchnamen, bindet `refs/heads/<branch>` an eine exakte
40-stellige Commit-SHA und baut genau diesen Stand mit `yarn install --immutable`. Es verlangt Node.js 24,
Corepack 0.36.0 und Yarn 4.18.0 sowie deaktivierte Dependency-Skripte mit expliziter `better-sqlite3`-Buildfreigabe.
Backend und Frontend werden im jeweiligen Zielfilesystem vorbereitet und per Rename aktiviert; ein fehlgeschlagener
Start oder Health-Check stellt App, Frontend, Rootfs, Unit, Binaries und SQLite wieder her.

Vorher entsteht eine konsistente Sicherung. SQLite wird über den sicheren Backup-Pfad erfasst. Bei MySQL/PostgreSQL
wartet die Aktualisierung auf `--external-db-backup-confirmed`, da Payload-Rollback keine externe DB restauriert. Bei
einem Fehler werden die Dateien zurückgesetzt, der Dienst bleibt bis zum externen Restore jedoch absichtlich gestoppt.

## Native-Update: Backend-Health-Check

Nach dem Neustart prüft `update-shieldpm` den Backend-Health-Status über `/run/shieldpm.sock` gegen `http://localhost/`. Der native Backend-Router liefert dort `status: "OK"`; `/api/` ist kein Socket-Präfix und antwortet mit 404. Der Check wartet höchstens 120 Sekunden und meldet nur dann ein erfolgreiches Update, wenn der Dienst aktiv und diese Antwort verfügbar ist.

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

Referenz-Datei für unterstützte Umgebungsvariablen. Wird als Vorlage für native Installationen verwendet.

Die gleiche Datei existiert als `rootfs/data/.env` für den Container.

Die AIO-Automatik verwendet keine Initialpasswörter. Nach dem Ownership-Claim wird ein kurzlebiger Access-Token über
`SHIELDPM_AIO_ACCESS_TOKEN_FILE` gemountet. `aio.sh` übergibt ihn nicht in Prozessargumenten, schreibt den Lock erst
nach erfolgreicher Host-Anlage und kann danach samt Secret-Datei entfernt beziehungsweise deaktiviert werden.

## HTML-Seiten (`rootfs/html/`)

| Pfad                           | Zweck                     |
| ------------------------------ | ------------------------- |
| `default/index.html`           | Standard-Begrüßungsseite  |
| `404deadpage/404deadpage.html` | Custom 404-Seite          |
| `maintenance.html`             | Wartungsseite             |
| `terminal/index.html`          | gehärtete Web-Terminal-UI |
| `turbo_loader.html`            | Turbo-Loader Download-UI  |
| `fancyindex/header.html`       | FancyIndex Header         |
| `fancyindex/footer.html`       | FancyIndex Footer         |

## Systemd-Service (`rootfs/usr/lib/systemd/system/`)

| Datei              | Zweck                                |
| ------------------ | ------------------------------------ |
| `shieldpm.service` | Systemd-Unit für native Installation |

Die `Type=simple`-Unit sendet zum geordneten Stoppen zuerst `SIGTERM` und lässt dem Graceful-Shutdown eine feste
Stop-Timeout-Grenze. `UMask=0077` schützt neu erzeugte Dateien. Weitere Capability-/Sandbox-Härtung muss gegen Native-,
Docker- und LXC-Funktionen getestet werden, statt sie pauschal zu aktivieren.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Build](../entwicklung/build.md)
- [Deployment](../entwicklung/deployment.md)
- [Umgebungsvariablen](./umgebungsvariablen.md)
