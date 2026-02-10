# ShieldPM

## Project Overview
ShieldPM is an advanced fork of Nginx Proxy Manager (NPM). It provides a user-friendly web interface for managing Nginx reverse proxies, with a focus on security, performance, and ease of use. It includes features like HTTP/3 (QUIC) support, CrowdSec integration, ModSecurity (WAF), OIDC (OpenID Connect) for Access Lists, **Advanced Analytics**, improved TLS certificate management (including OCSP Stapling), **Disable Buffering**, and **Scheduled Maintenance Mode**.

**Key Technologies:**
*   **Backend:** Node.js, Express (v5.2), Knex.js (v3.1), Objection.js (v3.1), SQLite (via better-sqlite3 v12.5).
*   **Frontend:** React (v19.2), Vite (v7.3), TypeScript (v5.9), Tailwind CSS (v3.4), shadcn/ui (Radix UI), React Query (v5.90).
*   **Infrastructure:** Docker, Nginx (with QUIC support), Certbot, CrowdSec, Cloudflared, Tor, OpenAppSec.
*   **Features**: mTLS, HTTP/3, WAF, OIDC, Analytics, **Internal PKI**, **Cloudflare Tunnels**, **Tor Onion Services**, **Secure Demo Mode**, **AI Agent (Co-Pilot)**, **HTTP-Only Cookie Auth**, **GitOps Synchronization**.
*   **Language:** JavaScript/TypeScript (ES Modules).

## Secure Demo Mode Architecture
The project supports a public "Demo Mode" toggled via `DEMO_MODE=true`.
*   **Purpose**: Allows public testing without compromising security.
*   **Restrictions**:
    *   **Frontend**: Restricted menus (e.g., Cloudflare Tunnels) and visual indicator.
    *   **Backend**: Middleware (`demo.js`) blocks sensitive write operations (User, Settings, Nginx Config).
    *   **Nginx**: ModSecurity enabled, filesystem access blocked (`forward_scheme: path` disallowed).
    *   **Network**: `ipaddr.js` blocks standard "Anti-SSRF" targets (Private IPs, Localhost, etc.).
    *   **Infrastructure**: Auto-reset sidecar container wipes database every 60 minutes.

## Building and Running

The project is designed to be run using Docker Compose or natively (LXC/Bare Metal).

### Prerequisites
*   Docker & Docker Compose (for Container setup)
*   **OR** Node.js 22+, Nginx w/ Lua, CrowdSec, OpenAppSec (for Native setup)

### Quick Start (Docker)
To start the application in production mode:
```bash
docker compose up -d
```

### Native Installation (LXC/Bare Metal)
The `install.sh` script supports a fully interactive native installation.
*   **Supported OS**: Debian/Ubuntu/Proxmox LXC.
*   **Features**:
    *   Installs dependencies (Node.js, Nginx, Certbot).
    *   **Native CrowdSec Integration**: Downloads parser/collection directly from GitHub to `/etc/crowdsec/` and configures access logs.
    *   **Native GeoIP Update**: Sets up `geoipupdate` cron jobs and database paths.
    *   **Native OpenAppSec WAF**: Installs the agent (Cloud or Local mode) and optional Advanced ML Model.

### Development
The project uses a multi-stage `Dockerfile`.
*   **Frontend:** Built in the `frontend` stage using `yarn vite build`.
*   **Backend:** Dependencies installed in the `backend` stage.
*   **Final Image:** Combines frontend assets, backend code, and Nginx configuration into a Debian Trixie-based image.

**Key Scripts:**
*   `yarn build`: Builds both frontend and backend.
*   `yarn test`: Runs unit tests (`vitest`).

## Development Conventions

*   **Code Style:** The project uses `biome` for linting and formatting.
*   **Testing:** `vitest` is used for testing.
*   **Database:** SQLite is key for development; MySQL/Postgres supported for production.
*   **Architecture & Repositories:**
    *   `ShieldPM` (This Repo): Main application logic (Frontend + Backend API).
    *   `shieldpm-nginx` (External Repo): **Crucial distinction.** Contains the base Docker image definition (`Dockerfile`), `nginx.conf`, and compiled modules (QUIC, ModSecurity, etc.). The main `nginx.conf` used in production comes from here.

## Configuration & Environment
The application is configured primarily through Environment Variables (handled in `backend/lib/config.js`).

### Key Environment Variables
*   **Database:** `DB_MYSQL_*`, `DB_POSTGRES_*` (or default SQLite).
*   **Keys:** Managed automatically in `/data/shieldpm/keys.json` (RSA 2048-bit for JWT).
*   **Data Path:** `DATA_PATH` (default: `/data`) - Base directory for all data.
*   **Security:**
    *   `DEMO_MODE=true`: Enables read-only demo mode.
    *   `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true`: Enables OpenAppSec module (Native/LXC).

