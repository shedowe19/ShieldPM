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
    * The `internal/nginx.js` logic is triggered.
    * It fetches the fresh host data.
    * It renders the EJS template (`templates/proxy_host.conf`).
    * It writes the file to `/data/nginx/proxy_host/X.conf`.
4. **Reload:** The backend executes `nginx -s reload`.

## 📂 File Structure

* `/data`: Base data directory (mounted volume).
  * `database.sqlite`: The default database.
  * `keys.json`: JSON Web Tokens (JWT) signing keys.
  * `nginx/`: Generated Nginx configurations.
  * `tls/`: Custom and Let's Encrypt certificates.
  * `access/`: Access List htpasswd files.
  * `logs/`: Nginx access and error logs.

## 🛠️ Internal CLI Utilities

These scripts are available inside the container for maintenance.

### `npm-reset-password`

Resets the `admin@example.org` user's password if you are locked out.

```bash
# Docker
docker exec -it shieldpm npm-reset-password

# Native / LXC
npm-reset-password
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
