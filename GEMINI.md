# ShieldPM

## Project Overview
ShieldPM is an advanced fork of Nginx Proxy Manager (NPM). It provides a user-friendly web interface for managing Nginx reverse proxies, with a focus on security, performance, and ease of use. It includes features like HTTP/3 (QUIC) support, CrowdSec integration, ModSecurity (WAF), OIDC (OpenID Connect) for Access Lists, **Advanced Analytics**, improved TLS certificate management (including OCSP Stapling), **Disable Buffering**, and **Scheduled Maintenance Mode**.

**Key Technologies:**
*   **Backend:** Node.js, Express (v5.2), Knex.js (v3.1), Objection.js (v3.1), SQLite (via better-sqlite3 v12.5).
*   **Frontend:** React (v19.2), Vite (v7.3), TypeScript (v5.9), Tailwind CSS (v3.4), shadcn/ui (Radix UI), React Query (v5.90).
*   **Infrastructure:** Docker, Nginx (with QUIC support), Certbot, CrowdSec, Cloudflared.
*   **Features**: mTLS, HTTP/3, WAF, OIDC, Analytics, **Internal PKI**, **Cloudflare Tunnels**, **Secure Demo Mode**, **AI Agent (Co-Pilot)**.
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

The project is designed to be run using Docker Compose.

### Prerequisites
*   Docker
*   Docker Compose

### Quick Start
To start the application in production mode:
```bash
docker compose up -d
```

### Development
The project uses a multi-stage `Dockerfile`.
*   **Frontend:** Built in the `frontend` stage using `yarn vite build`.
*   **Backend:** Dependencies installed in the `backend` stage.
*   **Final Image:** Combines frontend assets, backend code, and Nginx configuration into an Alpine-based image (`shedowe19/nginx-quic`).

**Key Scripts (Backend):**
*   `test`: `vitest` - Runs unit tests.

**Key Scripts (Frontend):**
*   `build`: `yarn tsc && yarn vite build` - Builds the frontend application.
*   `test`: `vitest` - Runs unit tests.

## Development Conventions

*   **Code Style:** The project uses `biome` for linting and formatting in both frontend and backend.
*   **Testing:** `vitest` is used for testing in both frontend and backend.
*   **Database:** SQLite is the recommended database. Migration files are located in `backend/migrations`.
*   **Architecture:**
    *   `backend/`: Contains the Node.js API server, database models, and Nginx configuration logic.
    *   `frontend/`: Contains the React-based user interface.
    *   `rootfs/`: Contains filesystem overlays for the Docker image (e.g., Nginx configs, scripts).
    *   `caddy/`: Separate directory for Caddy-related configuration (alternative to ShieldPM web GUI).
*   **Contribution:** New features should ideally include tests. Changes to the Nginx configuration generation logic should be carefully tested.

## Configuration & Environment
The application is configured primarily through Environment Variables (handled in `backend/lib/config.js`).

### Key Environment Variables
*   **Database:**
    *   `DB_MYSQL_HOST`, `DB_MYSQL_USER`, `DB_MYSQL_PASSWORD`, `DB_MYSQL_NAME`, `DB_MYSQL_PORT`
    *   `DB_POSTGRES_HOST`, `DB_POSTGRES_USER`, `DB_POSTGRES_PASSWORD`, `DB_POSTGRES_NAME`, `DB_POSTGRES_PORT`
    *   *Default*: SQLite (`/data/shieldpm/database.sqlite`)
*   **Keys:**
    *   Managed automatically in `/data/shieldpm/keys.json` (RSA 2048-bit for JWT).
*   **Data Path:**
    *   `DATA_PATH` (default: `/data`) - Base directory for all data.

---

## Database & Migrations
Database schema evolution is handled by **Knex.js** migrations in `backend/migrations`.
*   **Engine Support:** SQLite (default), MySQL (`mysql2`), PostgreSQL (`pg`).

