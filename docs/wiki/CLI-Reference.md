# CLI Reference

ShieldPM includes several internal CLI tools and scripts to help manage the application, logs, and security.

## Global Commands

### `update` / `update-shieldpm`

Updates ShieldPM to the latest version. Available on **Native** and **LXC** installations.

- **Usage:** `update` or `update-shieldpm`
- **What it does:**
  1.  Verifies the existing Node.js 24, Corepack 0.36.0 and Yarn 4.18.0 toolchain; it does not run APT or upgrade them.
  2.  Resolves `--branch <branch>` to an exact remote commit SHA and fetches only that source state.
  3.  Creates a verified SQLite online backup, or requires `--external-db-backup-confirmed` for a tested native
      MySQL/PostgreSQL backup.
  4.  Rebuilds backend and frontend from immutable lockfiles in private staging directories.
  5.  Atomically swaps app, frontend, rootfs and service files; a failed 120-second health gate restores files and
      SQLite. External databases require an operator restore and remain stopped after failure.

> [!IMPORTANT]
> Make a tested backup first. Native payload rollback cannot restore an external MySQL/PostgreSQL database; keep a
> database-native dump and restore it explicitly when a migration must be reversed.

### `npm-reset-password USER_EMAIL PASSWORD`

Resets one local password in `/data/shieldpm/database.sqlite`.

- **Docker Compose:** `docker compose exec app npm-reset-password user@example.org 'new-long-password'`
- **Native / LXC:** `npm-reset-password user@example.org 'new-long-password'`
- **Scope:** SQLite only. It does not connect to MySQL or PostgreSQL.

There is no `fullclean` command. `FULLCLEAN=true` is a startup configuration option; do not invoke an undocumented
executable after a restore.

### `logrotate`

Manually triggers the log rotation script. This compresses and rotates `json_access.log`, `error.log`, and `stream.log`.

- **Usage:** `logrotate`
- **Automatic:** Runs daily if `LOGROTATE=true` is set.

## CrowdSec CLI (`cscli`)

If you have CrowdSec enabled, you can interact with it directly inside the container using the `cscli` command.

### Common Commands

- **List Decisions (Bans):**

  ```bash
  cscli decisions list
  ```

- **Ban an IP:**

  ```bash
  cscli decisions add --ip 1.2.3.4 --duration 24h --reason "Manual Ban"
  ```

- **Unban an IP:**

  ```bash
  cscli decisions delete --ip 1.2.3.4
  ```

- **Update Hub:**
  ```bash
  cscli hub update && cscli hub upgrade
  ```

## Development / Debugging

### `nginx-reload`

Manually tests the Nginx configuration and reloads the service if successful.

- **Usage:** `/etc/s6-overlay/s6-rc.d/prepare/30-nginx.sh` (Internal script)

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
