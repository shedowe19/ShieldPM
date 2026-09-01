# Backup & Restore

It is critical to maintain backups of your ShieldPM instance to recover from failures, migrations, or accidental changes.

---

## 📁 What to Backup

All persistent data is stored in the `/data` directory. This is the **only directory** you need to backup.

| Content              | Path                             | Description                                      |
| :------------------- | :------------------------------- | :----------------------------------------------- |
| **Database**         | `/data/shieldpm/database.sqlite` | All hosts, users, settings and metadata (SQLite) |
| **SSL Certificates** | `/data/tls/`                     | Let's Encrypt keys and custom certs              |
| **Access Lists**     | `/data/access/`                  | htpasswd files for Basic Auth                    |
| **Nginx Configs**    | `/data/nginx/`                   | Generated configs (auto-regenerated on restart)  |
| **Encryption Keys**  | `/data/shieldpm/keys.json`       | AES-256 keys for token encryption                |
| **Tor Keys**         | `/data/tor/`                     | Onion Service private keys (if using Tor)        |
| **Environment**      | `/data/.env`                     | Configuration variables (Native/LXC only)        |

> [!IMPORTANT]
> If using an **external database** (MySQL/PostgreSQL), you must back up that database separately — it is NOT inside `/data`.

---

## 💾 Backup Procedures

### Docker

```bash
# 1. Stop the container for database consistency
docker compose stop shieldpm

# 2. Create a timestamped archive
tar -czvf shieldpm-backup-$(date +%F).tar.gz ./data

# 3. Restart the container
docker compose up -d
```

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

**MySQL / MariaDB:**

```bash
# From Docker (let the client prompt, or use a protected defaults file)
docker exec -i shieldpm-db mysqldump -u npm -p npm > shieldpm-db-$(date +%F).sql

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

Set up a daily backup with cron:

```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 3:00 AM, keeps 7 days)
0 3 * * * tar -czf /backups/shieldpm-$(date +\%F).tar.gz /data 2>/dev/null && find /backups -name "shieldpm-*.tar.gz" -mtime +7 -delete
```

> [!TIP]
> Consider using [GitOps](GitOps) for **automatic, versioned backups** of your configuration. Combined with a file backup, this provides the most comprehensive disaster recovery strategy.

---

## 🔄 Restore Procedures

### Restoring to a Fresh Instance

1. **Prepare the target directory:**

   Ensure your target `/data` directory is empty (or doesn't exist yet).

2. **Extract the backup archive:**

   ```bash
   # Docker
   tar -xzvf shieldpm-backup-2026-01-15.tar.gz -C /path/to/your/shieldpm/

   # Native / LXC
   tar -xzvf shieldpm-backup-2026-01-15.tar.gz -C /
   ```

3. **Fix permissions** (if needed):

   ```bash
   chown -R $(id -u):$(id -g) /path/to/data
   ```

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
   docker compose logs -f shieldpm   # Docker
   journalctl -u shieldpm -f         # Native / LXC
   ```

6. **Verify generated configuration and health:** inspect startup logs, call the health endpoint and run `nginx -t`.
   There is no `fullclean` command; `FULLCLEAN=true` is a startup environment option.

### Restoring an External Database

```bash
# MySQL / MariaDB
mysql -h 127.0.0.1 -u npm -p'yourpassword' npm < shieldpm-db-2026-01-15.sql

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
5. Verify migrations, the health endpoint and `nginx -t`

### Native / LXC → Docker

1. Backup `/data` from the native installation
2. Create a `compose.yaml` with the `/data` volume mount
3. Place your backup in the mounted directory
4. Start the container: `docker compose up -d`

> [!NOTE]
> ShieldPM's data format is identical across all deployment methods. You can freely migrate between Docker, Native, and LXC without any conversion steps.

> [!WARNING]
> Treat database migrations as part of the restore plan. SQLite is captured with `/data` while stopped or through the
> built-in consistent backup path. External MySQL/PostgreSQL rollback requires an operator-confirmed native dump; a
> restored application payload alone does not reverse external schema or data changes.

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
