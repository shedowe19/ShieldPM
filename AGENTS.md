# ShieldPM

## Project Overview
ShieldPM is an advanced fork of Nginx Proxy Manager (NPM). It provides a user-friendly web interface for managing Nginx reverse proxies, with a focus on security, performance, and ease of use. It includes features like HTTP/3 (QUIC) support, CrowdSec integration, ModSecurity (WAF), OIDC (OpenID Connect) for Access Lists, **Mutual TLS (mTLS)**, **Advanced Analytics**, improved TLS certificate management (including OCSP Stapling), **Internal PKI**, **Disable Buffering**, and **Scheduled Maintenance Mode**.

**Key Technologies:**
*   **Backend:** Node.js, Express (v5.2), Knex.js (v3.1), Objection.js (v3.1), SQLite (via better-sqlite3 v12.5).
*   **Frontend:** React (v19.2), Vite (v7.3), TypeScript (v5.9), Tailwind CSS (v3.4), shadcn/ui (Radix UI), React Query (v5.90).
*   **Infrastructure:** Docker, Nginx (with QUIC support), Certbot, CrowdSec, Cloudflared.
*   **Features**: mTLS, HTTP/3, WAF, OIDC, Analytics, **Internal PKI**, **Cloudflare Tunnels**, **AI Agent (Co-Pilot)**.
*   **Language:** JavaScript/TypeScript (ES Modules).

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

## Database & Migrations
Database schema evolution is handled by **Knex.js** migrations in `backend/migrations`.
*   **Engine Support:** SQLite (default), MySQL (`mysql2`), PostgreSQL (`pg`).
*   **Key Migrations:**
    *   `20180618015850_initial.js`: Initial Schema.
    *   `20200410143839_access_list_client.js`: Multi-user Access Lists.
    *   `20240427161436_stream_ssl.js`: SSL support for Streams.
    *   `20250627140440_stream_proxy_protocol_forwarding.js`: Adds Proxy Protocol Forwarding for Streams.
    *   `20251111090000_redirect_auto_scheme.js`: Introduces "auto" scheme for Redirection Hosts.
    *   `20251212000000_add_bandwidth_limit.js`: New bandwidth limiting feature.
    *   `20251213000000_add_forward_query.js`: Adds capability to forward query parameters in Proxy Hosts.
    *   `20251225000000_add_maintenance_failure.js`: Adds "Maintenance Mode on Failure" feature for Proxy Hosts.
    *   `20251230000000_add_disable_buffering.js`: Adds "Disable Buffering" option for Proxy Hosts.
    *   `20251231000000_analytics.js`: Adds database tables for Advanced Analytics.
    *   `20260102000000_add_req_limit.js`: Adds Request Rate Limiting fields to Proxy Hosts.
    *   `20260103000000_add_access_list_mtls.js`: Adds mTLS configuration to Access Lists.
    *   `20260106000000_add_access_list_mtls_internal.js`: Adds Internal CAs for mTLS Access Lists.
    *   `20260107000000_add_maintenance_schedule.js`: Adds Scheduled Maintenance Mode fields to Proxy Hosts.
    *   `20260108000000_add_cloudflared_tunnel.js`: Adds Cloudflare Tunnels table.
    *   `20260109000000_add_ai_config.js`: Adds AI Agent configuration settings.
    *   `20260110000000_reset_ai_system_prompt.js`: Resets AI system prompt defaults.
    *   `20260111000000_add_ai_num_ctx.js`: Adds AI context window size configuration.
    *   `20260112000000_add_ai_num_batch.js`: Adds AI batch size configuration.
    *   `20260113000000_add_ai_advanced_options.js`: Adds advanced AI model options.
    *   `20260114000000_update_ai_options.js`: Updates AI options structure.
    *   `20260115000000_add_system_prompt.js`: Adds customizable system prompt for AI.

### Auto-Migration (SQLite to MySQL/Postgres)
The application includes an auto-migration feature that detects if you are switching from the default SQLite database to MySQL or PostgreSQL.
*   **Trigger**: Running the app with `DB_MYSQL_*` or `DB_POSTGRES_*` configured, an existing `database.sqlite` file present, and an empty target database.
*   **Action**: Automatically migrates all data from SQLite to the new database on startup and renames the old SQLite file to `database.sqlite.migrated`.

## Frontend Routing (`/frontend/src/Router.tsx`)
The application uses `react-router-dom` with the following route map:

