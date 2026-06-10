# Build

## Zweck

Beschreibung des Build-Prozesses für Docker und Native.

## Docker Build

### Multi-Stage Build

Das `Dockerfile` verwendet drei Stages:

#### Stage 1: Frontend

- **Basis**: `debian:trixie-slim`
- **Aktion**: Installiert Node.js/npm, aktiviert Corepack (Yarn 4.15.0), baut React-App mit TypeScript + Vite
- **Ausgabe**: `/app/dist` (statische Dateien)

#### Stage 2: Backend

- **Basis**: `debian:trixie-slim`
- **Aktion**: Installiert Node.js-Dependencies, lädt Anubis + OAuth2-Proxy herunter
- **Optimierungen**: Entfernt Source-Maps, strippt native Module
- **Ausgabe**: `/app` (Backend-Anwendung)

#### Stage 3: Final

- **Basis**: `ghcr.io/shedowe19/shieldpm-nginx:master`
- **Aktion**: Kopiert Backend + Frontend + rootfs-Overlay + WireGuard-Tools
- **Entrypoint**: `tini -- entrypoint.sh`
- **Healthcheck**: `healthcheck.sh`

### Befehl

```bash
docker build -t shieldpm:local .
```

## Frontend Build (standalone)

```bash
cd frontend
yarn install
yarn tsc          # TypeScript-Prüfung
yarn vite build   # Produktions-Build
```

## Native / LXC Build

Kein Build nötig — der `install.sh`-Installer clont das Repository und installiert direkt.

```bash
bash scripts/install.sh
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
- [CI-Workflows](./ci-workflows.md)
- [Setup](./setup.md)
- [Yarn v4 Migration](../entscheidungen/2026-05-20-yarn-v4-migration.md)
