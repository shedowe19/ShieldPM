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

### 6.1 Nginx Configuration Engine (`backend/internal/nginx.js`)

- **Core Logic**: Reads DB state -> Renders Liquid templates (`backend/templates/`) -> Writes `.conf` files to `/data/nginx/`.

* **Reload Strategy**: Serializes host configuration writes; bulk operations use `skip_reload` and a final validated reload.
* **Validation**: `nginx -tq` validates generated configurations and reloads; failed host configurations restore their backup.
* **Preview**: `backend/internal/proxy-host-preview.js` renders a redacted draft from form data and compares it with the authorized host's active config without writing files or running `nginx -tq`. See [Proxy-Host internals](./docs/wiki-intern/module/proxy-host.md#konfigurationsvorschau-vor-dem-speichern).

### 6.1a Proxy Host Observability

- **Active checks**: `backend/internal/proxy-host-monitor.js` schedules bounded HTTP(S)/TCP checks per host, stores status and limited history, and optionally sends status changes through the owner's configured Telegram integration. See [monitoring internals](./docs/wiki-intern/module/proxy-host-monitor.md).
- **On-demand diagnostics**: `backend/internal/proxy-host-diagnostics.js` checks a stored host's DNS, local TLS and route, upstream connectivity, and applicable authentication or WebSocket behavior. Results are not stored. See [diagnostics internals](./docs/wiki-intern/features/proxy-host-diagnostics.md).

### 6.1b ACME Certificate Profiles

- **Selection**: New HTTP/DNS certificates and inline host requests accept `meta.letsencrypt_profile: "standard" | "shortlived"`; new requests without it resolve the global default and save that explicit choice. Existing explicit profiles are changed by issuing and assigning a new certificate.
- **Global UI default**: Settings → Certificates / ACME saves Standard/Short-lived in `setting.id: "acme-profile"` and applies it immediately without changing environment files/Certbot INI or restarting. The database default is Standard. The normalization migration replaces obsolete `inherit` values with Standard while preserving explicit saved choices. `GET /api/nginx/certificates/acme-profile` requires `certificates:list`; its administrative PUT requires `settings:update` and validates Certbot/CA capabilities before saving. Both return only `{ profile }`. Generic settings updates of this key are rejected. See [settings internals](./docs/wiki-intern/verwaltung/einstellungen.md).
- **Strict Short-lived**: Certbot issuance and manual renewal pass `--required-profile shortlived`. Let's Encrypt's Short-lived profile lasts 160 hours (6 days and 16 hours) and permits at most 25 domain names. Unsupported profiles fail without a silent fallback.
- **Standard configuration**: Every Standard operation passes empty `--required-profile` and `--preferred-profile` arguments so the CA selects its default, clearing obsolete INI or lineage profiles. Both choices require Certbot 4.0 or newer.
- **Legacy certificates**: Rows without profile metadata use the database global default during renewal. Explicit certificate profiles always take precedence. Saving global Short-lived is rejected if any active legacy certificate without a saved profile has more than 25 domain names.
- **Renewal**: Startup and timer call `certbot renew` separately for each managed certificate, applying its explicit profile or the current global default without `--force-renewal`; Certbot decides when it is due. Failures are isolated by certificate. The database setting `certificate-options.meta.renewal_interval_hours` is 1–12 hours (default 12); a saved change replaces the running timer without restarting. See [certificate internals](./docs/wiki-intern/module/zertifikate.md) and [Certbot internals](./docs/wiki-intern/module/certbot.md).

### 6.1c Database Application Options

