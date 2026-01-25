# Advanced Analytics

ShieldPM includes a powerful, privacy-friendly analytics dashboard directly integrated into the interface. This feature provides real-time insights into your proxy traffic without relying on third-party services.

## Key Features

*   **Real-time Traffic Overview:** visualizes bandwidth usage and request counts.
*   **Requests Over Time:** Area chart showing traffic trends over the last 1h, 24h, 7d, or 30d.
*   **Status Codes:** Bar chart breakdown of HTTP response codes (2xx, 3xx, 4xx, 5xx).
*   **Top Lists:**
    *   **Countries:** GeoIP-based breakdown of traffic sources.
    *   **IPs:** Most frequent client IP addresses.
    *   **Referrers:** Top domains linking to your services.
    *   **Paths:** Most requested URL paths.
    *   **User Agents:** Breakdown of browsers and devices.
*   **Recent Requests:** Detailed table of the latest requests with method, status, path, IP, and duration.
*   **Database Statistics:** Real-time database metrics including:
    *   **Database Size:** Current size of the application database.
    *   **Engine Type:** Shows SQLite, MySQL, or PostgreSQL.
    *   **Connections:** Number of active database connections.
    *   **Read/Write I/O:** Cumulative read and write operations:
        *   **SQLite:** Uses `PRAGMA cache_stats` (if available).
        *   **MySQL:** Uses `Handler_read_rnd_next` and `Handler_write` status variables.
        *   **PostgreSQL:** Uses `blks_read`, `blks_hit`, and tuple statistics from `pg_stat_database`.

## Privacy

The analytics feature is designed with privacy in mind:
*   **No Third-Party Cookies:** Everything is stored locally in your database.
*   **Data Retention:** Logs are automatically rotated to manage database size.
*   **Anonymization:** *(Future feature)* IP anonymization settings are planned.

## Configuration

Analytics are enabled by default. No additional configuration is required for the basic functionality.

### Enabling GeoIP (Country Statistics)

To enable the country breakdown in the analytics dashboard, you need to provide MaxMind GeoIP databases and enable the Nginx module.

#### 1. Configure GeoIP Update
Uncomment the `geoipupdate` service in your `compose.yaml` and ensure the volume points to `/opt/shieldpm/nginx`. You will need a free account from [MaxMind](https://www.maxmind.com/en/geolite2/signup).

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

#### 2. Enable Nginx Module
In your `shieldpm` service environment variables, enable the GeoIP2 module:

```yaml
    environment:
      # ... other settings ...
      - "NGINX_LOAD_GEOIP2_MODULE=true"
```

#### 3. Restart
Restart your stack to apply the changes:
```bash
docker compose up -d
```
Once restarted, Nginx will load the GeoIP database, and new requests will be tagged with their country code.
