# Backup & Restore

It is critical to maintain backups of your ShieldPM instance to recover from failures, migrations, or accidental changes.

---

## 📁 What to Backup

Back up the full `/data` directory **and** any external database or external service data that your deployment uses. The examples below assume the Compose bind mount `./data:/data`; the repository's `compose.yaml` instead mounts `/opt/shieldpm:/data`.

| Content              | Path                             | Description                                                            |
| :------------------- | :------------------------------- | :--------------------------------------------------------------------- |
| **Database**         | `/data/shieldpm/database.sqlite` | SQLite hosts, users and settings; include any WAL/SHM files            |
| **SSL Certificates** | `/data/tls/`                     | Let's Encrypt, custom and internal CA certificates and private keys    |
| **Access Lists**     | `/data/access/`                  | htpasswd files for Basic Auth                                          |
| **Nginx Configs**    | `/data/nginx/`                   | Generated configs and logs; keep custom files in `/data/custom_nginx/` |
| **Encryption Keys**  | `/data/shieldpm/keys.json`       | AES-256 keys for token encryption                                      |
| **Tor Keys**         | `/data/tor/`                     | Onion Service private keys (if using Tor)                              |
| **Environment**      | `/data/.env` or Compose file     | Native/LXC settings or Docker deployment settings, respectively        |

> [!IMPORTANT]
> If using an **external database** (MySQL/PostgreSQL), you must back it up separately — it is NOT inside `/data`. Keep any bind-mounted website content (such as `/var/www`) and OpenAppSec/CrowdSec volumes in the same recovery plan if you use them.

---

## 💾 Backup Procedures

### Docker

```bash
# 1. Stop the container for database consistency
docker compose stop shieldpm # use `app` if your service is named app

# 2. Create a timestamped archive
tar -czvf shieldpm-backup-$(date +%F).tar.gz ./data ./compose.yaml

# 3. Restart the container
docker compose up -d
```

If you use the repository's `compose.yaml`, replace `./data` with `/opt/shieldpm` in the archive command. Its absolute path is archived as `opt/shieldpm`, so follow the separate restore instructions below. Store the archive with restricted access: it contains database contents, private keys and possibly Compose credentials.

### Native / LXC

```bash
# 1. Stop the service
systemctl stop shieldpm

# 2. Create a backup archive
tar -czvf shieldpm-backup-$(date +%F).tar.gz /data

# 3. Restart the service
systemctl start shieldpm
```

### External Database Dump

If you use MySQL/MariaDB or PostgreSQL, backup the database separately:

**MySQL / MariaDB:** Replace database names, user names and container names with your deployment's values. Prompt for the password rather than putting it into shell history.

```bash
# From Docker
docker exec shieldpm-db sh -c 'exec mysqldump -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > shieldpm-db-$(date +%F).sql

# From host
mysqldump -h 127.0.0.1 -u npm -p npm > shieldpm-db-$(date +%F).sql
```

**PostgreSQL:**

```bash
# From Docker
docker exec shieldpm-db pg_dump -U npm npm > shieldpm-db-$(date +%F).sql

# From host
pg_dump -h 127.0.0.1 -U npm npm > shieldpm-db-$(date +%F).sql
```

### Automated Backups (Cron)

Schedule the stop/archive/start procedure above, or use SQLite's `.backup` command for an online database snapshot and separately archive the remaining `/data` files. A live `tar` of SQLite files without a coordinated snapshot can be inconsistent. Test restoration before relying on an automated schedule.

> [!TIP]
> [GitOps](GitOps) can version configuration but is **not a replacement** for `/data` and database backups. Certificate private keys are excluded from its exported certificate files; exported YAML may contain service tokens, and the repository must be private and access-controlled.

---

## 🔄 Restore Procedures

### Restoring to a Fresh Instance

1. **Prepare the target directory:**

   Stop ShieldPM and ensure the target `/data` directory is empty (or doesn't exist yet). Retain a copy of any target data you are replacing.

2. **Extract the backup archive:**

   ```bash
   # Docker: archive was created from ./data and ./compose.yaml
   tar -xzvf shieldpm-backup-2026-01-15.tar.gz -C /path/to/your/compose-directory/

   # Docker: repository compose.yaml uses /opt/shieldpm:/data;
   # extract each member to its original location
   tar -xzvf shieldpm-backup-2026-01-15.tar.gz -C / opt/shieldpm
   tar -xzvf shieldpm-backup-2026-01-15.tar.gz -C /path/to/your/compose-directory/ ./compose.yaml

   # Native / LXC
   tar -xzvf shieldpm-backup-2026-01-15.tar.gz -C /
   ```

3. **Fix permissions** (if needed):

   Apply the ownership expected by your `PUID`/`PGID` and bind mounts. Keep private keys and the key file restricted; the startup script also enforces private modes for `/data/tls`, `/data/access` and `/data/shieldpm`.

4. **Start ShieldPM:**

   ```bash
   # Docker
   docker compose up -d

   # Native / LXC
   systemctl start shieldpm
   ```

5. **Verify the restore:**

   ```bash
   # Check logs for errors
   docker compose logs -f shieldpm   # Docker (use app for the Quick Start example)
   journalctl -u shieldpm -f         # Native / LXC
   ```

6. **Check generated Nginx configuration** after startup with `docker compose exec shieldpm nginx -t` (Docker; use `app` for the Quick Start) or `nginx -t` (native/LXC). If you intentionally need to regenerate host files, set `REGENERATE_ALL=true` for a single startup, then remove it and restart. `FULLCLEAN` controls cleanup of other runtime data; there is no `fullclean` CLI command.

### Restoring an External Database

```bash
# MySQL / MariaDB
mysql -h 127.0.0.1 -u npm -p npm < shieldpm-db-2026-01-15.sql

# PostgreSQL
psql -h 127.0.0.1 -U npm npm < shieldpm-db-2026-01-15.sql
```

---

## 🔀 Migration Between Deployment Methods

### Docker → Native / LXC

1. Backup `/data` from your Docker volume
2. Install ShieldPM natively via `install.sh` on a fresh Debian 13
3. Copy your backup to `/data` on the new server
4. Start ShieldPM: `systemctl start shieldpm`
5. Verify the Nginx config and logs; restore any external database and bind mounts separately

### Native / LXC → Docker

1. Backup `/data` from the native installation
2. Create a `compose.yaml` with the `/data` volume mount
3. Place your backup in the mounted directory
4. Start the container: `docker compose up -d`

> [!NOTE]
> Keep the same compatible application/database version during a deployment move, preserve the encryption keys under `/data/shieldpm/`, and check path and permission differences before starting. External database migrations are separate from copying `/data`.

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
