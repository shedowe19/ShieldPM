# CLI Reference

ShieldPM includes several internal CLI tools and scripts to help manage the application, logs, and security.

## Global Commands

### `update-shieldpm` / `update` (LXC alias)

Updates ShieldPM to the latest version. Available on **Native** and **LXC** installations.

- **Usage:** `sudo update-shieldpm` on native installations; the pre-built LXC template also installs the `update` alias. Use `sudo update-shieldpm --branch <branch>` to select another source branch (default: `develop`). The updater asks for confirmation before changing the installation.
- **What it does:**
  1.  Self-updates the script itself.
  2.  Checks GitHub for newer code.
  3.  Upgrades system packages (`apt upgrade`).
  4.  Configures the signed NodeSource repository, installs and verifies Node.js 26 plus Yarn Classic 1.22.22; when NodeSource no longer ships Corepack, the updater deliberately falls back to npm for Yarn.
  5.  Rebuilds the backend and frontend exactly from their committed Yarn lockfiles, then replaces the application payload while preserving `/data` (configuration, certificates and database).
  6.  (Optional) Downloads updated Nginx, Anubis and OAuth2 Proxy binaries for installed components.
  7.  Restarts or starts the service, applies pending database migrations during backend startup, and waits until `/api/` reports healthy status. It returns an error with service logs if that does not complete within two minutes.

### `FULLCLEAN` and `REGENERATE_ALL`

These are startup environment variables, **not** shell commands. `FULLCLEAN=true` removes selected unused runtime/log data. `REGENERATE_ALL=true` deletes generated host `.conf` files during startup so the backend recreates them. Remove either setting after the intended startup.

### `logrotate`

This is the standard system utility, not a ShieldPM-specific command. The bundled configuration rotates `/data/nginx/*.log` daily when enabled and keeps `LOGROTATIONS` copies (default: 3).

- **Manual:** `sudo logrotate --state /data/logrotate.state /etc/logrotate` (native/LXC), or run it inside the Docker container.
- **Automatic:** When `LOGROTATE=true`, ShieldPM invokes it approximately every 25 hours while running.

### `npm-reset-password` (SQLite only)

Run `sudo npm-reset-password USER_EMAIL NEW_PASSWORD` on native/LXC or `docker compose exec shieldpm npm-reset-password USER_EMAIL NEW_PASSWORD` in Docker. This command updates the local SQLite database and revokes refresh sessions; it does not connect to MySQL or PostgreSQL. For other database engines, use the application's authenticated account recovery/management flow.

## CrowdSec CLI (`cscli`)

If you have the optional CrowdSec service installed, run `cscli` in that service/container (for example, `docker exec crowdsec cscli decisions list`), **not** in the ShieldPM container.

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

### Nginx validation

`nginx -t` checks the live configuration. The ShieldPM backend validates with `nginx -tq` before signaling a reload for host changes. There is no `nginx-reload` or `/etc/s6-overlay/s6-rc.d/prepare/30-nginx.sh` command in this repository.

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