- **Certificate options**: Settings → Certificates / ACME stores `key_type: "ecdsa" | "rsa"` and `renewal_interval_hours: 1..12` in `certificate-options.meta`. Key type is passed to issuance and renewal, including existing lineages. Automatic renewal batches snapshot it at their start; saved changes apply to the next batch. Changing the interval does not force issuance.
- **Cloudflare IP options**: Settings → Network stores `enabled` and `refresh_interval_hours` (6–594 in six-hour steps) in `ip-ranges-options.meta`. Enabling starts a background fetch and timer; disabling stops updates and invalidates in-flight publication while retaining cached ranges.
- **API**: GET/PUT `/api/settings/certificate-options` and `/api/settings/ip-ranges-options` use complete flat option objects. Permissions are `settings:get`/`settings:update` for each setting ID; generic setting updates are guarded.
- **Upgrade**: `20260930000200_add_application_options` imports `ACME_KEY_TYPE`, `CRT`, `SKIP_IP_RANGES` and `IPRT` once for missing rows, preserving saved settings. Runtime reads only database options afterward. Other environment settings remain deployment configuration or await later migration; see [configuration strategy](./docs/wiki-intern/konfiguration/config-dateien.md#schrittweise-verlagerung-von-anwendungsoptionen).

### 6.1d Analytics Retention and Nginx Formatting

- **Database options**: `analytics-options.meta` stores `detailed_retention_hours` and `aggregation_retention_days`, each a positive safe integer (1–9007199254740991), defaults 24/35 and no cross-field condition. `nginx-options.meta.beautifier_enabled` is boolean, default true. Settings has separate lazy Analytics/Nginx tabs.
- **Retention**: Each startup/hourly run reads one database policy and clock snapshot, validates both cutoff dates and positive ISO years before deleting either table, and skips both on invalid policy/read/cutoff errors. Runs wait for both deletion results before releasing their single-flight promise; successful deletions clear the summary cache even if the other delete fails. Missing rows are configuration errors; initial defaults come only from migration. Saving does not start an immediate purge.
- **Formatting**: `generateConfig()` reads the database option before rendering/writing and optionally formats the resulting file. Saving alone does not regenerate/reload Nginx; formatter command errors remain ignored.
- **Contract**: GET/PUT `/api/settings/analytics-options` and `/api/settings/nginx-options` use flat complete option objects with settings:get/update permissions, generic guards, validated GitOps restore and audit.
- **Upgrade**: `20260930000300_add_analytics_nginx_options` imports the retired variables once for missing rows, preserving positive safe legacy parseInt results and saved choices. Missing/empty retention values use 24/35; invalid nonempty values import MAX_SAFE_INTEGER with a raw-value-free warning, preserving history until repair. Runtime uses database settings only. Roadmap phase 1 is complete; later phases remain planned.

### 6.1e Complete ACME Web Settings

- **Database/UI**: Settings → Certificates / ACME adds `acme-options` for CA directory, email, optional account ID, EAB, terms agreement, Must-Staple, CA/custom OCSP, CA TLS verification and default certificate (`0` for dummy). GET/PUT `/api/settings/acme-options` use settings:get/update permissions and full ordinary fields. Profile, key type and check interval retain their existing APIs.
- **Secrets**: `encrypted_eab_hmac_key` stays private. Public GET/PUT, generic settings reads, audit and GitOps export contain only `eab_hmac_key_set`; the write-only `eab_hmac_key` is omitted to retain, replaced with a nonempty value or explicitly cleared with null. A changed CA/EAB identity requires replacing or clearing the retained key.
- **Issuer continuity**: New certificates use the current CA and store server-owned `meta.acme_server`/`meta.acme_account`; client writes cannot set them, and public certificate responses/audit hide them. Existing renew/revoke operations read the original issuer/account from their lineage and reject mismatched saved metadata. Missing/invalid original issuer data fails instead of selecting the global CA.
- **Accounts**: `acme-runtime.js` resolves accounts by full directory URL. Empty selection uses one matching account or registers for new issuance; ambiguous/missing explicitly selected accounts fail while the UI remains accessible. Registration is lazy under the Certbot lock, accepts EAB/ZeroSSL automatic binding and applies contact changes with update_account on the next applicable operation.
- **Certbot isolation**: Each operation uses its own private 0700 directory, 0600 INI and private logs, cleaned in finally. HMAC is absent from argv; untrusted output is redacted. Fixed RSA4096/P384, key rotation, noninteractive flags and internal paths remain technical defaults without UI controls.
- **Application**: OCSP/default-certificate saves regenerate, test and reload Nginx with rollback; other options apply to the next operation. TLS verification/Must-Staple are global even for existing lineages while CA/account remain original. Let's Encrypt Must-Staple is rejected; its OCSP service retired in 2025.
- **Upgrade**: `20260930000400_add_acme_options` imports the nine retired ACME/default-cert variables once for missing rows and encrypts EAB before insertion; saved settings remain authoritative. Invalid legacy server/email/EAB values remain repairable in the UI with raw-value-free warnings. No runtime environment fallback or launcher registration remains. See [ACME settings](./docs/wiki-intern/verwaltung/einstellungen.md#acme-konto-und-tls-optionen) and [Certbot](./docs/wiki-intern/module/certbot.md).

### 6.2 AI Core (`backend/internal/ai/`)

- **Orchestrator**: `executor.js` manages the chat loop.

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
