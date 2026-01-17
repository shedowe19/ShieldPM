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
    *   **Read/Write I/O:** Cumulative read and write operations (available for MySQL/PostgreSQL).

## Privacy

The analytics feature is designed with privacy in mind:
*   **No Third-Party Cookies:** Everything is stored locally in your database.
*   **Data Retention:** Logs are automatically rotated to manage database size.
*   **Anonymization:** *(Future feature)* IP anonymization settings are planned.

## Configuration

Analytics are enabled by default. No additional configuration is required.
