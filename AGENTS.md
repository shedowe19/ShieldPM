# ShieldPM Agent Context

## 1. Project Identity & Purpose
*   **Name**: ShieldPM (Shedowe's Shield Proxy Manager)
*   **Base**: Advanced fork of Nginx Proxy Manager (NPM).
*   **Core Function**: Web UI for managing Nginx Reverse Proxies with heavy emphasis on security (WAF, IPS), modern protocols (HTTP/3, QUIC), and native performance.
*   **Current Version**: `v4.1.0`
*   **Primary Output**: Docker Image (`shedowe19/shieldpm:latest`) & Native Installer Script (`install.sh`).

## 2. Technology Stack & Dependencies
An AI Agent working on this project must be aware of the following stack components:

### Backend (API & Logic)
*   **Runtime**: Node.js `v22+` (Alpine/Debian Trixie)
*   **Framework**: Express.js `v5.2`
*   **ORM**: Objection.js `v3.1` / Knex.js `v3.1`
*   **Database**:
    *   **Development**: SQLite (`better-sqlite3` v12.5)
    *   **Production**: MySQL (`mysql2`) or PostgreSQL (`pg`)
*   **Templating**: EJS (for Nginx config generation)
*   **Path**: `/backend`

### Frontend (UI)
*   **Runtime**: Node.js `v22+`
*   **Build Tool**: Vite `v7.3`
*   **Framework**: React `v19.2` (TypeScript)
*   **State Management**: React Query `v5.90`
*   **Styling**: Tailwind CSS `v3.4`, shadcn/ui (Radix UI)
*   **Path**: `/frontend`

### Infrastructure & Nginx Core
*   **Web Server**: Nginx (OpenResty-based custom build).
*   **Modules**:
    *   `http_v3_module` (QUIC)
    *   `ngx_http_modsecurity_module` (WAF)
    *   `ngx_http_geoip2_module` (GeoIP)
    *   `lua-nginx-module` (Scripting)
    *   `brotli`, `zstd` (Compression)
*   **Security Integrations**:
    *   **CrowdSec**: IPS via Lua Bouncer (Native/Docker).
    *   **OpenAppSec**: AI WAF via Attachment Module (Native/Docker).
    *   **ModSecurity**: CRS v4 (Base WAF).

## 3. Repository Ecology & Build Context
This project relies on **TWO** distinct repositories. The Agent must know which one to modify.

### A. `ShieldPM` (This Repository) - application Logic
*   **Responsibility**: Source code for Backend API, Frontend UI, Database Migrations, and `install.sh`.
*   **Build Output**: The application layer that runs *inside* the container or on the host.
*   **Critical Paths**:
    *   `backend/internal/nginx.js`: Generates Nginx configuration files from DB state.
    *   `backend/templates/`: EJS templates for Nginx configs (`proxy_host.conf`).
    *   `scripts/install.sh`: **The Native Installer**. Handles host setup for LXC/Native deployments.
    *   `rootfs/`: Overlay files copied to the Docker image at build time (e.g. `start.sh`, `launch.sh`).

### B. `shieldpm-nginx` (External Repository) - Base Image & Nginx Core
*   **Responsibility**: Defines the **OS Environment** (Debian Trixie) and compiles **Nginx binaries**.
*   **Contents**:
    *   `Dockerfile`: Compiles Nginx from source with specific modules.
    *   `/etc/nginx/nginx.conf`: The **master** Nginx configuration file.
    *   `crowdsec_nginx.conf`: The Lua init block for CrowdSec.
*   **Relation**: `ShieldPM`'s Dockerfile starts `FROM shedowe19/nginx-quic:latest` (built by `shieldpm-nginx`).
*   **Agent Note**: If you need to change Nginx *compilation flags*, *modules*, or the *root* `nginx.conf`, you must modify `shieldpm-nginx`, not `ShieldPM`.

## 4. Build & Deployment Instructions

### Docker Build (Standard)
To build the full ShieldPM image:
```bash
# Builds frontend, installs backend deps, copies overlays, pulls base image
docker build -t shieldpm:local .
```

### Native / LXC Installation
For Bare Metal or Proxmox LXC usage (no Docker):
```bash
# interactive installer
bash scripts/install.sh
```
**Agent Action**: When modifying `install.sh`, ensure you handle:
1.  **Dependency Checks**: `node`, `npm`, `nginx`, `sqlite3`.
2.  **Service Creation**: `systemd` unit files.
3.  **Parsers/Collections**: Downloading CrowdSec/GeoIP configs to `/etc/` paths.

### Development Environment
```bash
# Frontend
cd frontend
yarn install
yarn dev # Vite dev server

# Backend
cd backend
yarn install
yarn dev # Nodemon
```

## 5. Security Architecture & Integrations

### CrowdSec (IPS)
*   **Docker**: Runs as sidecar container. Logs shared via volume.
*   **Native**: Runs as system service (`crowdsec`).
*   **Integration**:
    *   **Parser**: Custom `type: shieldpm` parser.
    *   **Bouncer**: Nginx Lua Bouncer.
    *   **Config**: `init_by_lua` in `nginx.conf` (via include) initializes the bounce.
    *   **Fix**: `install.sh` downloads `parser.yaml` raw from GitHub to `/etc/crowdsec/parsers/s01-parse/shieldpm.yaml`.

### OpenAppSec (AI WAF)
*   **Modes**:
    *   **Cloud**: Managed via `AGENT_TOKEN` (Central Portal).
    *   **Local**: Managed via `local_policy.yaml` (Declarative).
*   **Integration**: Nginx attachment module loaded dynamically via `.env` (`NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true`).
*   **Model**: Advanced ML Model (`.tgz`) can be injected via `/etc/cp/conf/`.

## 6. Project Structure Map (Agent Reference)

| Path | Responsible Component | Description |
|:---|:---|:---|
| `/backend/internal/nginx.js` | **Configuration Engine** | The "Brain". Orchestrates config generation & reloading. |
| `/backend/templates/*.conf` | **Config Templates** | EJS files defining the structure of Nginx vhosts. |
| `/backend/migrations/*.js` | **Database Schema** | Source of Truth for DB structure. Add new tables here. |
| `/frontend/src/pages/` | **UI Views** | React components for specific pages. |
| `/rootfs/usr/local/bin/` | **Startup Scripts** | `launch.sh`, `start.sh`. Run inside container/service on boot. |
| `/scripts/install.sh` | **Installer** | The Bash script for non-Docker deployments. |
| `/data/` | **Persistent Storage** | Where checking code expects to find/write data. |

## 7. Versioning Strategy
*   **Source of Truth**: `backend/package.json` + `frontend/package.json` + `.version`.
*   **Workflow**:
    *   Check current version.
    *   Determine Patch/Minor/Major impact.
    *   **Ask User**.
    *   Update ALL 3 files.
    *   Tag git commit.

## 8. Agent Capabilities & Restrictions
*   **Can Modify**: All code in `ShieldPM` repo.
*   **Cannot Modify Directly**: Nginx binary compilation (requires `shieldpm-nginx` repo access).
*   **Must Respect**:
    *   **Non-Blocking I/O**: Use `setImmediate` for heavy backend logic.
    *   **Deboucing**: Don't reload Nginx on every single API call.
    *   **Sanitization**: Do not trust user input in Nginx templates.
