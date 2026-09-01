# Architecture & Internals

Understanding how ShieldPM works under the hood can help with debugging and advanced hacking.

## 🔄 Data Flow

```
  ┌──────────┐     ┌──────────────────────────────────────────────────────────┐
  │  Browser  │────▶│                    ShieldPM                              │
  └──────────┘     │  ┌────────────────────────────────────────────────────┐  │
                   │  │               Nginx (Frontend)                     │  │
                   │  │  ┌──────────┐ ┌───────────┐ ┌──────────────────┐  │  │
                   │  │  │CrowdSec  │ │ModSecurity│ │  OpenAppSec      │  │  │
                   │  │  │(Lua IPS) │ │  (WAF)    │ │  (AI WAF)        │  │  │
                   │  │  └──────────┘ └───────────┘ └──────────────────┘  │  │
                   │  └──────────────────┬─────────────────────────────────┘  │
                   │                     │                                    │
                   │         ┌───────────┴───────────┐                       │
                   │         ▼                       ▼                       │
                   │  ┌─────────────┐    ┌──────────────────┐                │
                   │  │   Anubis    │    │   OAuth2-Proxy   │                │
                   │  │ (PoW Gate)  │    │   (Auth Gate)    │                │
                   │  └──────┬──────┘    └──────────────────┘                │
                   │         ▼                                               │
                   │  ┌──────────────────────────────────────────────────┐   │
                   │  │           Nginx (Backend Proxy)                  │   │
                   │  │  proxy_pass → upstream service                   │   │
                   │  └──────────────────┬───────────────────────────────┘   │
                   └─────────────────────┼──────────────────────────────────┘
                                         ▼
                   ┌─────────────────────────────────────────┐
                   │            Your Application             │
                   │     (Nextcloud, Jellyfin, API, ...)     │
                   └─────────────────────────────────────────┘
```

### Internal Process Overview

```
  ┌────────────┐    ┌────────────┐     ┌────────────────┐
  │  React UI  │───▶│ Express.js │────▶│   Database     │
  │ (Frontend) │◀───│  (Backend) │     │ SQLite/MySQL/  │
  └────────────┘    └─────┬──────┘     │   PostgreSQL   │
                          │            └────────────────┘
               ┌──────────┼──────────────────┐
               ▼          ▼                  ▼
        ┌────────────┐ ┌──────────┐   ┌────────────┐
        │ nginx.js   │ │ EJS Tmpl │   │ Integrations│
        │ (Config    │ │ *.conf   │   │ Tor, CF,   │
        │  Engine)   │ │          │   │ GitOps...  │
        └─────┬──────┘ └──────────┘   └────────────┘
              │
              ▼
        ┌─────────────┐
        │ /data/nginx/ │──▶ nginx -s reload
        │ *.conf files │
        └─────────────┘
```

1. **API Request:** User creates a host via the Web UI (React). Request goes to the Node.js API (`/backend`).
2. **Database:** The Host model is saved to the database (SQLite/MySQL/Postgres) via Knex/Objection ORM.
3. **Config Generation:**
   - The `internal/nginx.js` logic is triggered.
   - It fetches the fresh host data.
   - It renders the EJS template (`templates/proxy_host.conf`).
   - It writes the file to `/data/nginx/proxy_host/X.conf`.
4. **Validate and Reload:** ShieldPM stages the candidate configuration, runs `nginx -t`, and reloads only when the
   complete configuration is valid. Runtime mutations use compensation/rollback so a failed render, validation or
   reload restores the prior database and generated-file state.

## 📂 File Structure

- `/data`: Base data directory (mounted volume).
  - `shieldpm/database.sqlite`: The default SQLite database.
  - `shieldpm/keys.json`: JWT signing and application encryption keys.
  - `shieldpm/analytics-spool.ndjson`: Durable analytics ingestion spool.
  - `shieldpm/initial-admin-setup-token`: One-time first-administrator ownership token (removed after claim).
  - `nginx/`: Generated Nginx configurations.
  - `tls/`: Custom and Let's Encrypt certificates.
  - `access/`: Access List htpasswd files.
- `/data/nginx/json_access.log`: Nginx JSON access log.
- `/data/nginx/error.log`: Nginx error log.
- `/run/shieldpm.sock`: Ephemeral Unix socket between Nginx and the Node.js backend.

SQLite is the supported default. MySQL/MariaDB and PostgreSQL are optional external backends. They require an
independent, database-native backup and restore procedure because they are not contained in `/data`.

## 🛠️ Internal CLI Utilities

These scripts are available inside the container for maintenance.

### `npm-reset-password`

Resets a named user's password in the local SQLite database. It does not support MySQL/PostgreSQL.

```bash
# Docker
docker exec -it shieldpm npm-reset-password user@example.org 'new-long-password'

# Native / LXC
npm-reset-password user@example.org 'new-long-password'
```

### `sqlite-vaccum.js`

Optimizes the SQLite database file by running the `VACUUM` command to reclaim unused space.

```bash
# Docker
docker exec -it shieldpm node /usr/local/bin/sqlite-vaccum.js

# Native / LXC
node /usr/local/bin/sqlite-vaccum.js
```

### `clean-modules`

Used during the build process to remove unnecessary files from `node_modules`, keeping the image size small.

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
