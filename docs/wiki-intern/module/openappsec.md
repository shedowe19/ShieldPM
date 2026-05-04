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

Alle Container sind in `compose.yaml` auskommentiert und können einzeln aktiviert werden.

## Integration

### Nginx-Modul

Das OpenAppSec Nginx-Attachment-Modul ist **bereits in ShieldPMs Nginx-Image integriert** (kompiliert). Aktivierung:

```bash
# In /data/.env
NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true
```

Das Modul wird in `rootfs/usr/local/bin/start.sh` geladen (Zeile 496). Beim Aktivieren werden automatisch **Brotli und Zstd deaktiviert**, da das Modul mit diesen Kompressionsformaten nicht kompatibel ist:

```bash
# Deaktiviert: brotli on → brotli off
# Deaktiviert: zstd on → zstd off
```

### Cloud vs. Lokal

| Modus            | Konfiguration                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| **Cloud Portal** | `AGENT_TOKEN` in `.env` / beim Installieren angeben → Verwaltung über https://my.openappsec.io |
| **Lokal**        | `local_policy.yaml` unter `/etc/cp/conf/local_policy.yaml`                                     |

Standardmäßig läuft OpenAppSec im **detect-learn Modus** (nur Logging, kein Blockieren). Ändern zu `prevent-learn` für aktives Blockieren.

## Installation

### Docker / Compose

Container in `compose.yaml` einkommentieren und starten:

```bash
docker compose up -d openappsec-agent openappsec-smartsync openappsec-shared-storage openappsec-tuning-svc openappsec-db
```

### Native / LXC (install.sh)

Interactive Installer in `scripts/install.sh` (Abschnitt 15, Zeile 527–626):

```bash
# Im ShieldPM Installationsdialog "OpenAppSec Agent installieren" wählen
# AGENT_TOKEN eingeben für Cloud Portal (oder leer lassen für local_policy.yaml)
# Optional: Pfad zum Advanced ML Model (.tgz) angeben
```

Der Installer nutzt `https://downloads.openappsec.io/open-appsec-install` und kann mit `--auto` oder `--manual` ausgeführt werden.

## Konfigurationsdateien

- **`/etc/cp/conf/local_policy.yaml`** — Lokale Policy (detect-learn / prevent-learn)
- **`/etc/cp/conf/open-appsec-advanced-model.tgz`** — Optionales ML-Modell für verbesserte Erkennung
- **`/opt/openappsec/conf`** — Nginx-Agent-Konfiguration (Volume)
- **`/opt/openappsec/data`** — Agent-Daten (Volume)
- **`/opt/openappsec/logs`** — Logs (Volume)

## Wichtige Dateien

- `compose.yaml` (Zeilen 263–333) — Container-Definitionen (auskommentiert)
- `scripts/install.sh` (Zeilen 527–626) — Native Installer
- `rootfs/usr/local/bin/start.sh` (Zeile 496–503) — Nginx-Modul Loading Logik
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
- [Anubis](./anubis.md)
- [Proxy-Host](./proxy-host.md)
- [Architektur-Überblick](../architektur/ueberblick.md)
- [Modulübersicht](./README.md)
