# Backup & Restore

It is critical to maintain backups of your NPMplus instance to recover from failures or migrations.

## What to Backup

All persistent data for NPMplus is stored in the volume mounted to `/data` inside the container.

### 1. `/data` Directory
This directory contains everything you need:
*   **Database:** `database.sqlite` (if using SQLite).
*   **Certificates:** `tls/` (Let's Encrypt keys and custom certs).
*   **Access Lists:** `access/` (htpasswd files).
*   **Configs:** `nginx/` (Generated Nginx configurations).
*   **CrowdSec Data:** `crowdsec/` (if enabled, usually in a separate volume but integrated here).

## Backup Procedures

### Simple Docker Backup
If you mapped a local folder to `/data`:

```bash
# 1. Stop the container to ensure database consistency
docker compose stop npmplus

# 2. Create a standardized archive
tar -czvf npmplus-backup-$(date +%F).tar.gz /path/to/your/npmplus/data

# 3. Start the container
docker compose up -d
```

### Database Dump (MySQL / PostgreSQL)
If you are using an external database, you **must** backup that database separately.

**MySQL:**
```bash
docker exec npmplus-db mysqldump -u npm -pnpm npm > dump.sql
```

**PostgreSQL:**
```bash
docker exec npmplus-db pg_dump -U npm npm > dump.sql
```

## Restore Procedures

### Restoring to a Fresh Instance

1.  **Prepare Directory:**
    Ensure your target `/data` directory is empty.

2.  **Extract Archive:**
    ```bash
    tar -xzvf npmplus-backup-2023-01-01.tar.gz -C /path/to/your/npmplus/data
    ```

3.  **Fix Permissions (Optional but Recommended):**
    Ensure the user running the container (PUID/PGID) has read/write access to the extracted files.

4.  **Start Container:**
    ```bash
    docker compose up -d
    ```

5.  **Verify:**
    *   Check logs: `docker compose logs -f npmplus`
    *   Login to the web interface.
    *   Run `fullclean` inside the container to ensure config consistency:
        ```bash
        docker exec -it npmplus fullclean
        ```

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/NPMplus/issues)