| URL Path | Component | Description |
| :--- | :--- | :--- |
| `/` | `Dashboard` | Main overview. |
| `/nginx/proxy` | `ProxyHosts` | Manage Proxy Hosts. |
| `/nginx/redirection` | `RedirectionHosts` | Manage Redirection Hosts. |
| `/nginx/stream` | `Streams` | Manage TCP/UDP Streams. |
| `/nginx/cloudflared` | `CloudflaredTunnels` | Manage Cloudflare Tunnels. |
| `/nginx/404` | `DeadHosts` | Manage 404 Hosts. |
| `/access` | `Access` | Admin Control Lists (ACLs). |
| `/certificates` | `Certificates` | SSL/TLS Certificate management. |
| `/users` | `Users` | User management. |
| `/settings` | `Settings` | Global App Settings. |
| `/audit-log` | `AuditLog` | View system events. |
| `/analytics` | `Analytics` | Analytics Dashboard. |

## Project Structure

### Repository Root (`/`)
*   **`compose.yaml`**: Main Docker Compose configuration for production.
*   **`Dockerfile`**: Multi-stage Docker build definition.
*   **`knexfile.js`**: Database configuration for Knex.js.
*   **`package.json`**: Root scripts (if any) and workspace definitions.
*   **`docs/`**: Documentation source.
    *   **`wiki/`**: Markdown files for the project Wiki.
*   **`nginx-quic/`**: Contains patches and resources used by the main Dockerfile to build Nginx with HTTP/3 support.
*   **`rootfs/`**: Filesystem overlays for Docker.
    *   **`etc/`**: Configuration files (e.g., `s6-overlay`, `nginx`, `certbot`).
    *   **`usr/`**: Binary overlays and scripts.

### Backend (`/backend`)
The backend is a Node.js application responsible for the API, database management, and Nginx configuration generation.

*   **`internal/`**: Core business logic.
    *   **`nginx.js`**:
        *   `configure(model, host_type, host)`: Orchestrates config generation, testing, and reloading.
        *   `generateConfig(host_type, host)`: Renders EJS templates (`templates/`) to `rootfs/etc/nginx/conf.d`.
        *   `reload()`: Triggers Nginx reload command.
    *   **`certificate.js`**:
        *   `processExpiringHosts()`: Timer-based job to check and renew certificates.
        *   `requestCertbot(certificate)`: Executes Certbot for Let's Encrypt issuance.
    *   **`cloudflared.js`**:
        *   Manages the `cloudflared` binary process (start, stop, restart) and token validation.
    *   **Logic Modules**:
        *   `access-list.js`, `analytics.js`, `audit-log.js`, `dead-host.js`, `host.js`, `ip_ranges.js`, `maintenance.js`, `pki.js`, `proxy-host.js`, `redirection-host.js`, `remote-version.js`, `report.js`, `setting.js`, `stream.js`, `token.js`, `user.js` - Business logic for respective entities.
