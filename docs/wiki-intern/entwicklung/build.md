# Build

## Zweck

Beschreibung des Build-Prozesses für Docker und Native.

## Docker Build

### Multi-Stage Build

Das `Dockerfile` verwendet drei Stages:

#### Stage 1: Frontend

- **Basis**: Debian Trixie mit dem eingecheckten NodeSource-APT-Setup für Node.js 26
- **Aktion**: installiert Yarn Classic `1.22.22` und baut die React-App aus dem eingefrorenen Lockfile mit TypeScript + Vite
- **Ausgabe**: `/app/dist` (statische Dateien)

#### Stage 2: Backend

- **Basis**: dieselbe Debian-Trixie-NodeSource-APT-Runtime mit Node.js 26
- **Aktion**: installiert Node-Dependencies aus dem eingefrorenen Lockfile und lädt Anubis + OAuth2-Proxy herunter
- **Abhängigkeiten**: Es werden ausschließlich Produktionsabhängigkeiten des Backends installiert; Vitest, Biome und TypeScript gelangen nicht mehr aus dieser Stage in das Laufzeitimage.
- **Optimierungen**: Entfernt Source-Maps, strippt native Module
- **Ausgabe**: `/app` (Backend-Anwendung)

#### Stage 3: Final

- **Basis**: `ghcr.io/shedowe19/shieldpm-nginx:master`
- **Aktion**: Kopiert Backend + Frontend + rootfs-Overlay + WireGuard-Tools
- **Entrypoint**: `tini -g -- entrypoint.sh` (Exec-/JSON-Syntax; Stoppsignale an die Prozessgruppe)
- **Healthcheck**: `healthcheck.sh` (Exec-/JSON-Syntax, ohne zusätzliche Shell-Hülle)

### Befehl

```bash
docker build -t shieldpm:local .
```

`.dockerignore` schließt lokale `node_modules`, Builds, Git-Metadaten und eigene `.env`-Dateien aus. Die eingecheckte Standarddatei `rootfs/data/.env` und `rootfs/.env.example` bleiben ausdrücklich im Build-Kontext. Die Frontend-Abhängigkeiten werden vor dem Kopieren des übrigen Quellcodes installiert, damit reine Quellcodeänderungen den Dependency-Cache erhalten.

### GitHub-Actions-Builds bei Pull Requests

Pull Requests aus demselben Repository melden sich mit dem vorhandenen `GITHUB_TOKEN` bei GHCR an, damit die finale Stage das Nginx-Basisimage laden kann. Das Package muss dem Workflow-Repository Lesezugriff gewähren. Ohne Anmeldung lieferte GHCR im PR-Build HTTP 401 beim Abruf des Basisimages.

PR-Builds laden das fertige Image nur in den lokalen Docker-Daemon des Runners (`load: true`, `push: false`); Registry-Push, Multiarch-Veröffentlichung und Releases bleiben auf Ereignisse außerhalb von Pull Requests begrenzt. Fork-PRs erhalten über den Login-Schritt keine Registry-Zugangsdaten und benötigen ein anonym zugängliches Basisimage für den vollständigen Build.

Direkt nach dem Laden führt `scripts/ci/docker-smoke.sh` in beiden PR-Build-Jobs einen echten Containerstart mit PUID/PGID `0` und `1000` aus. Die Runner `ubuntu-latest` und `ubuntu-24.04-arm` passen nativ zu ihren Images; QEMU ist dafür nicht erforderlich. Jeder Container erhält ein eigenes temporäres Datenvolume und `--network none`. `TZ=UTC`, deaktiviertes IPv6 und `SKIP_IP_RANGES=true` halten die Prüfung unabhängig von externen Diensten.

Ein ausdrücklich als Testfixture gekennzeichneter Marker im ACME-Account-Verzeichnis überspringt ausschließlich die sonst vor dem Dienststart versuchte Registrierung. Er enthält keine Zugangsdaten und ist kein nutzbarer ACME-Account. Die Prüfung wartet höchstens 180 Sekunden pro Container auf den vorhandenen Healthcheck. Anschließend prüft sie als jeweilige Service-UID den Backend-Socket, schreibt in die generierte Standardkonfiguration und das Certbot-Plugin-Verzeichnis, führt `nginx -tq`, Reload und Healthcheck aus und kontrolliert, dass `/run`, `/tmp` und `/usr/local` weiterhin Root gehören. Bei Fehlern werden Status und begrenzte Containerlogs ausgegeben; Container, Volumes und lokale Fixtures werden auch im Fehlerfall entfernt. Der Workflow-Schritt ist zusätzlich auf zehn Minuten begrenzt.

Lokal verwendet `bash scripts/ci/docker-smoke.sh IMAGE` ausschließlich ein bereits geladenes Image derselben Architektur. `scripts/tests/test_docker_smoke.py` prüft Erfolg, Health-Timeout und Schreibfehler einschließlich Cleanup mit einem simulierten Docker-CLI; erst der PR-Build führt den tatsächlichen Docker-Lauf aus.

## Frontend Build (standalone)

```bash
cd frontend
yarn install --production=false
yarn tsc          # TypeScript-Prüfung
yarn vite build   # Produktions-Build
```

### Modulpfade

`frontend/vite.config.ts` aktiviert Vites nativen Resolver mit `resolve.tsconfigPaths: true`. Damit gelten die
Alias-Pfade aus `frontend/tsconfig.json` (`src/*`, `@/*` und `test/*`) im Entwicklungsserver, in Vitest und im
Produktions-Build ohne das zusätzliche Plugin `vite-tsconfig-paths`.

## Native / LXC Build

Vor dem Export des LXC-Rootfs entfernt der Workflow SSH-Hostkeys und leert die Maschinen-ID. Ein aktivierter Systemd-Dienst erzeugt fehlende SSH-Hostkeys vor dem SSH-Start pro Instanz. Bereinigungs-Globs werden innerhalb des Builder-Containers ausgewertet, damit sie dessen Dateisystem erfassen.

Der Installer erwartet das entpackte native Release-Paket mit `app/`, `html/`, `usr/` und `rootfs/`. Dieses Paket enthält die zuvor gebauten Anwendungsdateien und Nginx-Binaries; der Installer klont das Repository nicht. Ein Aufruf der einzelnen `scripts/install.sh` aus einem normalen Checkout ersetzt das native Paket nicht.

```bash
tar -xzf shieldpm-install-linux-amd64.tar.gz
sudo bash install.sh
```

## Build-Artefakte

Die aktuelle Version wird in `.version` gespeichert (Plain Text, z.B. `v4.3.2`). Diese Version synchronisiert sich mit `backend/package.json` und `frontend/package.json`.

| Artefakt            | Pfad                          | Beschreibung           |
| ------------------- | ----------------------------- | ---------------------- |
| Frontend-Bundle     | `frontend/dist/`              | Kompiliertes React SPA |
| Anubis Binary       | `/usr/local/bin/anubis`       | PoW-Gate               |
| OAuth2-Proxy Binary | `/usr/local/bin/oauth2-proxy` | SSO-Proxy              |
| rootfs-Overlay      | `/` (im Container)            | System-Konfiguration   |

## Verwandte Seiten

- [Deployment](./deployment.md)
- [Setup](./setup.md)
