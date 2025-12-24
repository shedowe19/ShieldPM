# NPMplus

## Project Overview
NPMplus is an advanced fork of Nginx Proxy Manager (NPM). It provides a user-friendly web interface for managing Nginx reverse proxies, with a focus on security, performance, and ease of use. It includes features like HTTP/3 (QUIC) support, CrowdSec integration, ModSecurity (WAF), and improved TLS certificate management (including OCSP Stapling).

**Key Technologies:**
*   **Backend:** Node.js, Express (v5.2), Knex.js (v3.1), Objection.js (v3.1), SQLite (via better-sqlite3 v12.5).
*   **Frontend:** React (v19.2), Vite (v7.3), TypeScript (v5.9), Tailwind CSS (v3.4), shadcn/ui (Radix UI), React Query (v5.90).
*   **Infrastructure:** Docker, Nginx (with QUIC support), Certbot, CrowdSec.
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
*   **Final Image:** Combines frontend assets, backend code, and Nginx configuration into an Alpine-based image (`zoeyvid/nginx-quic`).

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
    *   `caddy/`: Separate directory for Caddy-related configuration (alternative to NPMplus web GUI).
*   **Contribution:** New features should ideally include tests. Changes to the Nginx configuration generation logic should be carefully tested.

## Configuration & Environment
The application is configured primarily through Environment Variables (handled in `backend/lib/config.js`).

### Key Environment Variables
*   **Database:**
    *   `DB_MYSQL_HOST`, `DB_MYSQL_USER`, `DB_MYSQL_PASSWORD`, `DB_MYSQL_NAME`, `DB_MYSQL_PORT`
    *   `DB_POSTGRES_HOST`, `DB_POSTGRES_USER`, `DB_POSTGRES_PASSWORD`, `DB_POSTGRES_NAME`, `DB_POSTGRES_PORT`
    *   *Default*: SQLite (`/data/npmplus/database.sqlite`)
*   **Keys:**
    *   Managed automatically in `/data/npmplus/keys.json` (RSA 2048-bit for JWT).
*   **Data Path:**
    *   `DATA_PATH` (default: `/data`) - Base directory for all data.

## Database & Migrations
Database schema evolution is handled by **Knex.js** migrations in `backend/migrations`.
*   **Engine Support:** SQLite (default), MySQL (`mysql2`), PostgreSQL (`pg`).
*   **Key Migrations:**
    *   `20180618015850_initial.js`: Initial Schema.
    *   `20200410143839_access_list_client.js`: Multi-user Access Lists.
    *   `20240427161436_stream_ssl.js`: SSL support for Streams.
    *   `20251212000000_add_bandwidth_limit.js`: New bandwidth limiting feature.

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
| `/nginx/404` | `DeadHosts` | Manage 404 Hosts. |
| `/access` | `Access` | Admin Control Lists (ACLs). |
| `/certificates` | `Certificates` | SSL/TLS Certificate management. |
| `/users` | `Users` | User management. |
| `/settings` | `Settings` | Global App Settings. |
| `/audit-log` | `AuditLog` | View system events. |

## Project Structure

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
*   **`models/`**: [Objection.js](https://vincit.github.io/objection.js/) ORM models.
    *   **`ProxyHost`** (`proxy_host`):
        *   Relates to `User` (owner), `AccessList`, `Certificate`.
        *   Stores `domain_names` (JSON), `meta` (JSON), `locations` (JSON).
    *   **`User`** (`user`):
        *   Authentication and permissions.
    *   **`AccessList`** (`access_list`):
        *   Contains `clients` (Basic Auth users).
    *   **`Certificate`** (`certificate`):
        *   Stores paths/metadata for SSL certs.
*   **`routes/`**: Express.js (v5) Router.
    *   **`nginx/`**: RESTful endpoints for managing hosts.
        *   e.g., `GET /nginx/proxy-hosts`, `POST /nginx/proxy-hosts`.
    *   **Root**: Auth (`/tokens`), User (`/users`), Settings (`/settings`).
*   **`lib/`**: Shared utilities and helper functions.
    *   **Core**: `access.js` (Permissions), `config.js` (App Config), `logger.js`, `utils.js`.
    *   **Security**: `encryption.js`, `auth.js`.
    *   **Validators**: `validator/` directory.
    *   **Helpers**: `helpers.js`, `certbot.js`.
*   **`templates/`**: EJS templates used to generate the actual Nginx configuration files (e.g., `proxy_host.ejs`).
*   **`migrations/`**: Knex.js database migration files used to initialize and update the database schema.
*   **`rootfs/`**: Filesystem overlays for Docker.
    *   **`etc/`**: Configuration files (e.g., `s6-overlay`, `nginx`, `certbot`).
    *   **`usr/`**: Binary overlays and scripts.

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
        *   **`Nginx/`**: `ProxyHosts`, `RedirectionHosts`, `Streams`, `DeadHosts`.
        *   **`Access/`**: `AccessLists`.
        *   **`Certificates/`**: `Certificates` list and management.
        *   **`Dashboard/`**: Main `Dashboard` view.
        *   **`Users/`**: `User` management.
        *   **`Settings/`**: `AuditLog` and general `Settings`.
        *   **`Login/`**: Login page.
    *   **`hooks/`**: Custom React hooks.
        *   **Data Hooks** (React Query wrappers): `useProxyHosts`, `useProxyHost`, `useCertificates`, `useAccessLists`, `useUsers`, `useAuditLogs`, etc.
        *   **UI Hooks**: `use-toast.ts` (Notifications), `useTheme.ts` (Dark mode).
    *   **`context/`**: React Context providers.
        *   `AuthContext.tsx`: Manages user login state and permissions.
        *   `ThemeContext.tsx`: Manages light/dark mode.
        *   `LocaleContext.tsx`: Manages language settings.
    *   **`modals/`**: Complex task-specific modals.
        *   **Hosts**: `ProxyHostModal`, `RedirectionHostModal`, `DeadHostModal`, `StreamModal`.
        *   **Security**: `AccessListModal`, `PermissionsModal`.
        *   **Certificates**: `CustomCertificateModal`, `DNSCertificateModal`, `HTTPCertificateModal`, `RenewCertificateModal`.
        *   **User**: `UserModal`, `ChangePasswordModal`.
    *   **`locale/`**: Internationalization (i18n) JSON files (en, de, fr, etc.).
    *   **`Router.tsx`**: Main application routing configuration defining which Page loads for which URL.

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
*   **Adding a New Field to a Host**:
    1.  **Migration**: Create a Knex migration in `backend/migrations` to add the column.
    2.  **Model**: Update `backend/models/proxy_host.js` to include the field (if validation/parsing needed).
    3.  **Frontend**: Update `ProxyHostModal.tsx` to include the form field.
    4.  **Backend Logic**: If special handling needed, update `backend/internal/proxy-host.js`.
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