*   **`models/`**: [Objection.js](https://vincit.github.io/objection.js/) ORM models.
    *   **`ProxyHost`** (`proxy_host`):
        *   Relates to `User` (owner), `AccessList`, `Certificate`.
        *   Stores `domain_names` (JSON), `meta` (JSON), `locations` (JSON).
    *   **`User`** (`user`):
        *   Authentication and permissions.
    *   **`AccessList`** (`access_list`):
        *   Contains `clients` (Basic Auth users). Supports OIDC/OAuth2 configuration via `meta` JSON.
    *   **`Certificate`** (`certificate`):
        *   Stores paths/metadata for SSL certs.
    *   **`CloudflaredTunnel`** (`cloudflared_tunnel`):
        *   Stores Tunnel Name, Token (Encrypted), and Status.
    *   **`RedirectionHost`** / **`Stream`** / **`DeadHost`**:
        *   Models for other host types.
    *   **`Setting`** / **`AuditLog`**:
        *   System settings and event logs.
*   **`routes/`**: Express.js (v5) Router.
    *   **`nginx/`**: RESTful endpoints for managing hosts.
        *   e.g., `GET /nginx/proxy-hosts`, `POST /nginx/proxy-hosts`, `GET /nginx/cloudflared-tunnels`.
        *   Also: `redirection-hosts`, `streams`, `dead-hosts`, `certificates`, `access-lists`.
    *   **`oidc/`**: OpenID Connect authentication flow endpoints.
    *   **`analytics.js`**: Analytics data endpoints.
    *   **Root**: Auth (`/tokens`), User (`/users`), Settings (`/settings`).
*   **`schema/`**: OpenAPI/AJV validation schemas.
    *   **`paths/`**: Request/Response schemas per endpoint (e.g. `nginx/proxy-hosts`).
    *   **`components/`**: Shared schema definitions.
*   **`lib/`**: Shared utilities and helper functions.
    *   **Core**: `access.js` (Permissions), `config.js` (App Config), `logger.js`, `utils.js`.
    *   **Database**: `db-migrate.js`, `migrate_template.js` (Migration helpers).
    *   **Security**: `encryption.js`, `auth.js`.
    *   **Validators**: `validator/` directory.
    *   **Helpers**: `helpers.js`, `certbot.js`, `error.js`.
*   **`templates/`**: EJS templates used to generate the actual Nginx configuration files (e.g., `proxy_host.ejs`).
*   **`migrations/`**: Knex.js database migration files used to initialize and update the database schema.


### Frontend (`/frontend`)
The frontend is a React Single Page Application (SPA) built with Vite, utilizing React Query for state management.

*   **`src/`**: Main source code directory.
    *   **`api/`**: Strongly-typed API Client.
        *   **`backend/`**:
            *   One file per API endpoint (matches Backend Routes).
            *   e.g., `getProxyHosts.ts` returns `Promise<ProxyHost[]>`.
            *   Uses `fetch` wrapper with Auth header injection.
    *   **`components/`**: Reusable UI components.
        *   **`ui/`**: **shadcn/ui** primitives (Button, Input, Dialog, etc.).
        *   **`Form/`**: Wrapper components for forms (e.g., `FormCheckbox`, `FormInput`).
        *   **`Table/`**: Components for data tables.
        *   **Layouts**: `Sidebar.tsx`, `SiteHeader.tsx`, `SiteFooter.tsx`.
    *   **`pages/`**: React components representing full pages (routed views).
        *   **`Nginx/`**: `ProxyHosts`, `RedirectionHosts`, `Streams`, `DeadHosts`, `CloudflaredTunnels`.
        *   **`Access/`**: `AccessLists`.
        *   **`Certificates/`**: `Certificates` list and management.
        *   **`Dashboard/`**: Main `Dashboard` view.
        *   **`Analytics/`**: `Analytics` Dashboard.
        *   **`Users/`**: `User` management.
        *   **`Settings/`**: `AuditLog` and general `Settings`.
        *   **`Login/`**: Login page.
    *   **`hooks/`**: Custom React hooks.
        *   **Data Hooks** (React Query wrappers): `useProxyHosts`, `useProxyHost`, `useCertificates`, `useAccessLists`, `useUsers`, `useAuditLogs`, `useCloudflaredTunnel`.
        *   **UI Hooks**: `use-toast.ts` (Notifications), `useTheme.ts` (Dark mode).
    *   **`context/`**: React Context providers.
        *   `AuthContext.tsx`: Manages user login state and permissions.
        *   `ThemeContext.tsx`: Manages light/dark mode.
        *   `LocaleContext.tsx`: Manages language settings.
    *   **`modals/`**: Complex task-specific modals.
        *   **Hosts**: `ProxyHostModal`, `RedirectionHostModal`, `DeadHostModal`, `StreamModal`, `CloudflaredTunnelModal`.
        *   **Security**: `AccessListModal`, `PermissionsModal`.
        *   **Certificates**: `CustomCertificateModal`, `DNSCertificateModal`, `HTTPCertificateModal`, `InternalCertificateModal`, `RenewCertificateModal`.
        *   **User**: `UserModal`, `ChangePasswordModal`.
    *   **`locale/`**: Internationalization (i18n) JSON files (en, de, fr, etc.).
    *   **`Router.tsx`**: Main application routing configuration defining which Page loads for which URL.
*   **`vite.config.ts`**: Vite configuration (proxy setup, plugins).
*   **`tailwind.config.js`**: Tailwind CSS configuration.
*   **`tsconfig.json`**: TypeScript configuration.

## Agent Knowledge Base & Cookbook

### Data Flow: Lifecycle of a Proxy Host Change
1.  **Frontend**: User submits form. `createProxyHost.ts` calls `POST /api/nginx/proxy-hosts`.
2.  **API**: `routes/nginx/proxy_hosts.js` receives request.
3.  **Controller**: Validates input using `lib/validator/`.
4.  **Database**: Model `ProxyHost` saves data to `proxy_host` table.
5.  **Nginx Config Generation**:
    *   `internal/nginx.js` -> `configure()` is triggered.
    *   Data is prepared (host object + env vars).
    *   **Template Rendering**: `backend/templates/proxy_host.conf` (LiquidJS) is rendered with the host data.
    *   **Output**: Config written to `/data/nginx/proxy_host/{id}.conf`.
6.  **Reload**: `nginx -s reload` is executed via `internal/nginx.js` -> `reload()`.

### Developer Cookbook
*   **Adding a New Full-Stack Feature (Best Practices)**:
    1.  **Database Migration**:
        *   Create migration: `knex migrate:make add_my_feature_table`.
        *   Define schema in `backend/migrations/YYYYMMDDHHMMSS_add_my_feature_table.js`.
        *   **Important**: Use `table.text()` for long strings (like tokens/keys) instead of `table.string()`.
    2.  **Backend Model**:
        *   Create/Update model in `backend/models/`.
        *   Add relationship mappings if needed.
    3.  **API Schema & Routes**:
        *   **Schema**: Create schema files in `backend/schema/paths/<feature>/` (or similar structure).
            *   Create separate JSON files for each method: `get.json` (List/Read), `post.json` (Create), `put.json` (Update), `delete.json` (Delete).
            *   Ensure schemas follow OpenAPI specs (tags, parameters, responses) to enable strict validation.
        *   **Controller/Router**: Create `backend/routes/<feature>.js`.
            *   Implement routes matching your schema: `router.get('/', jwtAuth, ...)` or `router.put('/:id', jwtAuth, ...)`
            *   **Security**: Always use `jwtAuth` middleware (or `checkPerm`) to secure endpoints.
            *   **Validation**: Validation is handled **automatically** by the schema. You do not need manual validation logic in the controller.
        *   **Registration**: Register route in `backend/index.js` (for root routes) or `backend/routes/nginx.js` (for nginx sub-routes).
    4.  **Frontend API Client**:
        *   Add type definition in `frontend/src/api/backend/models.ts`.
        *   Create fetch functions in `frontend/src/api/backend/`.
    5.  **Frontend Hook**:
        *   Create a React Query hook in `frontend/src/hooks/` (e.g., `useMyFeature.ts`) to manage data fetching and mutations.
    6.  **UI Implementation**:
        *   Create components in `frontend/src/components/` or pages in `frontend/src/pages/`.
        *   **Routing**: If adding a new page, register the route in `frontend/src/Router.tsx` (add lazy import and `<Route />`).
        *   Use `shadcn/ui` components for consistency.
        *   **Localization**: consistently use `<T id="..." />` component and `intl` object. **Do NOT use `react-i18next/useTranslation` directly**.
        *   Add translation keys to `frontend/src/locale/lang/en.json` first, then others.
    7.  **Documentation**:
        *   Update `AGENTS.md`, `README.md`, and Wiki.

*   **Adding a New Field to a Host**:
    1.  **Migration**: Create a Knex migration in `backend/migrations` to add the column.
    2.  **Model**: Update `backend/models/proxy_host.js` to include the field.
    3.  **Frontend**: Update `ProxyHostModal.tsx` to include the form field.
    4.  **Backend Logic**: If special handling needed (e.g. config generation), update `backend/internal/proxy-host.js` or `backend/internal/nginx.js`.
    5.  **Nginx**: Update `backend/templates/proxy_host.conf` to use the new variable (e.g., `{{ my_new_field }}`).

*   **Debugging Nginx Generation**:
    *   Check `backend/internal/nginx.js` -> `generateConfig`.
    *   Enable `DISABLE_NGINX_BEAUTIFIER=true` to see raw template output if beautifier fails.
    *   Logs are output via `backend/lib/logger.js`.

*   **Adding a New Locale**:
    1.  Create `frontend/src/locale/lang/XX.json`.
    2.  Update `frontend/src/locale/index.ts` to include the new language.



### Deep Technical Internals

#### File Persistence & Data Paths (`/data`)
*   **Configs**: `/data/nginx/{host_type}/{id}.conf` (Generated Nginx Configs).
*   **Certificates**:
    *   Let's Encrypt: `/data/tls/certbot/live`
    *   Custom: `/data/tls/custom`
*   **Access Lists**: `/data/access/{id}` (Htpasswd files).
*   **Logs**:
    *   Audit: Database (`audit_log` table).
    *   Error/Access: `/data/logs/` (Standard Nginx logs).

#### Validation & Schema
*   **Backend**: Uses **AJV** (via `ajv-formats`) and **OpenAPI** schemas located in `backend/schema/`.
    *   Endpoints validate request bodies against `backend/schema/paths`.
*   **Frontend**: Uses **Zod** (in `Form` components) or manual validation matching backend constraints.

#### React Query (Frontend State)
The frontend uses consistent Query Keys for caching and invalidation:
*   `["proxy-hosts", { expand }]`: List of proxy hosts.
*   `["proxy-hosts", id, { expand }]`: Single host details.
*   `["users"]`: User list.
*   `["settings"]`: Global settings.
*   `["health"]`: System health check.

#### Docker Infrastructure
*   **Container**: Single container architecture (s6-overlay).
*   **Services**:
    *   `nginx`: Web server / Proxy.
    *   `node`: Backend API.
    *   `crond`: Certificate renewal jobs.

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
    Aktuelle Version: **3.1.0**
    
    Auf welche Version soll ich aktualisieren?
    - **3.1.1** (Patch)
    - **3.2.0** (Minor)
    - Oder eine spezifische Versionsnummer?
    ```
5.  After user confirms, update all three files: `backend/package.json`, `frontend/package.json`, `.version`.
