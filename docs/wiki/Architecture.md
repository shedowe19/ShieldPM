# Architecture & Internals

ShieldPM consists of a React UI, a Node.js/Express API, a database, and Nginx. Docker images use the separate `shieldpm-nginx` base image for Nginx and its compiled modules. Native/LXC installations use the installer and local services. ModSecurity, CrowdSec, OpenAppSec, Anubis and OAuth2 Proxy are integrations; their presence and position in a request path depend on configuration.

## Configuration flow

1. The UI calls an authenticated `/api/nginx/*` route. Route validation and permission checks precede the internal service operation.
2. Objection.js models persist the host and its relations through Knex. The database can be SQLite, MySQL/MariaDB or PostgreSQL.
3. `backend/internal/nginx.js` refreshes the relevant host graph, renders a **LiquidJS** template in `backend/templates/` and writes a host file such as `/data/nginx/proxy_host/42.conf`.
4. The configuration engine runs `nginx -tq` before signaling `nginx -s reload`. Host writes are serialized. If rendering or validation fails, it restores the prior file and records an error; bulk regeneration stages changes, validates the complete configuration and handles rollback. There is no global two-second reload delay in this engine.

The configuration preview endpoint only renders and compares a draft. It does not persist a host or run the full Nginx validation; saving the host performs the normal validation path.

### Components and responsibilities

| Component                                        | Role                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `frontend/src/pages/` and `frontend/src/api/`    | React pages and API client hooks                                         |
| `backend/app.js`, `backend/routes/`              | Middleware, authentication handling, request validation and HTTP routing |
| `backend/internal/`                              | Host lifecycle, certificates, analytics and integration services         |
| `backend/models/`, `backend/migrations/`         | Objection.js data access and Knex schema changes                         |
| `backend/lib/utils.js`, `backend/templates/`     | LiquidJS rendering and Nginx configuration templates                     |
| `rootfs/usr/local/bin/` and `scripts/install.sh` | Container startup and native/LXC installation                            |

The API accepts a Bearer access token or an HttpOnly browser cookie. The browser sends a CSRF header on applicable writes. Authorization is checked by the backend against the current account and resource permissions. Scheduled work includes certificate renewal checks, DDNS, host monitoring and analytics retention; the browser does not need to stay open for these jobs.

## Traffic flow

Nginx receives HTTP(S) traffic and forwards configured proxy hosts to their upstream services. Depending on the host and deployment settings, requests may be checked by CrowdSec, ModSecurity or OpenAppSec, or sent through Anubis or OAuth2 Proxy before reaching the upstream. None of these gates is automatically enabled for every host.

Built-in analytics tails `/data/nginx/json_access.log`, writes short-lived detailed rows and longer-lived aggregates to the database, then serves them through per-host and global endpoints. Optional GoAccess uses the same log stream for a separate dashboard when `GOA=true`. See [Analytics](Analytics) for retention and access details.

## Persistent data

| Path                             | Purpose                                        |
| -------------------------------- | ---------------------------------------------- |
| `/data/shieldpm/database.sqlite` | Default SQLite database                        |
| `/data/shieldpm/keys.json`       | Persistent token/encryption keys; keep private |
| `/data/nginx/`                   | Generated host configuration and Nginx logs    |
| `/data/tls/`                     | Custom and Certbot certificates                |
| `/data/access/`                  | Access-list files                              |

The startup scripts migrate several older paths (including `/data/database.sqlite` and `/data/keys.json`) into the current layout.

## Maintenance commands

- `npm-reset-password` invokes the password-reset script in container installations. For native/LXC installations, use the command installed by that deployment's installer.
- `shieldpm-vacuum` checks that the SQLite database exists and explicitly runs `sqlite-vaccum.js` to reclaim space. Run it during planned maintenance rather than as a normal startup step.

For the complete API contract, see [API Documentation](API-Docs). For environment settings and volume mounts, see [Configuration](Configuration) and [Docker Compose Reference](Docker-Compose-Reference).

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
