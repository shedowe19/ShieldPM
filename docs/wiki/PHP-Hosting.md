# PHP Hosting

ShieldPM can serve files from a local directory and pass PHP requests to its optional PHP-FPM process. Review each application's own runtime requirements before using it for a production site.

## Enabling PHP Mode

1.  Create or Edit a **Proxy Host**.
2.  Set the **Scheme** to `Path`.
3.  Mount or place your application where ShieldPM can read it and enter that path (e.g., `/var/www/test/site`) in **Forward Hostname / IP**. A Docker host path must be bind-mounted into the ShieldPM container.
4.  Toggle **Enable PHP** to `On`.
5.  Select the matching **PHP Version** (e.g., 8.4) and set `PHP84=true` in the runtime environment. The matching `PHP82`, `PHP83` or `PHP84` variable must be enabled before startup.

## Installing PHP Extensions

ShieldPM supports run-time installation of PHP extensions using Debian packages (`apt-get`). You configure this via environment variables in your `compose.yaml` (Docker) or `/data/.env` (Native/LXC).

| Variable     | Description                                         |
| :----------- | :-------------------------------------------------- |
| `PHP82_APKS` | Space-separated list of `php8.2-*` Debian packages. |
| `PHP83_APKS` | Space-separated list of `php8.3-*` Debian packages. |
| `PHP84_APKS` | Space-separated list of `php8.4-*` Debian packages. |

**Example:**

```yaml
environment:
  - "PHP84=true"
  - "PHP84_APKS=php8.4-curl php8.4-gd php8.4-mysql"
```

> [!NOTE]
> Startup attempts to install the chosen PHP-FPM package and optional extensions with `apt-get`. An individual optional package that fails to install is logged and skipped. Verify availability for the Debian package sources in your image, and inspect the startup logs after changing packages.

## Custom PHP Configuration

### Option A: Per-Host GUI Settings (Recommended)

You can define custom PHP directives directly in the Proxy Host settings:

1. Edit your Proxy Host.
2. Ensure **Scheme** is `Path` and **Enable PHP** is `On`.
3. In the **Custom PHP.ini Settings** box, enter directives (one per line):
   ```ini
   memory_limit = 1024M
   upload_max_filesize = 16G
   post_max_size = 16G
   max_execution_time = 3600
   ```

### Option B: PHP.ini Files (Global or Version-wide)

You can also create `.ini` files in the data volume to affect all hosts using that PHP version.

**Path:** `/data/php/<version>/conf.d/`

**Example:** Create `/data/php/84/conf.d/memory.ini`.

---

## Example: Application Requiring PHP 8.4

The exact extensions and configuration depend on your application's release. This example shows where ShieldPM expects the PHP settings; use the application's own requirements list for package selection.

### 1. Requirements (`compose.yaml`)

Mount your webroot and enable the PHP version. Place `extra_hosts` at the **service** level if your application needs a loopback DNS override; it is not an environment variable.

```yaml
services:
  shieldpm:
    image: ghcr.io/shedowe19/shieldpm:latest
    volumes:
      - ./data:/data
      - /srv/www:/var/www:ro
    environment:
      TZ: Europe/Berlin
      PHP84: "true"
      PHP84_APKS: "php8.4-cli php8.4-curl php8.4-gd php8.4-mysql"
    # Optional, only if the application must resolve its own domain locally:
    # extra_hosts:
    #   - "your-domain.com:127.0.0.1"
```

### 2. Configuration (GUI)

In the Proxy Host **Custom PHP.ini Settings** field, enter values appropriate for your application:

```ini
memory_limit = 1024M
upload_max_filesize = 16G
post_max_size = 16G
max_execution_time = 3600
apc.enable_cli = 1
```

### 3. Permissions

The startup script launches PHP-FPM with the configured service identity (`PUID`/`PGID`; root by default). Grant that identity read access to the webroot and explicit write access only where your application needs it. Do not run `chown -R` against a bind-mounted application without checking the host-side ownership.

### 4. Application CLI Commands

For a Nextcloud installation, install the matching `php8.4-cli` package (included in the example above), then verify the CLI executable and application path in the container before running `occ`. A PHP-FPM installation alone does not guarantee the CLI is available.

```bash
# Add missing database indices
docker exec shieldpm php8.4 /var/www/test/nextcloud/occ db:add-missing-indices

# Repair mimetype issues
docker exec shieldpm php8.4 /var/www/test/nextcloud/occ maintenance:repair
```

## Troubleshooting

### "Permission denied"

If you see Nginx 500 errors or execution failures, inspect the Nginx and PHP-FPM logs and verify that the configured service identity can read the webroot.

### Env Vars & `getenv` Empty

If `getenv("PATH")` returns empty (e.g. Nextcloud System Check warning), it means PHP-FPM is clearing environment variables.
**Fix:** This is handled automatically by ShieldPM's startup script which enforces `clear_env = no`. Ensure you are running the latest version.

### .mjs Files (MIME Type Errors)

If Nextcloud's JavaScript modules fail to load with "Expected JavaScript but got application/octet-stream":
**Fix:** This is fixed in the Nginx template by forcing `Content-Type: text/javascript` for `.mjs` files. Rebuild your container.

### Local Loopback / "Data Directory Protected"

If Nextcloud complains it cannot access itself to verify data protection:
**Fix:** Add `extra_hosts` to your `compose.yaml` mapping your domain to `127.0.0.1` so the container resolves its own domain locally instead of going out to the internet (which might be blocked by NAT reflection issues).