---

## Database & Migrations
Database schema evolution is handled by **Knex.js** migrations in `backend/migrations`.

### Key Migrations
*(Selected highlights)*
*   `20180618015850_initial.js`: Initial Schema
*   `20251231000000_analytics.js`: Advanced Analytics tables
*   `20260108000000_add_cloudflared_tunnel.js`: Cloudflare Tunnels table
*   `20260122100000_add_tor_onion.js`: Tor Onion Services table
*   `20260210000000_native_integrations.js`: (Conceptual) Support for native CrowdSec/OpenAppSec via `install.sh` updates.

---

## Security Hardening (2026 Re-Audit)
*   **OIDC Strictness**: `email_verified` claim mandatory.
*   **Docker Sanitization**: Labels blocking dangerous Nginx directives.
*   **Auth Timing**: Constant-time response for invalid logins.
*   **Cookie Auth**: HTTP-Only, Secure, SameSite=Strict cookies (Double Submit Cookie CSRF).
*   **Reliability**: Async Analytics, Debounced Reloads.
*   **Native Security**:
    *   **CrowdSec**: Logs parsed via `type: shieldpm` (mapped to `nginx` parser via custom config).
    *   **OpenAppSec**: Supports `local_policy.yaml` (Local) or `AGENT_TOKEN` (Cloud).

### Auto-Migration
Automatically migrates from SQLite to MySQL/Postgres if configured, renaming old DB to `database.sqlite.migrated`.

---

## Frontend Routing (`/frontend/src/Router.tsx`)
Standard React Router setup mapping paths like `/nginx/proxy`, `/access`, `/settings` to `src/pages/` components.

---

## Project Structure

### Repository Root (`/`)
| Path | Description |
|------|-------------|
| `compose.yaml` | Main Docker Compose configuration |
| `Dockerfile` | Multi-stage Docker build definition |
| `knexfile.js` | Database configuration for Knex.js |
| `package.json` | Root scripts and workspace definitions |
| `docs/wiki/` | Documentation markdown files |
| `scripts/` | Installation and maintenance scripts (Native Install) |
| `rootfs/` | Docker filesystem overlays (ShieldPM specific) |

### Backend (`/backend`)
Node.js API server.
*   `internal/`: Core logic (`nginx.js`, `certificate.js`). **Config Generation happens here.**
*   `models/`: Objection.js ORM models.
*   `templates/`: EJS templates for Nginx config files (`proxy_host.conf`).

### Frontend (`/frontend`)
React (Vite) SPA.

### `shieldpm-nginx` (External Repository)
**Base Image & Core Nginx Config**
*   Contains the `Dockerfile` for the base image (`shedowe19/nginx-quic`).
*   Contains `/etc/nginx/nginx.conf` (The main config file).
*   Contains compiled modules (CrowdSec Lua, ModSecurity, OpenAppSec attachment).
*   **Note**: `init_by_lua` for CrowdSec is defined here (in `conf.d/include/crowdsec_nginx.conf`).

---

## Agent Knowledge Base & Cookbook

### Data Flow: Lifecycle of a Proxy Host Change
1.  **Frontend**: User submits form.
2.  **API**: `POST /api/nginx/proxy-hosts`.
3.  **Controller**: Validates input.
4.  **Database**: Saves to `proxy_host` table.
5.  **Nginx Config**: `internal/nginx.js` renders EJS template to `/data/nginx/proxy_host/ID.conf`.
6.  **Reload**: `nginx -s reload`.

### Developer Cookbook
*   **Adding Features**: 1. Migration → 2. Model → 3. API/Schema → 4. Frontend Client → 5. UI → 6. Docs.
*   **Native Install Updates**: Modify `scripts/install.sh`. Remember to support non-interactive modes if possible.

### File Persistence (`/data`)
*   `/data/nginx/`: Generated Configs & Logs.
*   `/data/crowdsec/`: Security configurations.
*   `/data/tls/`: Certificates.

### Security & Reliability Guidelines (2026)
*   **Non-Blocking I/O**: Wrap heavy tasks in `setImmediate()` or Worker Threads.
*   **Debouncing**: Batch Nginx reloads (2s delay).
*   **Input Sanitization**: Whitelist characters, block dangerous patterns (`lua_`, `exec`).

---

## Version Bump Workflow

**IMPORTANT**: After completing any significant work, ask the user about updating the project version.

### Procedure
1.  Check current version in `backend/package.json`, `frontend/package.json`, `.version`.
2.  Suggest bump (Patch/Minor/Major).
3.  **Wait for confirmation.**
4.  Update all 3 files.