### Key Migrations
| Migration | Description |
|-----------|-------------|
| `20180618015850_initial.js` | Initial Schema |
| `20200410143839_access_list_client.js` | Multi-user Access Lists |
| `20240427161436_stream_ssl.js` | SSL support for Streams |
| `20250627140440_stream_proxy_protocol_forwarding.js` | Proxy Protocol Forwarding for Streams |
| `20251111090000_redirect_auto_scheme.js` | "auto" scheme for Redirection Hosts |
| `20251212000000_add_bandwidth_limit.js` | Bandwidth limiting feature |
| `20251213000000_add_forward_query.js` | Forward query parameters in Proxy Hosts |
| `20251225000000_add_maintenance_failure.js` | Maintenance Mode on Failure |
| `20251230000000_add_disable_buffering.js` | Disable Buffering option |
| `20251231000000_analytics.js` | Advanced Analytics tables |
| `20260102000000_add_req_limit.js` | Request Rate Limiting |
| `20260103000000_add_access_list_mtls.js` | mTLS for Access Lists |
| `20260106000000_add_access_list_mtls_internal.js` | Internal CAs for mTLS |
| `20260107000000_add_maintenance_schedule.js` | Scheduled Maintenance Mode |
| `20260108000000_add_cloudflared_tunnel.js` | Cloudflare Tunnels table |
| `20260109000000_add_ai_config.js` | AI Agent configuration |
| `20260110000000_reset_ai_system_prompt.js` | AI system prompt reset |
| `20260111000000_add_ai_num_ctx.js` | AI context window size |
| `20260112000000_add_ai_num_batch.js` | AI batch size |
| `20260113000000_add_ai_advanced_options.js` | Advanced AI options |
| `20260114000000_update_ai_options.js` | AI options structure update |
| `20260115000000_add_system_prompt.js` | Customizable AI system prompt |
| `20260116000000_hash_access_list_passwords.js` | Hash Access List Passwords (Argon2) |

---

## Security Hardening (2026 Re-Audit)
Following a deep-dive audit, the following security measures are enforced:
*   **OIDC Strictness**: `email_verified` claim is **mandatory** for all OIDC logins.
*   **Docker Sanitization**: Docker labels blocking dangerous Nginx directives (`lua_`, `exec`, etc.).
*   **Auth Timing**: Constant-time response (via dummy hashing) for invalid login attempts.
*   **Reliability**:
    *   **Async Analytics**: Log parsing offloaded to prevent Event Loop blocking.
    *   **Debounced Reloads**: Nginx reloads are batched (2s delay) during Docker stack deployments.

### Auto-Migration (SQLite to MySQL/Postgres)
The application includes an auto-migration feature that detects if you are switching from the default SQLite database to MySQL or PostgreSQL.
*   **Trigger**: Running the app with `DB_MYSQL_*` or `DB_POSTGRES_*` configured, an existing `database.sqlite` file present, and an empty target database.
*   **Action**: Automatically migrates all data from SQLite to the new database on startup and renames the old SQLite file to `database.sqlite.migrated`.

---

## Frontend Routing (`/frontend/src/Router.tsx`)
The application uses `react-router-dom` with the following route map:

| URL Path | Component | Description |
| :--- | :--- | :--- |
| `/` | `Dashboard` | Main overview |
| `/nginx/proxy` | `ProxyHosts` | Manage Proxy Hosts |
| `/nginx/redirection` | `RedirectionHosts` | Manage Redirection Hosts |
| `/nginx/stream` | `Streams` | Manage TCP/UDP Streams |
| `/nginx/cloudflared` | `CloudflaredTunnels` | Manage Cloudflare Tunnels |
| `/nginx/404` | `DeadHosts` | Manage 404 Hosts |
| `/access` | `Access` | Admin Control Lists (ACLs) |
| `/certificates` | `Certificates` | SSL/TLS Certificate management |
| `/users` | `Users` | User management |
| `/settings` | `Settings` | Global App Settings |
| `/audit-log` | `AuditLog` | View system events |
| `/analytics` | `Analytics` | Analytics Dashboard |

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
| `nginx-quic/` | Nginx HTTP/3 build patches |
| `rootfs/` | Docker filesystem overlays |

### Backend (`/backend`)
The backend is a Node.js application responsible for the API, database management, and Nginx configuration generation.

| Directory | Description |
|-----------|-------------|
| `internal/` | Core business logic (`nginx.js`, `certificate.js`, `cloudflared.js`, `ai.js`, etc.) |
| `models/` | Objection.js ORM models (`ProxyHost`, `User`, `AccessList`, `Certificate`, etc.) |
| `routes/` | Express.js Router (RESTful endpoints) |
| `schema/` | OpenAPI/AJV validation schemas |
| `lib/` | Shared utilities (`access.js`, `config.js`, `encryption.js`, etc.) |
| `templates/` | EJS templates for Nginx config generation |
| `migrations/` | Knex.js database migration files |

