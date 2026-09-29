# OpenAppSec

## Zweck

OpenAppSec ist ein AI-basierter WAF (Web Application Firewall), der Schwachstellen in Webanwendungen erkennt und blockiert – insbesondere OWASP Top 10 Threats. Im Gegensatz zu regelbasierten WAFs (z.B. ModSecurity) nutzt OpenAppSec Machine Learning und ein fortschrittliches Erkennungsmodell.

## Architektur

Die **Docker/Compose-Variante** verwendet fünf Services; Native/LXC installiert den Agent als lokalen Dienst neben ShieldPMs eigenem Nginx:

| Container                   | Rolle                                                               |
| --------------------------- | ------------------------------------------------------------------- |
| `openappsec-agent`          | Haupt-Agent; analysiert HTTP-Traffic via Nginx-Modul                |
| `openappsec-smartsync`      | Smart Synchronization; synchronisiert Regeln/ML-Modelle             |
| `openappsec-shared-storage` | Shared File Storage; verteilt Konfigurationsdaten an alle Container |
| `openappsec-tuning-svc`     | Tuning Service; lernt aus Traffic und optimiert Policies            |
| `openappsec-db`             | PostgreSQL 17; speichert Tuning-Daten und Trainingsmetriken         |

Alle Container sind in `compose.yaml` auskommentiert. Für die lokale Management-Variante gehören Agent, SmartSync, Shared Storage, Tuning-Service und Datenbank zusammen; bei Cloud-Verwaltung gelten andere Voraussetzungen.

## Integration

### Nginx-Modul

Das OpenAppSec Nginx-Attachment-Modul ist **bereits in ShieldPMs Nginx-Binary integriert** (kompiliert), auch bei Native/LXC. Aktivierung:

```bash
# In /data/.env
NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true
```

Die Modulaktivierung erfolgt durch die Laufzeitkonfiguration von Nginx. Dabei werden **Brotli und Zstd deaktiviert**:

```bash
# Deaktiviert: brotli on → brotli off
# Deaktiviert: zstd on → zstd off
```

### Cloud vs. Lokal

| Modus            | Konfiguration                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloud Portal** | Docker: `AGENT_TOKEN` beim Agent-Dienst in `compose.yaml`; Native/LXC: Token beim Installieren angeben → Verwaltung über https://my.openappsec.io |
| **Lokal**        | Docker: `/opt/openappsec/localconf/local_policy.yaml` (im Agent `/ext/appsec`); Native/LXC: `/etc/cp/conf/local_policy.yaml`                      |

