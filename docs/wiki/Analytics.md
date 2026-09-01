# Advanced Analytics

ShieldPM includes a powerful, privacy-friendly analytics dashboard directly integrated into the interface. This feature provides real-time insights into your proxy traffic without relying on third-party services.

---

## 🏗️ Architecture

```
  ┌──────────┐     ┌──────────────┐     ┌──────────────────────┐
  │  Nginx    │────▶│  Access Logs │────▶│  ShieldPM Backend    │
  │  (Traffic)│     │  (per host)  │     │  (Analytics Engine)  │
  └──────────┘     └──────────────┘     └──────────┬───────────┘
                                                   │
                          ┌────────────────────────┤
                          ▼                        ▼
                   ┌──────────────┐     ┌──────────────────────┐
                   │  GoAccess    │     │  React Dashboard     │
                   │  (Port 91)   │     │  (Built-in UI)       │
                   │  Deep HTML   │     │  Charts, Tables,     │
                   │  Reports     │     │  GeoIP, Status Codes │
                   └──────────────┘     └──────────────────────┘
```

---

## Key Features

- **Real-time Traffic Overview:** visualizes bandwidth usage and request counts.
- **Requests Over Time:** Area chart showing traffic trends over the last 1h, 24h, 7d, or 30d.
- **Status Codes:** Bar chart breakdown of HTTP response codes (2xx, 3xx, 4xx, 5xx).
- **Top Lists:**
  - **Countries:** GeoIP-based breakdown of traffic sources.
  - **IPs:** Most frequent client IP addresses.
  - **Referrers:** Top domains linking to your services.
  - **Paths:** Most requested URL paths.
  - **User Agents:** Breakdown of browsers and devices.
- **Recent Requests:** Detailed table of the latest requests with method, status, path, IP, and duration.
- **Database Statistics:** Real-time database metrics including:
  - **Database Size:** Current size of the application database.
  - **Engine Type:** Shows SQLite, MySQL, or PostgreSQL.
  - **Connections:** Number of active database connections.
  - **Read/Write I/O:** Cumulative read and write operations:
    - **SQLite:** Uses `PRAGMA cache_stats` (if available).
    - **MySQL:** Uses `Handler_read_rnd_next` and `Handler_write` status variables.
    - **PostgreSQL:** Uses `blks_read`, `blks_hit`, and tuple statistics from `pg_stat_database`.

## Privacy

The analytics feature is designed with privacy in mind:

- **No Third-Party Cookies:** Everything is stored locally in your database.
- **Data Retention:** Logs are automatically rotated to manage database size.
- **Anonymization:** _(Future feature)_ IP anonymization settings are planned.

## Durable ingestion

The built-in backend tails `/data/nginx/json_access.log` and appends normalized records to a durable NDJSON spool
before database aggregation. Each append is synchronized to storage. Startup replay uses bounded batches and a database
ledger so that a crash between database commit and spool compaction does not count the same event twice. Detailed rows,
time buckets and the ledger entry commit in one transaction; only then can the spool checkpoint advance.

| Variable                           | Default                                 | Purpose                                       |
| :--------------------------------- | :-------------------------------------- | :-------------------------------------------- |
| `ANALYTICS_SPOOL_PATH`             | `/data/shieldpm/analytics-spool.ndjson` | Normalized absolute spool path below `/data/` |
| `ANALYTICS_SPOOL_MAX_BYTES`        | `67108864`                              | Total spool capacity                          |
| `ANALYTICS_SPOOL_RECORD_MAX_BYTES` | `262144`                                | Per-record safety limit                       |
| `ANALYTICS_SPOOL_BATCH_RECORDS`    | `250`                                   | Maximum records in one replay transaction     |

During a graceful shutdown ShieldPM stops accepting new work, drains all pending analytics batches and closes the
spool. Capacity and record limits fail closed. Monitor application logs and available disk space; do not delete or edit
the spool while the service is running.

## Configuration

Analytics are enabled by default. No additional configuration is required for the basic functionality.

### Enabling GeoIP (Country Statistics)

To enable the country breakdown in the analytics dashboard, you need to provide MaxMind GeoIP databases and enable the Nginx module.

#### 1. Configure GeoIP Update

**🐳 Docker:** Uncomment the `geoipupdate` service in your `compose.yaml`. You will need a free account from [MaxMind](https://www.maxmind.com/en/geolite2/signup).

```yaml
geoipupdate:
  container_name: shieldpm-geoipupdate
  image: ghcr.io/maxmind/geoipupdate:latest
  restart: always
  network_mode: bridge
  environment:
    - "TZ=Europe/Berlin"
    - "GEOIPUPDATE_EDITION_IDS=GeoLite2-Country GeoLite2-City" # GeoLite2-ASN is optional
    - "GEOIPUPDATE_ACCOUNT_ID=<your-account-id>"
    - "GEOIPUPDATE_LICENSE_KEY=<your-license-key>"
    - "GEOIPUPDATE_FREQUENCY=24"
  volumes:
    - "/opt/shieldpm/nginx:/usr/share/GeoIP"
```

> [!IMPORTANT]
> The volume path must be `/opt/shieldpm/nginx` on the host side, as this maps to `/data/nginx` inside the ShieldPM container, which is where Nginx expects the files.

**📦 Native / LXC:** The installer offers GeoIP as an optional step (`Install GeoIP Update? [y/N]`). For manual setup:

```bash
apt install -y geoipupdate
cat > /etc/GeoIP.conf << EOF
AccountID <your-account-id>
LicenseKey <your-license-key>
EditionIDs GeoLite2-Country GeoLite2-City GeoLite2-ASN
DatabaseDirectory /data/nginx
EOF
geoipupdate
# Setup weekly cron
echo "0 3 * * 3 root /usr/bin/geoipupdate > /dev/null 2>&1" > /etc/cron.d/geoipupdate
```

#### 2. Enable Nginx Module

Set `NGINX_LOAD_GEOIP2_MODULE=true`:

```yaml
# Docker (compose.yaml)
environment:
  - "NGINX_LOAD_GEOIP2_MODULE=true"
```

```bash
# Native / LXC (/data/.env)
NGINX_LOAD_GEOIP2_MODULE=true
```

#### 3. Restart

```bash
# Docker
docker compose up -d

# Native / LXC
systemctl restart shieldpm
```

Once restarted, Nginx will load the GeoIP database, and new requests will be tagged with their country code.
