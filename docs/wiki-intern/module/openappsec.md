# OpenAppSec

## Zweck

OpenAppSec ist ein AI-basierter WAF (Web Application Firewall), der Schwachstellen in Webanwendungen erkennt und blockiert – insbesondere OWASP Top 10 Threats. Im Gegensatz zu regelbasierten WAFs (z.B. ModSecurity) nutzt OpenAppSec Machine Learning und ein fortschrittliches Erkennungsmodell.

## Architektur

OpenAppSec läuft als **Multi-Container-Architektur** mit 5 Services:

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

Das OpenAppSec Nginx-Attachment-Modul ist **bereits in ShieldPMs Nginx-Image integriert** (kompiliert). Aktivierung:

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

Der native Installer legt ohne Cloud-Token bei Bedarf eine Policy mit Modus **detect-learn** an. Die dort aktuell geschriebenen Inline-Practices und -Trigger entsprechen jedoch weder dem dokumentierten [v1beta1-Schema](https://docs.openappsec.io/getting-started/start-with-linux/local-policy-file-advanced) (Referenzen auf benannte `practices` und `log-triggers`) noch v1beta2. Policy vor Einsatz anhand der installierten Agent-Version korrigieren und die aktive Konfiguration nach `open-appsec-ctl --apply-policy` prüfen; allein der Modus in der YAML-Datei belegt keine aktive Erkennung. Ob der Docker-Agent bereits eine Policy hat, hängt vom gemounteten Konfigurationsverzeichnis ab. Erst nach Prüfung von Logs/Policy auf `prevent-learn` wechseln, um aktiv zu blockieren.

## Installation

### Docker / Compose

Vor dem Start im ShieldPM-Dienst außerdem `ipc: host`, das gemeinsame `shm-volume` unter `/dev/shm/check-point` und `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true` aktivieren. Dann die benötigten Container in `compose.yaml` einkommentieren und starten:

```bash
docker compose up -d openappsec-agent openappsec-smartsync openappsec-shared-storage openappsec-tuning-svc openappsec-db
```

Für das optionale Advanced-Modell bindet `compose.yaml` das Host-Verzeichnis `/opt/openappsec` nach `/advanced-model` im Agent ein. Die Datei `/opt/openappsec/open-appsec-advanced-model.tgz` muss vor dem Start vorhanden sein; im Container liegt sie dann unter `/advanced-model/open-appsec-advanced-model.tgz`. Ein direkter Datei-Mount ist ebenfalls möglich, setzt aber eine bereits vorhandene Host-Datei voraus.

### Native / LXC (install.sh)

Interaktiver Installer in `scripts/install.sh` (Abschnitt 15):

```bash
# Im ShieldPM Installationsdialog "OpenAppSec Agent installieren" wählen
# AGENT_TOKEN eingeben für Cloud Portal (oder leer lassen für local_policy.yaml)
# Optional: Pfad zum Advanced ML Model (.tgz) angeben
```

Der Installer nutzt `https://downloads.openappsec.io/open-appsec-install` und kann mit `--auto` oder `--manual` ausgeführt werden.

## Konfigurationsdateien

- **`/etc/cp/conf/local_policy.yaml`** — Lokale Policy (detect-learn / prevent-learn)
- **`/etc/cp/conf/open-appsec-advanced-model.tgz`** — Kopierziel des Native/LXC-Installers für das optionale ML-Archiv; der Installer prüft nicht, ob der laufende Agent das Modell tatsächlich geladen hat.
- **`/opt/openappsec/conf`** — Nginx-Agent-Konfiguration (Volume)
- **`/opt/openappsec/data`** — Agent-Daten (Volume)
- **`/opt/openappsec/logs`** — Logs (Volume)
- **`/opt/openappsec/open-appsec-advanced-model.tgz`** — Optionales Advanced-Modell für Docker; im Agent unter `/advanced-model/open-appsec-advanced-model.tgz`

## Wichtige Dateien

- `compose.yaml` — Container-Definitionen (auskommentiert)
- `scripts/install.sh` — Native Installer
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
