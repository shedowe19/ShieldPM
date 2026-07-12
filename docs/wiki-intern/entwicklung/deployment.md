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

## CI/CD (GitHub Workflows)

Workflows unter `.github/workflows/`:

| Datei                                     | Zweck                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker.yml`                              | Multi-Plattform-Docker-Image-Build und Push nach `ghcr.io`                                                                                                                                                                                                                                            |
| `docker-latest.yml`                       | Latest-Tag-Update                                                                                                                                                                                                                                                                                     |
| `dockerlint.yml`                          | Hadolint-Check für Dockerfile                                                                                                                                                                                                                                                                         |
| `caddy.yml`                               | Build des Caddy-Sidecar-Image (`shieldpm:caddy`)                                                                                                                                                                                                                                                      |
| `caddy-fmt.yml`                           | Formatierungs-Check für `caddy/Caddyfile`                                                                                                                                                                                                                                                             |
| `codeql.yml`                              | Statische Sicherheitsanalyse (GitHub CodeQL)                                                                                                                                                                                                                                                          |
| `lint-and-format.yml`                     | Nicht-mutierende Quality-Gates: hunkbasierter Diff-/Token-Schutz mit Empty-Tree-Fallback bei fehlender Vergleichsrevision, diff-basierter Biome-Check, Backend-/Frontend-Tests, Locale-/Build-Check und Audit ab Schweregrad High (bis zur Bereinigung der bestehenden Lockfile-Funde nur berichtend) |
| `shellcheck.yml`                          | Lint für `scripts/install.sh` und Rootfs-Shell-Scripts                                                                                                                                                                                                                                                |
| `json.yml`                                | JSON-Lint (Schema-Files, RBAC-Rules)                                                                                                                                                                                                                                                                  |
| `spellcheck.yml`                          | codespell mit Skip-Liste (siehe Konfig im Workflow)                                                                                                                                                                                                                                                   |
| `dependency-updates.yml`                  | Renovate-Trigger / Updater                                                                                                                                                                                                                                                                            |
| `npm-updates.yml`                         | NPM-Update-Helper                                                                                                                                                                                                                                                                                     |
| `wiki-sync.yml`                           | Synchronisiert `docs/wiki/` mit dem GitHub-Wiki-Repo                                                                                                                                                                                                                                                  |
| `.github/codeql/codeql-config.yml`        | CodeQL-Analyse-Konfiguration                                                                                                                                                                                                                                                                          |
| `.github/delete-merged-branch-config.yml` | GitHub Auto-Delete Merged Branch Konfiguration                                                                                                                                                                                                                                                        |

## Hilfs-Skripte

- `scripts/install.sh` — Native/LXC-Installer (siehe oben).
- `scripts/generate-notices.js` — generiert `THIRD-PARTY-NOTICES.md` aus den NPM-Lizenzen.
- `scripts/wiki-graph.py` — erzeugt die interaktive Beziehungs-Visualisierung des internen Wikis (`docs/wiki-intern/wiki-graph.html`). Nutzt `scripts/lib/vis-network.min.js` als Abhängigkeit.

## Verwandte Seiten

- [Build](./build.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
- [Docker Compose Referenz](../../wiki/Docker-Compose-Reference.md)
- [Caddy-Sidecar](../konfiguration/config-dateien.md)
