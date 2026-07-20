# Build

## Zweck

Beschreibung des Build-Prozesses für Docker und Native.

## Docker Build

### Multi-Stage Build

Das `Dockerfile` verwendet drei Stages:

#### Stage 1: Frontend

- **Basis**: offizielles, per Multiarch-Manifest-Digest gepinntes `node:22-bookworm-slim`
- **Aktion**: installiert Yarn Classic `1.22.22` und baut die React-App aus dem eingefrorenen Lockfile mit TypeScript + Vite
- **Ausgabe**: `/app/dist` (statische Dateien)

#### Stage 2: Backend

- **Basis**: dasselbe gepinnte `node:22-bookworm-slim`
- **Aktion**: installiert Node-Dependencies aus dem eingefrorenen Lockfile und lädt Anubis + OAuth2-Proxy herunter
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
yarn install --production=false
yarn tsc          # TypeScript-Prüfung
yarn vite build   # Produktions-Build
```

### Modulpfade

`frontend/vite.config.ts` aktiviert Vites nativen Resolver mit `resolve.tsconfigPaths: true`. Damit gelten die
Alias-Pfade aus `frontend/tsconfig.json` (`src/*`, `@/*` und `test/*`) im Entwicklungsserver, in Vitest und im
Produktions-Build ohne das zusätzliche Plugin `vite-tsconfig-paths`.

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
- [Setup](./setup.md)
