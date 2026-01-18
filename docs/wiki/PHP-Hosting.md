# PHP Hosting

ShieldPM allows you to host PHP applications directly alongside your proxy hosts using **PHP-FPM**. This is useful for applications like Nextcloud, WordPress, or custom scripts without needing a separate container for the PHP runtime.

## Enabling PHP Mode

1.  Create or Edit a **Proxy Host**.
2.  Set the **Scheme** to `Path`.
3.  Enter the local filesystem path to your application (e.g., `/var/www/test/nextcloud`) in **Forward Hostname / IP**.
4.  Toggle **Enable PHP** to `On`.
5.  Select your desired **PHP Version** (e.g., 8.4).

## Installing PHP Extensions (APKS)

ShieldPM supports run-time installation of PHP extensions using Alpine Linux packages (`apk`). You configure this via environment variables in your `compose.yaml`.

| Variable | Description |
| :--- | :--- |
| `PHP82_APKS` | Space-separated list of `php82-*` packages. |
| `PHP83_APKS` | Space-separated list of `php83-*` packages. |
| `PHP84_APKS` | Space-separated list of `php84-*` packages. |

**Example:**
```yaml
environment:
  - "PHP84=true"
  - "PHP84_APKS=php84-curl php84-openssl php84-gd php84-pdo_mysql"
```

> [!NOTE]
> The container will install these packages every time it starts. This ensures your extensions are always up-to-date with the container capabilities.

## Custom PHP Configuration (php.ini)

You can override PHP settings (like memory limits) by creating `.ini` files in the data volume.

**Path:** `/data/php/<version>/conf.d/`

**Example:** Create `/data/php/84/conf.d/memory.ini`:
```ini
memory_limit = 1024M
upload_max_filesize = 10G
post_max_size = 10G
max_execution_time = 3600
```

---

## Cookbook: Nextcloud

Hosting Nextcloud requires specific extensions and configurations. Here is a verified recipe.

### 1. Requirements (`compose.yaml`)
Add these extensions to your `compose.yaml`. This covers almost all Nextcloud apps and core features.

```yaml
    environment:
      - "PHP84=true"
      # Comprehensive list for Nextcloud 28+
      - "PHP84_APKS=php84-simplexml php84-xml php84-dom php84-xmlwriter php84-xmlreader php84-curl php84-mbstring php84-gd php84-zip php84-openssl php84-pdo php84-pdo_mysql php84-pdo_sqlite php84-fileinfo php84-ctype php84-session php84-iconv php84-intl php84-posix php84-pecl-imagick php84-opcache php84-gmp php84-bcmath php84-pcntl php84-sodium php84-exif php84-sysvsem imagemagick imagemagick-svg"
      # Fix for self-checks
      extra_hosts:
        - "your-domain.com:127.0.0.1" 
```

### 2. Permissions
ShieldPM runs as user `root` but PHP-FPM workers run as `nobody` (UID 65534) or the PUID/PGID you configured. ensure your files are owned correctly.
```bash
docker exec shieldpm chown -R nobody:nobody /var/www/test/nextcloud
```

### 3. Maintenance Commands
You can run `occ` commands directly via `docker exec`. 

**Note:** Since ShieldPM v3.2.0, the `php8X` CLI tools are installed automatically.

```bash
# Add missing database indices
docker exec -u nobody shieldpm php84 /var/www/test/nextcloud/occ db:add-missing-indices

# Repair mimetype issues
docker exec -u nobody shieldpm php84 /var/www/test/nextcloud/occ maintenance:repair
```

## Troubleshooting

### "Permission denied"
If you see Nginx 500 errors or execution failures, checking the error log usually reveals permission issues. Ensure the folder is owned by the user ShieldPM runs as (default PUID 0/root, but `nobody` for PHP workers).

### Env Vars & `getenv` Empty
If `getenv("PATH")` returns empty (e.g. Nextcloud System Check warning), it means PHP-FPM is clearing environment variables.
**Fix:** This is handled automatically by ShieldPM's startup script which enforces `clear_env = no`. Ensure you are running the latest version.

### .mjs Files (MIME Type Errors)
If Nextcloud's JavaScript modules fail to load with "Expected JavaScript but got application/octet-stream":
**Fix:** This is fixed in the Nginx template by forcing `Content-Type: text/javascript` for `.mjs` files. Rebuild your container.

### Local Loopback / "Data Directory Protected"
If Nextcloud complains it cannot access itself to verify data protection:
**Fix:** Add `extra_hosts` to your `compose.yaml` mapping your domain to `127.0.0.1` so the container resolves its own domain locally instead of going out to the internet (which might be blocked by NAT reflection issues).
