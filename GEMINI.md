# ShieldPM Agent Context

> [!IMPORTANT]
> **This document is the SOURCE OF TRUTH for any AI Agent working on this project.**
> Keep dependency versions aligned with `backend/package.json` and `frontend/package.json`.
>
> **Also read these companion files:**
>
> - **`.cursorrules`** — Coding standards, naming conventions, critical rules, and anti-patterns.
> - **`AGENTS.md`** — Dynamic skill discovery (via `.agent/skills/CATALOG.md`), common code patterns, and project constraints.
> - **`.agent/skills/CATALOG.md`** — Full catalog of 950+ AI skills. Search by keyword before starting any task.

## 1. Project Identity & Purpose

- **Name**: ShieldPM (Shedowe's Shield Proxy Manager)

* **Base**: Advanced fork of Nginx Proxy Manager (NPM).
* **Core Function**: Web UI for managing Nginx Reverse Proxies with heavy emphasis on security (WAF, IPS), modern protocols (HTTP/3, QUIC), and native performance.
* **Current Version**: `v4.4.1`
* **Primary Output**: Docker Image (`shedowe19/shieldpm:develop`) & Native Installer Script (`install.sh`).

### Key Features

- **Proxy Management**: HTTP/HTTPS/HTTP3, Streams (TCP/UDP), Redirections, 404 Hosts.
- **Proxy Host Observability**: Optional HTTP(S)/TCP upstream checks with bounded history and Telegram status alerts; on-demand DNS, TLS, route, upstream, auth, and WebSocket diagnostics.
- **Configuration Preview**: Read-only Nginx draft and active-config diff while creating or editing a proxy host. Saving performs the Nginx syntax check and reload.

* **Security**: WAF (ModSecurity/OpenAppSec), IPS (CrowdSec), Access Lists (Basic Auth/mTLS), SSL (Let's Encrypt/Custom).
* **IP Firewall per Proxy Host**: Reusable TXT/HTTPS IP and CIDR lists, host-specific IP/ASN blocks, optional country filtering through the existing Analytics GeoIP source, address exceptions, and a reasoned blocking page. Disabled by default on existing hosts; configured in `proxy_host.meta.ip_firewall` and managed through `/api/nginx/firewall-lists` using the existing `access_lists` permission. See [IP firewall internals](./docs/wiki-intern/module/ip-firewall.md).
* **Advanced Networking**: Cloudflare Tunnels (no open ports), Tor Onion Services, Dynamic DNS (DDNS).
* **Maintenance**: Scheduled Windows & Failure pages.
* **Tools**: Web-based Terminal (SSH), GitOps (Backup/Sync), ChatOps (Telegram).
* **Enhancements**: Service Icons, Dashboard Notes, Custom PHP Configuration.

## 2. Technology Stack & Dependencies

The Agent must be aware of these specific versions and libraries:

### Backend (API & Logic)

- **Runtime**: Node.js `v26+` (Debian Trixie via NodeSource APT)

* **Framework**: Express.js `v5.2`
* **ORM**: Objection.js `v3.1` / Knex.js `v3.3`
* **Database**:
  - **Development**: SQLite (`better-sqlite3` v13)
  - **Production**: MySQL (`mysql2`) or PostgreSQL (`pg`)
* **AI Integration**: `@google/generative-ai` (Gemini), native `fetch` (Ollama/OpenAI Compatible)
* **Management**: `dockerode` (Docker API), `isomorphic-git` (GitOps), `telegraf` (ChatOps/Telegram), `ssh2` (Remote), `ws` (WebSockets)
* **Path**: `/backend`

### Frontend (UI)

- **Runtime**: Node.js `v26+`

* **Build Tool**: Vite `v8.3`
* **Framework**: React `v19.3` (TypeScript)
* **State Management**: React Query `v5.104`
* **Styling**: Tailwind CSS `v4.3`, shadcn/ui (Radix UI)
* **Path**: `/frontend`

### Infrastructure & Nginx Core

- **Web Server**: Nginx (OpenResty-based custom build).

* **Modules**:
  - `http_v3_module` (QUIC)
  - `ngx_http_modsecurity_module` (WAF)
  - `ngx_http_geoip2_module` (GeoIP)
  - `lua-nginx-module` (Scripting)
  - `brotli`, `zstd` (Compression)
* **Security Integrations**:
  - **CrowdSec**: IPS via Lua Bouncer.
  - **OpenAppSec**: AI WAF via Attachment Module.
  - **ModSecurity**: CRS v4 (Base WAF).

## 3. Repository Ecology & Build Context

This project relies on **TWO** distinct repositories. The Agent must know which one to modify.

> [!CAUTION]
> **DO NOT confuse these repositories.** Modifications to the wrong repo will be lost or ineffective.

### A. `ShieldPM` (This Repository) - Application Logic

- **Responsibility**: Source code for Backend API, Frontend UI, Database Migrations, and `install.sh`.

* **Build Output**: The application layer that runs _inside_ the container or on the host.
* **Critical Paths**:
  - `backend/internal/nginx.js`: Generates Nginx configuration files from DB state.
  - `backend/templates/`: Liquid templates for Nginx configs (`proxy_host.conf`).
  - `scripts/install.sh`: **The Native Installer**. Handles host setup for LXC/Native deployments.
  - `rootfs/`: Overlay files copied to the Docker image at build time (e.g. `start.sh`, `launch.sh`).

### B. `shieldpm-nginx` (External Repository) - Base Image & Nginx Core

- **Responsibility**: Defines the **OS Environment** (Debian Trixie) and compiles **Nginx binaries**.

* **Contents**:
  - `Dockerfile`: Compiles Nginx from source with specific modules.
  - `/etc/nginx/nginx.conf`: The **master** Nginx configuration file.
  - `crowdsec_nginx.conf`: The Lua init block for CrowdSec.
* **Relation**: `ShieldPM`'s Dockerfile starts `FROM ghcr.io/shedowe19/shieldpm-nginx:master` (built by `shieldpm-nginx`).
* **Agent Note**: If you need to change Nginx _compilation flags_, _modules_, or the _root_ `nginx.conf`, you must modify `shieldpm-nginx`, not `ShieldPM`.

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

1. **Dependency Checks**: `node`, `npm`, `nginx`, `sqlite3`, `python3`, `curl`, `libmaxminddb0`, `python3-certbot-nginx`.
2. **Service Creation**: `systemd` unit files.
3. **Parsers/Collections**: CrowdSec configurations under `/etc/`; shared Docker/native GeoIP provisioning runs at startup after loading `/data/.env`, before environment validation or services.

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

### TScanner project conventions

The independent private `.tscanner/` package pins TScanner 0.1.3 and Babel parser/traverse 8.0.7. With Node 26+ and
Yarn Classic 1.22.22, install it using `yarn --cwd .tscanner install --frozen-lockfile --ignore-scripts --production=false`.
For VSCode, run `node .tscanner/scripts/editor.mjs` to set the pinned native binary in ignored local settings, preserving other settings.
Run `node scripts/ci/tscanner.mjs` and `yarn --cwd .tscanner test` from the repository. Configuration lives in
`.tscanner/config.jsonc`; the wrapper owns report validation, baseline evaluation, and Git-mode safeguards.

- Nine built-in checks and four AST policies cover backend ESM, structured route/service errors, component API hooks,
  and centralized Nginx reloads. Function length is 100 direct statements; the parameter limit is eight.
- The original 57 raw-backend-error findings are corrected; the versioned baseline contains no existing-error
  allowances. Changed-line scans (`--branch REF`, `--staged`, `--uncommitted`) never apply baseline allowances.
  New errors and scanner failures block; advisory findings remain visible.
- Branch comparisons use the merge-base. Staged scans reject partially staged source; branch/uncommitted scans reject
  untracked scannable source. Stage the intended complete changes or use a full scan.
- `--update-baseline` is a deliberate reviewed exception update, not an automatic fix. Never absorb new errors merely
  to make the gate pass.
- Scanner execution is deterministic: built-in checks and local AST policies run without a provider CLI or account
  credentials. Keep scanner configuration, wrapper validation, tests and documentation aligned when changing rules.
- `.vscode/` recommends the extension and supplies tasks. CI uses `contents: read`, annotations/summary and report
  artifacts retained for seven days, without PR comments, additional credentials, or schedules. Tooling is excluded from Docker.

Use current code and tests to resolve stale policy prose: SQLite is supported, justified parameterized engine-specific
SQL is legitimate, and the Nginx engine serializes changes without a mandatory global debounce. See the
[complete scanner guide](./docs/wiki/TScanner.md).

## 5. Security Architecture & Integrations

### CrowdSec (IPS)

- **Docker**: Sidecar container. Login parsed via `type: shieldpm`.

* **Native**: System service. `install.sh` downloads parser/collection directly to `/etc/crowdsec/`.
* **Nginx**: Uses Lua Bouncer (`init_by_lua` in `crowdsec_nginx.conf`).

### OpenAppSec (AI WAF)

- **Agent**: Runs as service/container.

* **Management**: Cloud (Connector using `AGENT_TOKEN`) or Local (`local_policy.yaml`).
* **Nginx**: Attachment module dynamic load via `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true`.
* **Advanced Model**: `.tgz` file support for ML model upgrades.

### ChatOps (Telegram)

- **Engine**: `telegraf` running in backend.

* **Auth**: Whitelists Telegram User IDs (`allowed_ids`).
* **Access**: Synthesizes internal temporary JWT tokens (`ctx.shieldAccess`) for authenticated AI interaction.

## 6. Internal Systems Deep Dive

The October repository rescan, confirmed fixes, and validation limits for PR #149 are recorded in [the internal audit report](./docs/wiki-intern/entwicklung/code-audit-2026-10.md).

### 6.1 Nginx Configuration Engine (`backend/internal/nginx.js`)

- **Core Logic**: Reads DB state -> Renders Liquid templates (`backend/templates/`) -> Writes `.conf` files to `/data/nginx/`.

* **Reload Strategy**: Serializes host configuration writes; bulk operations use `skip_reload` and a final validated reload.
* **Validation**: `nginx -tq` validates generated configurations and reloads; failed host configurations restore their backup.
* **Preview**: `backend/internal/proxy-host-preview.js` renders a redacted draft from form data and compares it with the authorized host's active config without writing files or running `nginx -tq`. Generated firewall CIDR tables use bounded count/SHA-256 summaries; preview authorization covers all list IDs in the saved host and draft. Runtime configuration keeps the complete rules. See [Proxy-Host internals](./docs/wiki-intern/module/proxy-host.md#konfigurationsvorschau-vor-dem-speichern).

### 6.1a Proxy Host Observability

- **Active checks**: `backend/internal/proxy-host-monitor.js` schedules bounded HTTP(S)/TCP checks per host, stores status and limited history, and optionally sends status changes through the owner's configured Telegram integration. See [monitoring internals](./docs/wiki-intern/module/proxy-host-monitor.md).
- **On-demand diagnostics**: `backend/internal/proxy-host-diagnostics.js` checks a stored host's DNS, local TLS and route, upstream connectivity, and applicable authentication or WebSocket behavior. Results are not stored. See [diagnostics internals](./docs/wiki-intern/features/proxy-host-diagnostics.md).

### 6.1b Proxy Host IP Firewall

- **Sources and ownership**: `firewall_list` stores normalized IP/CIDR text, source metadata, update state, and ownership. The `/api/nginx/firewall-lists` CRUD, preview, and refresh endpoints reuse `access_lists` permissions. HTTPS source updates preserve the last valid list on failure.
- **GeoIP provisioning**: `GEOIP_AUTO_UPDATE=true` by default checks the latest `shedowe19/GeoLite.mmdb` GitHub release at every startup and prepares Country, City, and ASN in `/data/nginx` without MaxMind credentials. `envs.sh` runs it after loading `/data/.env` and before `validate-env.cjs`, configuration, or services. Matching validated files are reused; all new files are staged and verified before replacement. An update failure can continue only with a complete valid previous cache. Set `GEOIP_AUTO_UPDATE=false` for offline/custom sources; `NGINX_LOAD_GEOIP2_MODULE=true` separately enables Nginx lookups.
- **Per-host policy**: `meta.ip_firewall` contains `enabled`, `list_ids`, `allowlist`, `denylist`, `asn_denylist`, `country_denylist`, `country_reason`, `block_unknown_country`, `public_message`, `support_url`, and `internal_note`. Each host independently selects central lists, up to 1000 unique numeric ASN rules with optional public reasons, and countries; exceptions bypass only the IP firewall. Internal notes never appear on the public page.
- **Nginx behavior**: Generated `geo` lookups and a server-level filter protect the public Proxy Host entrance, including custom routes and Anubis. Firewall matches return a dedicated non-cacheable 403 response without changing the handling of OAuth2 or other authorization failures. Priority is manual IP rules, list matches, ASN rules, then country rules. Country filtering reuses `$geoip2_country_code`; optional ASN lookups use reserved `$spm_geoip2_asn` and `$spm_geoip2_asn_org` variables from `/data/nginx/GeoLite2-ASN.mmdb`, always with `source=$remote_addr`. `/api/nginx/firewall-lists/geoip` reports country readiness and an independent nested `asn` status using `proxy_hosts:list`. IP-only rules require no GeoIP. Existing open connections are not terminated.
- **Scope**: HTTP/HTTPS Proxy Hosts only; TCP/UDP Streams and TLS passthrough are not covered. Feed membership expresses the configured network policy, not proof of an attack. Details: [IP firewall internals](./docs/wiki-intern/module/ip-firewall.md) and [user guide](./docs/wiki/IP-Firewall.md).
- **Related ownership and update contracts**: Docker rediscovery merges discovery keys into the current locked host metadata so manual firewall settings survive. Public certificate/access-list host expansions enforce each relation's host permission and owner; trusted rebuilds still process all affected hosts. Editing dialogs revalidate their opening snapshot and preserve the open draft. See the [October code review](./docs/wiki-intern/entwicklung/code-audit-2026-10.md) for regression evidence and remaining dependency limits.

### 6.2 AI Core (`backend/internal/ai/`)

- **Orchestrator**: `ai.js` manages the chat loop; `executor.js` dispatches structured tool calls.

- **Error contract**: Configuration failures use public `ConfigurationError` (400); demo restrictions use
  `PermissionError` (403). Explicit provider failures retain private diagnostics in `InternalError.previous` (500).
  Tool results expose only public error messages; internal and unknown errors become `Internal Error` before
  returning to the model.

* **Providers**: `providers.js` supports:
  - **Google Gemini**: via `@google/generative-ai`.
  - **Local LLM**: Ollama / OpenAI Compatible.
* **Tools**: `tools.js` defines executable functions users can invoke via chat.
* **Prompt**: `prompt.js` contains the System Prompt.

### 6.3 GitOps (`backend/internal/gitops.js`)

- **Engine**: `isomorphic-git`.

* **Use Case**: Syncs ShieldPM configuration (exported as JSON/YAML) to/from a remote Git repository.
* **Auth**: SSH Keys or HTTPS Tokens.

### 6.4 Tor Onion Services (`backend/internal/tor.js`)

- **Management**: Controls Tor process via `tor-control-port`.

* **Data**: Writes Hidden Service config to `/data/tor/`.
* **Output**: Reads `hostname` file to display Onion Address to user.

## 7. Project Structure Map (Agent Reference)

| Path                         | Responsible Component    | Description                                                    |
| :--------------------------- | :----------------------- | :------------------------------------------------------------- |
| `/backend/internal/nginx.js` | **Configuration Engine** | The "Brain". Orchestrates config generation.                   |
| `/backend/internal/ai/`      | **AI Agent**             | AI Logic, Providers, Tools.                                    |
| `/backend/internal/chat.js`  | **ChatOps**              | Telegram Bot logic.                                            |
| `/backend/templates/*.conf`  | **Config Templates**     | Liquid files defining Nginx vhosts.                            |
| `/backend/migrations/*.js`   | **Database Schema**      | Source of Truth for DB structure.                              |
| `/frontend/src/pages/`       | **UI Views**             | React components for specific pages.                           |
| `/rootfs/usr/local/bin/`     | **Startup Scripts**      | `launch.sh`, `start.sh`. Run inside container/service on boot. |
| `/scripts/install.sh`        | **Installer**            | The Bash script for non-Docker deployments.                    |
| `/data/`                     | **Persistent Storage**   | **Contract**: All dynamic data MUST reside here.               |

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

- **Source of Truth**: `backend/package.json` + `frontend/package.json` + `.version`.

* **Workflow**:
  - Check current version.
  - Determine Patch/Minor/Major impact.
  - **Ask User**.
  - Update ALL 3 files.
  - Tag git commit.