Der native Agent-Helfer übernimmt bei lokaler Verwaltung nur dann eine [v1beta1-Policy](https://docs.openappsec.io/getting-started/start-with-linux/local-policy-file-advanced) aus `rootfs/usr/local/share/shieldpm/openappsec-local-policy.yaml` nach `/etc/cp/conf/local_policy.yaml`, wenn dort noch keine Datei existiert. Die Vorlage beginnt mit **detect-learn** und verweist auf benannte Practices und Log-Trigger. Der Helfer wendet die Policy mit `open-appsec-ctl --apply-policy` an und prüft den Agent-Status. Weitere Änderungen erneut anwenden und die aktive Konfiguration sowie Erkennungslogs prüfen; allein der Modus in der YAML-Datei belegt keine aktive Erkennung. Bei Cloud-Token wird keine lokale Policy erstellt oder angewendet. Ob der Docker-Agent bereits eine Policy hat, hängt vom gemounteten Konfigurationsverzeichnis ab. Erst nach Prüfung von Logs/Policy auf `prevent-learn` wechseln, um aktiv zu blockieren.

## Installation

### Docker / Compose

Vor dem Start im ShieldPM-Dienst außerdem `ipc: host`, das gemeinsame `shm-volume` unter `/dev/shm/check-point` und `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true` aktivieren. Dann die benötigten Container in `compose.yaml` einkommentieren und starten:

```bash
docker compose up -d openappsec-agent openappsec-smartsync openappsec-shared-storage openappsec-tuning-svc openappsec-db
```

Für das optionale Advanced-Modell bindet `compose.yaml` das Host-Verzeichnis `/opt/openappsec` nach `/advanced-model` im Agent ein. Die Datei `/opt/openappsec/open-appsec-advanced-model.tgz` muss vor dem Start vorhanden sein; im Container liegt sie dann unter `/advanced-model/open-appsec-advanced-model.tgz`. Ein direkter Datei-Mount ist ebenfalls möglich, setzt aber eine bereits vorhandene Host-Datei voraus.

### Native / LXC (install.sh)

Der native Installer `scripts/install.sh` (Abschnitt 15) ruft den mitgelieferten Helfer `/usr/local/bin/shieldpm-openappsec-agent-install` interaktiv auf. Auf einem bestehenden Debian-13-LXC oder einer bestehenden nativen Installation kann man denselben Helfer nach einem ShieldPM-Update aufrufen:

```bash
shieldpm-openappsec-agent-install
```

Der Aufruf erfolgt als `root`. Der Helfer fragt den Cloud-Token verdeckt ab (leer für lokale Verwaltung) und danach optional nach einem Pfad zum Advanced-Modell als `.tgz`. Den Token nicht selbst als Kommandoargument übergeben: Argumente können in der Prozessliste und Shell-History erscheinen. Er bezieht das Agent-Archiv direkt von `downloads.openappsec.io/packages/agent/<arch>/debian/trixie/openappsec-trixie.tar.gz` (`<arch>` ist `x86_64` oder `aarch64`) und führt die darin enthaltenen OpenAppSec-Agent-Installationsskripte aus. Das separate Upstream-Programm `open-appsec-install --auto` erkennt ShieldPMs eigenständig installiertes `/usr/local/nginx` nicht als Paket-Nginx und beendet sich mit `NGINX is not installed`; es darf für ShieldPM nicht als manueller Nachinstallationsschritt empfohlen werden. Das ARM64-Archiv liefert derzeit HTTP 403, daher bricht der Helfer auf ARM64 mit einem Downloadfehler ab. Der Helfer prüft Agent-Status, Nginx-Modul und Konfiguration, setzt `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true` in `/data/.env` erst nach erfolgreicher Installation und startet einen vorher laufenden ShieldPM-Dienst erneut. Bei Startfehlern stellt er die vorige `.env` wieder her. Beim Erstinstaller startet `scripts/install.sh` den Dienst anschließend regulär. Fehler vor Abschluss sollen nicht als aktivierter WAF gemeldet werden.

## Konfigurationsdateien

- **`/etc/cp/conf/local_policy.yaml`** — Lokale Policy (detect-learn / prevent-learn)
- **`/advanced-model/open-appsec-advanced-model.tgz`** — Ablage des optionalen ML-Archivs bei Native/LXC; der Helfer stoppt den Agent, entpackt es nach `/etc/cp/conf/waap`, startet den Agent neu und prüft seinen Status. Den tatsächlich aktiven Modelltyp nach der Installation mit `open-appsec-ctl --status` prüfen.
- **`/opt/openappsec/conf`** — Nginx-Agent-Konfiguration (Volume)
- **`/opt/openappsec/data`** — Agent-Daten (Volume)
- **`/opt/openappsec/logs`** — Logs (Volume)
- **`/opt/openappsec/open-appsec-advanced-model.tgz`** — Optionales Advanced-Modell für Docker; im Agent unter `/advanced-model/open-appsec-advanced-model.tgz`

## Wichtige Dateien

- `compose.yaml` — Container-Definitionen (auskommentiert)
- `scripts/install.sh` — Native Installer
- `rootfs/usr/local/bin/shieldpm-openappsec-agent-install` — Native/LXC-Agent-Installation ohne Nginx-Paketinstallation
- `rootfs/usr/local/share/shieldpm/openappsec-local-policy.yaml` — v1beta1-Vorlage für lokale Verwaltung
- `rootfs/usr/local/bin/runtime-config.sh` — Nginx-Modulaktivierung zur Laufzeit
- `backend/templates/_proxy_logic.conf` — Proxy-Routing ( falls relevant )

## Sicherheitsaspekte

- **OWASP Top 10**: Erkennt SQLi, XSS, Command Injection, LFI/RFI etc.
- **AI/ML-basiert**: Erkennt auch unbekannte Angriffsmuster (OAT/RAT/Bot-Angriffe) im Gegensatz zu regelbasierten WAFs
- **Auto-Learning**: Der Tuning Service lernt aus dem normalen Traffic und passt Policies an
- **vs. ModSecurity**: OpenAppSec nutzt fortschrittliche ML-Modelle statt statischer Regelsets; weniger false positives, besserer Schutz vor evolve-Angriffen

## Verwaltung

```bash
# Agent Status & Logs
open-appsec-ctl --status

# Policy anwenden (nach Änderungen an local_policy.yaml)
open-appsec-ctl --apply-policy

# Cloud Portal
# https://my.openappsec.io
```

## Verwandte Seiten

- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Anubis](./anubis.md)
- [Proxy-Host](./proxy-host.md)
- [Architektur-Überblick](../architektur/ueberblick.md)
- [Modulübersicht](./README.md)
