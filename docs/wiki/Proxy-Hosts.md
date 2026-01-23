# Proxy Hosts

Proxy Hosts are the core feature of ShieldPM. They define how incoming traffic for a specific domain is forwarded to your internal services.

## 📝 Configuration Fields

### Domain Names
Usage: `example.com`, `app.example.com`.
The domain names that this proxy host will respond to. You can specify multiple domains by separating them with a comma or pressing Enter.

### Scheme, Forward Host, Forward Port
*   **Scheme:** The protocol used to talk to the *internal* service (`http` or `https`).
* 4.  **Forward Host / IP:** The address of the backend service (e.g., `127.0.0.1`, `192.168.1.50`, or a container name).
5.  **Forward Port:** The port the service is listening on (e.g., `8080`, `3000`, `22`).
6.  **Forward Scheme:**
    *   `http`: Standard web traffic.
    *   `https`: Secure web traffic (backend handles SSL).
    *   `terminal`: SSH Gateway (Web Terminal).
    *   `grpc` / `grpcs`: gRPC traffic.
    *   `path`: Serve static files or PHP (internal).

### Terminal Scheme (SSH)
If you select **terminal** as the scheme, additional fields will appear to configure the SSH connection:
*   **Terminal Host:** The SSH server address (usually same as Forward Host).
*   **Terminal Port:** The SSH port (default `22`).
*   **Username:** SSH username (e.g., `root`).
*   **Auth Type:** Password or Private Key.
    *   **Password:** Securely encrypted.
    *   **Private Key:** Paste your PEM-formatted private key (encrypted at rest).

To access the terminal, click the **three dots** menu on the specific host in the dashboard and select **Connect**. This will open a secure WebSocket terminal in a new tab.

## 🔒 SSL/TLS (HTTPS)
*   **Forward Host:** The IP address or hostname of your internal service (e.g., `192.168.1.50` or a container name like `nextcloud`).
    *   *Tip:* If using `network_mode: host` for ShieldPM, use `127.0.0.1` to access services on the same machine running on host ports.
    *   *Tip:* If using Docker networks, use the container name.
*   **Forward Port:** The port your internal service is listening on (e.g., `8080`).

### Options
*   **Cache Assets:** Enables simple Nginx asset caching. Useful for static sites.
*   **Block Common Exploits:** Blocks common attack patterns (SQL injection, XSS) using basic Nginx rules.
*   **Websockets Support:** Enables upgrade headers for Websocket connections. **Required** for many modern apps (Home Assistant, Nextcloud, etc.).

### Advanced Features
*   **Bandwidth Limit:** Dynamically throttles the bandwidth for clients.
    *   *Usage:* Enter a value like `100k` (Kilobytes/s) or `1m` (Megabytes/s).
    *   *Logic:* ShieldPM uses dynamic damping. It allows bursts initially but slows down long downloads to the specified rate.
*   **Forward Query:** Allows you to append additional query parameters to every request forwarded to the backend.
    *   *Usage:* `foo=bar&baz=1`. Nginx appends this to the upstream request URL.
    *   *Note:* Standard query parameters from the client are always forwarded. This field is for *injecting* extra ones.

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

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
