# Deployment

## Zweck

Dokumentation der Deployment-Optionen.

## Docker (Standard)

```bash
# compose.yaml herunterladen
curl -o compose.yaml https://raw.githubusercontent.com/shedowe19/ShieldPM/refs/heads/develop/compose.yaml

# Anpassen: TZ, ACME_EMAIL, etc.
# Starten
docker compose up -d
```

**Port**: UI auf `:81`, HTTP auf `:80`, HTTPS auf `:443`, GoAccess auf `:91`

**Image**: `ghcr.io/shedowe19/shieldpm:develop`

**Persistente Daten**: `/opt/shieldpm` → gemountet nach `/data` im Container.

## Native / LXC (Proxmox)

```bash
bash scripts/install.sh
```

Der Installer:

1. Prüft Abhängigkeiten (Node, npm, Nginx, sqlite3, certbot)
2. Erstellt systemd-Unit-Files
3. Lädt CrowdSec-Parser/Collections herunter
4. Installiert Frontend und Backend

## Optionale Sidecar-Services

| Service          | Image                                | Zweck                 |
| ---------------- | ------------------------------------ | --------------------- |
| CrowdSec         | `crowdsecurity/crowdsec:latest`      | IPS                   |
| MySQL            | `mysql:8`                            | Produktions-DB        |
| PostgreSQL       | `postgres:17-bookworm`               | Produktions-DB        |
| GeoIP-Update     | `ghcr.io/maxmind/geoipupdate:latest` | GeoIP-Daten           |
| Caddy            | `ghcr.io/shedowe19/shieldpm:caddy`   | HTTP→HTTPS Redirector |
| OpenAppSec-Agent | `ghcr.io/openappsec/agent:latest`    | AI WAF                |

## Versionierung

- **Source of Truth**: `.version` + `backend/package.json` + `frontend/package.json`
- Alle drei müssen synchron gehalten werden
- Aktueller Stand: `4.3.2`

## Verwandte Seiten

- [Build](./build.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
- [Docker Compose Referenz](../../wiki/Docker-Compose-Reference.md)
