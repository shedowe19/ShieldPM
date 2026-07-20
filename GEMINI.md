# ShieldPM Agent Context

> [!IMPORTANT]
> **This document is the SOURCE OF TRUTH for any AI Agent working on this project.**
> It must be kept identical to `GEMINI.md`.
>
> **Also read these companion files:**
>
> - **`.cursorrules`** — Coding standards, naming conventions, critical rules, and anti-patterns.
> - **`AGENTS.md`** — Dynamic skill discovery (via `.agent/skills/CATALOG.md`), common code patterns, and project constraints.
> - **`.agent/skills/CATALOG.md`** — Full catalog of 950+ AI skills. Search by keyword before starting any task.

## 1. Project Identity & Purpose

* **Name**: ShieldPM (Shedowe's Shield Proxy Manager)
- **Base**: Advanced fork of Nginx Proxy Manager (NPM).
- **Core Function**: Web UI for managing Nginx Reverse Proxies with heavy emphasis on security (WAF, IPS), modern protocols (HTTP/3, QUIC), and native performance.
- **Current Version**: `v4.3.2`
- **Primary Output**: Docker Image (`shedowe19/shieldpm:latest`) & Native Installer Script (`install.sh`).

### Key Features

* **Proxy Management**: HTTP/HTTPS/HTTP3, Streams (TCP/UDP), Redirections, 404 Hosts.
- **Security**: WAF (ModSecurity/OpenAppSec), IPS (CrowdSec), Access Lists (Basic Auth/mTLS), SSL (Let's Encrypt/Custom).
- **Advanced Networking**: Cloudflare Tunnels (no open ports), Tor Onion Services, Dynamic DNS (DDNS).
- **Maintenance**: Scheduled Windows & Failure pages.
- **Tools**: Web-based Terminal (SSH), GitOps (Backup/Sync), ChatOps (Telegram).
- **Enhancements**: Service Icons, Dashboard Notes, Custom PHP Configuration.

## 2. Technology Stack & Dependencies

The Agent must be aware of these specific versions and libraries:

### Backend (API & Logic)

* **Runtime**: Node.js `v26+` (Debian Trixie via NodeSource APT)
- **Framework**: Express.js `v5.2`
- **ORM**: Objection.js `v3.1` / Knex.js `v3.1`
- **Database**:
  - **Development**: SQLite (`better-sqlite3` v12.6)
  - **Production**: MySQL (`mysql2`) or PostgreSQL (`pg`)
- **AI Integration**: `@google/generative-ai` (Gemini), `node-fetch` (Ollama/OpenAI Compatible)
- **Management**: `dockerode` (Docker API), `isomorphic-git` (GitOps), `telegraf` (ChatOps/Telegram), `ssh2` (Remote), `ws` (WebSockets)
- **Path**: `/backend`

### Frontend (UI)

* **Runtime**: Node.js `v26+`
- **Build Tool**: Vite `v7.3`
- **Framework**: React `v19.2` (TypeScript)
- **State Management**: React Query `v5.90`
- **Styling**: Tailwind CSS `v3.4`, shadcn/ui (Radix UI)
- **Path**: `/frontend`

### Infrastructure & Nginx Core

* **Web Server**: Nginx (OpenResty-based custom build).
- **Modules**:
  - `http_v3_module` (QUIC)
  - `ngx_http_modsecurity_module` (WAF)
  - `ngx_http_geoip2_module` (GeoIP)
  - `lua-nginx-module` (Scripting)
  - `brotli`, `zstd` (Compression)
- **Security Integrations**:
  - **CrowdSec**: IPS via Lua Bouncer.
  - **OpenAppSec**: AI WAF via Attachment Module.
  - **ModSecurity**: CRS v4 (Base WAF).

## 3. Repository Ecology & Build Context

This project relies on **TWO** distinct repositories. The Agent must know which one to modify.

> [!CAUTION]
> **DO NOT confuse these repositories.** Modifications to the wrong repo will be lost or ineffective.

### A. `ShieldPM` (This Repository) - Application Logic

* **Responsibility**: Source code for Backend API, Frontend UI, Database Migrations, and `install.sh`.
- **Build Output**: The application layer that runs *inside* the container or on the host.
- **Critical Paths**:
  - `backend/internal/nginx.js`: Generates Nginx configuration files from DB state.
  - `backend/templates/`: EJS templates for Nginx configs (`proxy_host.conf`).
  - `scripts/install.sh`: **The Native Installer**. Handles host setup for LXC/Native deployments.
  - `rootfs/`: Overlay files copied to the Docker image at build time (e.g. `start.sh`, `launch.sh`).

### B. `shieldpm-nginx` (External Repository) - Base Image & Nginx Core

* **Responsibility**: Defines the **OS Environment** (Debian Trixie) and compiles **Nginx binaries**.
- **Contents**:
  - `Dockerfile`: Compiles Nginx from source with specific modules.
  - `/etc/nginx/nginx.conf`: The **master** Nginx configuration file.
  - `crowdsec_nginx.conf`: The Lua init block for CrowdSec.
- **Relation**: `ShieldPM`'s Dockerfile starts `FROM ghcr.io/shedowe19/shieldpm-nginx:master` (built by `shieldpm-nginx`).
- **Agent Note**: If you need to change Nginx *compilation flags*, *modules*, or the *root* `nginx.conf`, you must modify `shieldpm-nginx`, not `ShieldPM`.

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

1. **Dependency Checks**: `node`, `npm`, `nginx`, `sqlite3`, `python3-certbot-nginx`.
2. **Service Creation**: `systemd` unit files.
3. **Parsers/Collections**: Downloading CrowdSec/GeoIP configs to `/etc/` paths (using raw GitHub URLs).

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

* **Docker**: Sidecar container. Login parsed via `type: shieldpm`.
- **Native**: System service. `install.sh` downloads parser/collection directly to `/etc/crowdsec/`.
- **Nginx**: Uses Lua Bouncer (`init_by_lua` in `crowdsec_nginx.conf`).

### OpenAppSec (AI WAF)

* **Agent**: Runs as service/container.
- **Management**: Cloud (Connector using `AGENT_TOKEN`) or Local (`local_policy.yaml`).
- **Nginx**: Attachment module dynamic load via `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true`.
- **Advanced Model**: `.tgz` file support for ML model upgrades.

### ChatOps (Telegram)

* **Engine**: `telegraf` running in backend.
- **Auth**: Whitelists Telegram User IDs (`allowed_ids`).
- **Access**: Synthesizes internal temporary JWT tokens (`ctx.shieldAccess`) for authenticated AI interaction.

## 6. Internal Systems Deep Dive

### 6.1 Nginx Configuration Engine (`backend/internal/nginx.js`)

* **Core Logic**: Reads DB state -> Renders EJS Templates (`backend/templates/`) -> Writes `.conf` files to `/data/nginx/`.
- **Reload Strategy**: Uses debounced `nginx -s reload` (2s delay) to prevent CPU spikes.
- **Validation**: `nginx -t` validation before reload is **disabled** for speed, trusting the templates (Risk: Template errors break Nginx).

### 6.2 AI Core (`backend/internal/ai/`)

* **Orchestrator**: `executor.js` manages the chat loop.
- **Providers**: `providers.js` supports:
  - **Google Gemini**: via `@google/generative-ai`.
  - **Local LLM**: Ollama / OpenAI Compatible.
- **Tools**: `tools.js` defines executable functions users can invoke via chat.
- **Prompt**: `prompt.js` contains the System Prompt.

### 6.3 GitOps (`backend/internal/gitops.js`)

* **Engine**: `isomorphic-git`.
- **Use Case**: Syncs ShieldPM configuration (exported as JSON/YAML) to/from a remote Git repository.
- **Auth**: SSH Keys or HTTPS Tokens.

### 6.4 Tor Onion Services (`backend/internal/tor.js`)

* **Management**: Controls Tor process via `tor-control-port`.
- **Data**: Writes Hidden Service config to `/data/tor/`.
- **Output**: Reads `hostname` file to display Onion Address to user.

## 7. Project Structure Map (Agent Reference)

| Path | Responsible Component | Description |
|:---|:---|:---|
| `/backend/internal/nginx.js` | **Configuration Engine** | The "Brain". Orchestrates config generation. |
| `/backend/internal/ai/` | **AI Agent** | AI Logic, Providers, Tools. |
| `/backend/internal/chat.js` | **ChatOps** | Telegram Bot logic. |
| `/backend/templates/*.conf` | **Config Templates** | EJS files defining Nginx vhosts. |
| `/backend/migrations/*.js` | **Database Schema** | Source of Truth for DB structure. |
| `/frontend/src/pages/` | **UI Views** | React components for specific pages. |
| `/rootfs/usr/local/bin/` | **Startup Scripts** | `launch.sh`, `start.sh`. Run inside container/service on boot. |
| `/scripts/install.sh` | **Installer** | The Bash script for non-Docker deployments. |
| `/data/` | **Persistent Storage** | **Contract**: All dynamic data MUST reside here. |

## 8. Agent Cookbook

### Adding a New Locale

1. Create `frontend/src/locale/lang/XX.json`.
2. Update `frontend/src/locale/index.ts`.

### Adding a New Service Integration (e.g. Slack)

1. Add dependency (e.g. `@slack/bolt`) to `backend/package.json`.
2. Create `backend/models/slack_integration.js`.
3. Create key in `backend/internal/chat.js` or new `backend/internal/slack.js`.
4. Implement Auth logic similar to Telegram (`allowed_ids`).

### Creating a Database Migration

1. **Naming Convention**: `backend/migrations/YYYYMMDDHHMMSS_description.js` (UTC Timestamp).
2. **Template** (ESM):

```javascript
import { migrate as logger } from "../logger.js";

const migrateName = "unique_migration_name";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
    logger.info(`[${migrateName}] Migrating Up...`);

    return knex.schema
        .createTable("table_name", (table) => {
            table.increments("id").primary();
            table.string("created_on").notNullable().defaultTo(knex.fn.now());
            table.string("modified_on").notNullable().defaultTo(knex.fn.now());
            // Add other columns here
        })
        .then(() => {
            logger.info(`[${migrateName}] Table 'table_name' created`);
        });
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
    logger.info(`[${migrateName}] Migrating Down...`);

    return knex.schema.dropTable("table_name").then(() => {
        logger.info(`[${migrateName}] Table 'table_name' dropped`);
    });
};

export { up, down };
```

## 9. Versioning Strategy

* **Source of Truth**: `backend/package.json` + `frontend/package.json` + `.version`.
- **Workflow**:
  - Check current version.
  - Determine Patch/Minor/Major impact.
  - **Ask User**.
  - Update ALL 3 files.
  - Tag git commit.
