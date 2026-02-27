# Stream Hosts (TCP/UDP)

Stream Hosts allow you to forward raw **TCP** and **UDP** traffic through ShieldPM. Unlike Proxy Hosts (which handle HTTP/HTTPS), Streams work at the transport layer and are ideal for non-HTTP services.

## 🏗️ Architecture

```
  ┌──────────┐                  ┌──────────────┐               ┌──────────────┐
  │  Client   │─── TCP/UDP ────▶│  ShieldPM     │─── TCP/UDP ──▶│  Your Service│
  │  (User)   │◀────────────────│  (Nginx)      │◀──────────────│  (Backend)   │
  └──────────┘                  └──────────────┘               └──────────────┘
     Port 25565                    Listens on                    192.168.1.100
     (Minecraft)                   Port 25565                    Port 25565
```

> [!NOTE]
> Streams **do not** inspect or modify the traffic — they simply forward the raw TCP/UDP packets. This means no WAF, no access lists, and no caching. For HTTP-based services, use [Proxy Hosts](Proxy-Hosts) instead.

## Use Cases

* **Game Servers:** Minecraft (`25565`), Valheim (`2456-2457`), Factorio (`34197`).
* **Database Access:** PostgreSQL (`5432`), MySQL (`3306`), Redis (`6379`).
* **VPN / WireGuard:** Forward WireGuard UDP (`51820`).
* **Mail Servers:** SMTP (`25`, `587`), IMAP (`993`).
* **Custom Protocols:** Any service that doesn't use HTTP.

## Configuration

1. Navigate to **Streams** in the sidebar.
2. Click **Add Stream**.

### Details Tab

| Field | Description |
| :--- | :--- |
| **Incoming Port** | The port ShieldPM listens on for this stream. Must be unique and not conflict with other hosts. |
| **Forwarding Host** | The IP or hostname of the backend service (e.g., `192.168.1.50`, `my-server`). |
| **Forwarding Port** | The port on the backend service. |
| **TCP** | Enable TCP forwarding (toggle). |
| **UDP** | Enable UDP forwarding (toggle). |

> [!IMPORTANT]
> **Port Mapping Required (Docker):** If using Docker, you must also expose the incoming port in your `compose.yaml`:
>
> ```yaml
> ports:
>   - "25565:25565"     # TCP
>   - "25565:25565/udp" # UDP
> ```
>
> For **Native / LXC** installations, ensure the port is not blocked by your firewall.

### SSL Tab

You can optionally assign an SSL certificate to a Stream for **TLS termination**. This is useful for encrypting connections to services that don't natively support TLS.

1. Select an existing certificate from the dropdown, or request a new one.
2. The stream will then accept TLS-encrypted connections on the incoming port and forward the decrypted traffic to the backend.

### Notes Tab

Use the Notes field to add internal documentation for this stream (e.g., "Minecraft Server - Living Room PC"). Notes are only visible to administrators.

> [!TIP]
> If the note starts with ⚠️ or contains a warning keyword, it will be highlighted in the stream list to draw attention.

## Example: Minecraft Server

1. **Incoming Port:** `25565`
2. **Forwarding Host:** `192.168.1.100`
3. **Forwarding Port:** `25565`
4. **TCP:** ✅ On
5. **UDP:** ❌ Off (Minecraft uses TCP)
6. **Docker `compose.yaml`:**

    ```yaml
    ports:
      - "25565:25565"
    ```

## Example: WireGuard VPN

1. **Incoming Port:** `51820`
2. **Forwarding Host:** `10.0.0.5`
3. **Forwarding Port:** `51820`
4. **TCP:** ❌ Off
5. **UDP:** ✅ On (WireGuard uses UDP only)
6. **Docker `compose.yaml`:**

    ```yaml
    ports:
      - "51820:51820/udp"
    ```

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
