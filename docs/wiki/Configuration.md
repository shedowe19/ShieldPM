# Configuration

NPMplus is primarily configured via **Environment Variables** in your `compose.yaml`.

## 🌍 General Settings

| Variable | Description | Default |
| :--- | :--- | :--- |
| `TZ` | Timezone (e.g., `Europe/Berlin`) | Required |
| `ACME_EMAIL` | Email for Let's Encrypt | Optional |
| `NPM_PORT` | Port for the Admin UI | `81` |
| `HTTP_PORT` | Port for HTTP traffic | `80` |
| `HTTPS_PORT` | Port for HTTPS traffic | `443` |
| `LOGROTATE` | Enable access log rotation to disk | `false` |

## 💾 Database Configuration

### SQLite (Default)
No extra configuration needed. Data is stored in `/data/database.sqlite`.

### MySQL / MariaDB
```yaml
DB_MYSQL_HOST=db
DB_MYSQL_PORT=3306
DB_MYSQL_USER=npm
DB_MYSQL_PASSWORD=npm
DB_MYSQL_NAME=npm
```

### PostgreSQL
```yaml
DB_POSTGRES_HOST=db
DB_POSTGRES_PORT=5432
DB_POSTGRES_USER=npm
DB_POSTGRES_PASSWORD=npm
DB_POSTGRES_NAME=npm
```

### 🔄 Auto-Migration
If you switch from SQLite to an external database (MySQL/Postgres) and start a fresh container:
1.  NPMplus detects the empty target database.
2.  It finds the existing `database.sqlite` in `/data`.
3.  It automatically migrates all data to the new database.
4.  It renames the old file to `database.sqlite.migrated`.

## 🌐 Network & IPv6

*   `IPV4_BINDING`: Bind to specific IPv4 (default: all).
*   `IPV6_BINDING`: Bind to specific IPv6 (default: all).
*   `DISABLE_IPV6`: Set to `true` to fully disable IPv6 listening.
*   `network_mode: host`: Recommended for best performance and IP visibility (requires adjusting ports if they conflict).

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/NPMplus/issues) | [💬 Discord](https://discord.gg/y8DhYhv427)