### Frontend (`/frontend`)
The frontend is a React Single Page Application (SPA) built with Vite, utilizing React Query for state management.

| Directory | Description |
|-----------|-------------|
| `src/api/` | Strongly-typed API Client |
| `src/components/` | Reusable UI components (shadcn/ui) |
| `src/pages/` | React page components |
| `src/hooks/` | Custom React hooks (React Query wrappers) |
| `src/context/` | React Context providers |
| `src/modals/` | Complex task-specific modals |
| `src/locale/` | Internationalization (i18n) JSON files |

---

## Agent Knowledge Base & Cookbook

### Data Flow: Lifecycle of a Proxy Host Change
1.  **Frontend**: User submits form → `createProxyHost.ts` calls `POST /api/nginx/proxy-hosts`
2.  **API**: `routes/nginx/proxy_hosts.js` receives request
3.  **Controller**: Validates input using schema
4.  **Database**: Model `ProxyHost` saves data to `proxy_host` table
5.  **Nginx Config**: `internal/nginx.js` → `configure()` renders EJS template
6.  **Reload**: `nginx -s reload` is executed

### Developer Cookbook

#### Adding a New Full-Stack Feature
1.  **Database Migration**: `knex migrate:make add_my_feature_table`
2.  **Backend Model**: Create/Update model in `backend/models/`
3.  **API Schema & Routes**: Create schemas in `backend/schema/paths/<feature>/` and routes in `backend/routes/`
4.  **Frontend API Client**: Add types and fetch functions in `frontend/src/api/backend/`
5.  **Frontend Hook**: Create React Query hook in `frontend/src/hooks/`
6.  **UI Implementation**: Create components/pages using shadcn/ui
7.  **Documentation**: Update `AGENTS.md`, `README.md`, and Wiki

#### Adding a New Field to a Host
1.  Create Knex migration to add column
2.  Update model in `backend/models/`
3.  Update modal in `frontend/src/modals/`
4.  Update Nginx template in `backend/templates/`

#### Adding a New Locale
1.  Create `frontend/src/locale/lang/XX.json`
2.  Update `frontend/src/locale/index.ts`

### File Persistence & Data Paths (`/data`)
| Path | Description |
|------|-------------|
| `/data/nginx/{host_type}/{id}.conf` | Generated Nginx Configs |
| `/data/tls/certbot/live` | Let's Encrypt Certificates |
| `/data/tls/custom` | Custom Certificates |
| `/data/access/{id}` | Htpasswd files |
| `/data/logs/` | Nginx error/access logs |

### Validation & Schema
*   **Backend**: Uses **AJV** and **OpenAPI** schemas in `backend/schema/`
*   **Frontend**: Uses **Zod** or manual validation

### React Query Keys
| Key | Description |
|-----|-------------|
| `["proxy-hosts", { expand }]` | List of proxy hosts |
| `["proxy-hosts", id, { expand }]` | Single host details |
| `["users"]` | User list |
| `["settings"]` | Global settings |
| `["health"]` | System health check |

### Docker Infrastructure
*   **Container**: Single container architecture (s6-overlay)
*   **Services**: `nginx` (Web server), `node` (Backend API), `crond` (Certificate renewal)

---

## Version Bump Workflow

**IMPORTANT**: After completing any significant work (features, bug fixes, refactoring, releases), you MUST ask the user about updating the project version.

### Procedure
1.  Check the current version in `backend/package.json`, `frontend/package.json`, and `.version`.
2.  Suggest appropriate version bumps based on [Semantic Versioning](https://semver.org/):
    *   **Patch (x.y.Z)**: Bug fixes, small changes, documentation updates.
    *   **Minor (x.Y.0)**: New features, non-breaking changes.
    *   **Major (X.0.0)**: Breaking changes, major rewrites.
3.  Present the options to the user and **wait for confirmation** before making changes.
4.  Example prompt:
    ```
    Current version: **3.1.0**
    
    Which version should I update to?
    - **3.1.1** (Patch)
    - **3.2.0** (Minor)
    - Or a specific version number?
    ```
5.  After user confirms, update all three files: `backend/package.json`, `frontend/package.json`, `.version`.
