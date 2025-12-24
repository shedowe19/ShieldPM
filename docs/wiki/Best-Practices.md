# Best Practices

Ensure your NPMplus installation is secure, reliable, and performant.

## 🛡️ Security Hardening

### Headers
Security headers add an extra layer of protection for your clients.
*   **HSTS:** Enable `NGINX_HSTS_SUBDOMAINS=true` in `compose.yaml` to enforce HTTPS on all subdomains.
*   **X-Frame-Options:** Defaults to `sameorigin`. Only change this if you need to embed your site in an iframe.

### Isolation
*   **Container Network:** Avoid using `network_mode: host` unless necessary for performance or complex networking. Using a bridge network isolates NPMplus from the host system.
*   **Database:** Use a separate container for MySQL/Postgres rather than the embedded SQLite for better scalability in production.

## 💾 Backup Strategy

You should regularly backup the following data:

1.  **`/data` Directory:** Contains your database (`database.sqlite`), configuration files, and keys.
2.  **`/etc/letsencrypt` (if mounted):** Contains your certificates. *Note:* In standard NPMplus setups, certs are often inside `/data/tls` or `letsencrypt` within the data volume.

**Restoring:**
Simply mount your backup folders to a fresh NPMplus container. The application is stateless aside from these directories.

## 🚀 Performance

### HTTP/3 (QUIC)
Enable **HTTP/3** to improve performance, especially for mobile clients or on high-latency networks.
*   Ensure UDP port 443 is exposed and allowed through your firewall.

### Caching
For static sites (blogs, landing pages), enable **Cache Assets** in the Proxy Host configuration. This serves images and CSS directly from Nginx memory/disk, reducing load on your backend.

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/NPMplus/issues)
