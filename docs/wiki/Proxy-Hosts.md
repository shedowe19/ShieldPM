# Proxy Hosts

Proxy Hosts are the core feature of NPMplus. They define how incoming traffic for a specific domain is forwarded to your internal services.

## 📝 Configuration Fields

### Domain Names
Usage: `example.com`, `app.example.com`.
The domain names that this proxy host will respond to. You can specify multiple domains by separating them with a comma or pressing Enter.

### Scheme, Forward Host, Forward Port
*   **Scheme:** The protocol used to talk to the *internal* service (`http` or `https`).
*   **Forward Host:** The IP address or hostname of your internal service (e.g., `192.168.1.50` or a container name like `nextcloud`).
    *   *Tip:* If using `network_mode: host` for NPMplus, use `127.0.0.1` to access services on the same machine running on host ports.
    *   *Tip:* If using Docker networks, use the container name.
*   **Forward Port:** The port your internal service is listening on (e.g., `8080`).

### Options
*   **Cache Assets:** Enables simple Nginx asset caching. Useful for static sites.
*   **Block Common Exploits:** Blocks common attack patterns (SQL injection, XSS) using basic Nginx rules.
*   **Websockets Support:** Enables upgrade headers for Websocket connections. **Required** for many modern apps (Home Assistant, Nextcloud, etc.).

## 📂 Locations

Locations allow you to map specific URL paths to different backend services or configurations.

*   **Path:** The URL path (e.g., `/api`).
*   **Forward Host/Port:** Can be different from the main host.
*   **Custom Config:** You can add specific Nginx directives just for this location.

## 🛠️ Custom Nginx Configuration

In the "Advanced" tab, you can write raw Nginx config codes.

### Examples

**Increase Upload Limit:**
```nginx
client_max_body_size 10G;
```

**Custom Headers:**
```nginx
proxy_set_header X-Custom-Header "MyValue";
```
