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
> Streams forward TCP connections or UDP datagrams through Nginx's stream module. They do not offer HTTP WAF, access lists, or caching. Optional TLS termination and PROXY protocol forwarding **do** modify how a connection is handled. For HTTP-based services, use [Proxy Hosts](./Proxy-Hosts.md).

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
| **Incoming Port** | The port ShieldPM listens on. An overlapping Stream using the same transport (TCP or UDP) is rejected; your chosen port must also be available on the host. |
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

1. For a TCP stream, select an existing certificate or request a new one. New certificates require domain names for issuance; Stream hosts do not store those domain names.
2. The TCP listener then terminates incoming TLS and forwards the decrypted TCP stream to the backend. UDP listeners do not use the certificate.

### Notes Tab

Use the Notes field to add internal documentation for this stream (e.g., "Minecraft Server - Living Room PC"). Notes are visible in the management UI to people with permission to view the stream.

> [!TIP]
> The note is shown prominently when opening the stream's edit dialog; it does not require a special prefix.

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
## Related pages

- [Home](./Home.md)
- [Proxy Hosts](./Proxy-Hosts.md)
