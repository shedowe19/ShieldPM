# IPv6 Configuration

NPMplus fully supports IPv6, but Docker's IPv6 handling can be tricky.

## 🐳 Docker & IPv6

By default, Docker containers **do not** have IPv6 connectivity, and the bridge network is IPv4 only.

### Network Mode: Host
If you use `network_mode: host`, NPMplus shares the network stack of your host server.
*   **Pros:** IPv6 works out of the box (if your server has it). No port mapping needed.
*   **Cons:** No network isolation.

### Network Mode: Bridge (Requires Setup)
To use IPv6 with a bridge network:
1.  **Enable IPv6 in Docker Daemon:** Create/Edit `/etc/docker/daemon.json`:
    ```json
    {
      "ipv6": true,
      "fixed-cidr-v6": "2001:db8:1::/64"
    }
    ```
2.  **Enable in Compose:**
    ```yaml
    networks:
      default:
        enable_ipv6: true
        ipam:
          config:
            - subnet: 2001:db8:1::/64
    ```

## ⚙️ NPMplus Settings

Control how NPMplus listens on IPv6 via `compose.yaml`:

*   **`IPV6_BINDING=[::1]`**: Bind to a specific address.
*   **`DISABLE_IPV6=true`**: Completely disable IPv6 listeners. Use this if your environment explicitly does not support IPv6 to avoid "Address family not supported by protocol" errors.

## ⚠️ Common Issues

*   **"Host not found" / 502 Bad Gateway:** If your backend resolves to an IPv6 address but Docker doesn't support it, Nginx might try to connect via IPv6 and fail.
    *   *Fix:* Use the IPv4 address of the backend or fix Docker IPv6.
