# CLI Reference

ShieldPM includes several internal CLI tools and scripts to help manage the application, logs, and security.

## Global Commands

### `update` / `update-shieldpm`
Updates ShieldPM to the latest version. Available on **Native** and **LXC** installations.

*   **Usage:** `update` or `update-shieldpm`
*   **What it does:**
    1.  Self-updates the script itself.
    2.  Checks GitHub for newer code.
    3.  Upgrades system packages (`apt upgrade`).
    4.  Configures the signed NodeSource repository, installs and verifies Node.js 26 plus Yarn Classic 1.22.22; when NodeSource no longer ships Corepack, the updater deliberately falls back to npm for Yarn.
    5.  Rebuilds the backend and frontend exactly from their committed Yarn lockfiles, then replaces the application payload while preserving `/data` (configuration, certificates and database).
    6.  (Optional) Downloads updated Nginx, Anubis and OAuth2 Proxy binaries for installed components.
    7.  Restarts or starts the service, applies pending database migrations during backend startup, and waits until `/api/` reports healthy status. It returns an error with service logs if that does not complete within two minutes.

### `fullclean`
Cleans up unused configuration folders. This checks the database for active hosts and removes any `data/nginx` config files that do not have a corresponding database entry.

*   **Usage:** `fullclean`
*   **When to use:** If you suspect you have "zombie" configuration files or after restoring a database backup.

### `logrotate`
Manually triggers the log rotation script. This compresses and rotates `json_access.log`, `error.log`, and `stream.log`.

*   **Usage:** `logrotate`
*   **Automatic:** Runs daily if `LOGROTATE=true` is set.

## CrowdSec CLI (`cscli`)

If you have CrowdSec enabled, you can interact with it directly inside the container using the `cscli` command.

### Common Commands

*   **List Decisions (Bans):**
    ```bash
    cscli decisions list
    ```

*   **Ban an IP:**
    ```bash
    cscli decisions add --ip 1.2.3.4 --duration 24h --reason "Manual Ban"
    ```

*   **Unban an IP:**
    ```bash
    cscli decisions delete --ip 1.2.3.4
    ```

*   **Update Hub:**
    ```bash
    cscli hub update && cscli hub upgrade
    ```

## Development / Debugging

### `nginx-reload`
Manually tests the Nginx configuration and reloads the service if successful.

*   **Usage:** `/etc/s6-overlay/s6-rc.d/prepare/30-nginx.sh` (Internal script)

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
