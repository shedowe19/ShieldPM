# Build

## Zweck

Beschreibung des Build-Prozesses für Docker und Native.

## Docker Build

### Multi-Stage Build

Das `Dockerfile` verwendet drei Stages:

#### Stage 1: Frontend

- **Basis**: Debian Trixie mit dem eingecheckten, signierten NodeSource-APT-Setup für Node.js 24 LTS
- **Aktion**: aktiviert Corepack, installiert die in `packageManager` fixierte Yarn-4-Version und baut aus dem
  unveränderten Lockfile (`yarn install --immutable`)
- **Ausgabe**: `/app/dist` (statische Dateien)

#### Stage 2: Backend

- **Basis**: dieselbe Debian-Trixie-NodeSource-APT-Runtime mit Node.js 24 LTS
- **Aktion**: installiert Backend-Abhängigkeiten immutable und lädt verifizierte Anubis-/OAuth2-Proxy-Artefakte
- **Optimierungen**: Entfernt Source-Maps, strippt native Module
- **Ausgabe**: `/app` (Backend-Anwendung)

#### Stage 3: Final

- **Basis**: explizites `SHIELDPM_NGINX_IMAGE=ghcr.io/shedowe19/shieldpm-nginx@sha256:<digest>`
- **Aktion**: Kopiert Backend + Frontend + rootfs-Overlay + WireGuard-Tools
- **Entrypoint**: `tini -- entrypoint.sh` (Exec-/JSON-Syntax)
- **Healthcheck**: `healthcheck.sh` (Exec-/JSON-Syntax, ohne zusätzliche Shell-Hülle)

### Befehl

```bash
export SHIELDPM_NGINX_IMAGE='ghcr.io/shedowe19/shieldpm-nginx@sha256:<approved-multiarch-digest>'
docker build --build-arg SHIELDPM_NGINX_IMAGE="$SHIELDPM_NGINX_IMAGE" -t shieldpm:local .
```

## Frontend Build (standalone)

```bash
cd frontend
corepack enable
yarn install --immutable
yarn check
yarn build
```

### Modulpfade

`frontend/vite.config.ts` aktiviert Vites nativen Resolver mit `resolve.tsconfigPaths: true`. Damit gelten die
Alias-Pfade aus `frontend/tsconfig.json` (`src/*`, `@/*` und `test/*`) im Entwicklungsserver, in Vitest und im
Produktions-Build ohne das zusätzliche Plugin `vite-tsconfig-paths`.

## Native / LXC Build

Der Installer prüft das externe Release-Archiv vor dem Entpacken und anschließend jede Payload-Datei gegen das
mitgelieferte `SHA256SUMS`-Manifest. Er richtet Node.js 24 LTS ein, aktiviert exakt Corepack 0.36.0 und Yarn 4.18.0,
baut in einem Staging-Verzeichnis aus immutable Lockfiles und aktiviert den Payload erst nach erfolgreichem Build. Ein
Update nutzt eine atomare Umschaltung mit Health-Check und Payload-Rollback.

```bash
bash scripts/install.sh
```

## Build-Artefakte

Die Release-Version wird in `.version`, `backend/package.json` und `frontend/package.json` synchron gehalten. Ein
Versionssprung erfolgt nur nach expliziter Patch-/Minor-/Major-Entscheidung.

Der Build akzeptiert das externe Basisimage ausschließlich über `SHIELDPM_NGINX_IMAGE` im Format
`ghcr.io/shedowe19/shieldpm-nginx@sha256:<digest>`. Der freigegebene Multiarch-Digest muss als Repository-Variable
gesetzt werden; keinen Digest erfinden oder aus einem anderen Build-Kontext übernehmen.

| Artefakt            | Pfad                          | Beschreibung           |
| ------------------- | ----------------------------- | ---------------------- |
| Frontend-Bundle     | `frontend/dist/`              | Kompiliertes React SPA |
| Anubis Binary       | `/usr/local/bin/anubis`       | PoW-Gate               |
| OAuth2-Proxy Binary | `/usr/local/bin/oauth2-proxy` | SSO-Proxy              |
| rootfs-Overlay      | `/` (im Container)            | System-Konfiguration   |

## Verwandte Seiten

- [Deployment](./deployment.md)
- [Setup](./setup.md)
