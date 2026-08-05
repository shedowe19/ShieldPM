# Rootfs-Referenz

## Zweck

Dokumentation aller Overlay-Dateien, die ins Docker-Image oder den nativen Host kopiert werden.

## Kontext

Das `rootfs/`-Verzeichnis enthält Dateien, die direkt ins Dateisystem des Containers kopiert werden. Bei nativer Installation werden sie in die entsprechenden System-Pfade platziert.

## Startup-Scripts (`rootfs/usr/local/bin/`)

| Datei                | Größe  | Zweck                                                                                    |
| -------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `start.sh`           | 27 KB  | **Haupt-Startup-Script**: Konfiguriert Nginx, Umgebungsvariablen, Module, Berechtigungen |
| `launch.sh`          | 6 KB   | Startet Backend-Prozess und optional Tor, GoAccess                                       |
| `entrypoint.sh`      | 839 B  | Docker-Entrypoint: Ruft `start.sh` auf, dann `launch.sh`                                 |
| `healthcheck.sh`     | 1 KB   | Docker-Healthcheck: Prüft API-Erreichbarkeit                                             |
| `envs.sh`            | 2 KB   | Lädt und exportiert Umgebungsvariablen                                                   |
| `aio.sh`             | 1.5 KB | All-in-One Script für Dienst-Verwaltung                                                  |
| `update-shieldpm`    | 12 KB  | Update-Script für native Installationen; richtet NodeSource APT ein, installiert/verifiziert Node.js 26 sowie Yarn Classic 1.22.22, aktiviert den System-CA-Store für Node-Netzwerkzugriffe, prüft den NodeSource-Signaturschlüssel sowie die SHA-256-Hashes der Nginx-, Anubis- und OAuth2-Proxy-Artefakte und räumt beim Node-Majorwechsel ausschließlich verwaiste Corepack-Shims vor dem npm-Fallback auf |
| `npm-reset-password` | 45 B   | Passwort-Reset-Wrapper                                                                   |
| `migration.sh`       | 34 B   | Migrations-Wrapper                                                                       |

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
