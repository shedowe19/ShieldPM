# IPv6 Configuration

ShieldPM can listen on IPv6 and reach IPv6 upstreams when the host or container has working IPv6 networking. Listener settings do not provision IPv6 connectivity by themselves.

---

## 🏗️ Architecture

```
                    IPv4 + IPv6
  ┌──────────┐    ┌──────────────┐    ┌──────────────┐
  │  Client   │───▶│  ShieldPM    │───▶│  Backend     │
  │  (v4/v6)  │    │  (Nginx)     │    │  Service     │
  └──────────┘    └──────────────┘    └──────────────┘
                   Listens on:          Can connect via:
                   0.0.0.0 (IPv4)       IPv4 address
                   [::] (IPv6)          IPv6 address
                                        Hostname (dual-stack)
```

---

## 🐳 Docker & IPv6

IPv6 availability in a Docker container depends on the Docker daemon, its networks, and the host's routing. Check the actual network configuration before using an IPv6 upstream.

### Option 1: Host Network Mode (Easiest)

If you use `network_mode: host`, ShieldPM shares the host's network stack:

```yaml
services:
  shieldpm:
    image: "ghcr.io/shedowe19/shieldpm:develop"
    network_mode: host
```

| Pros                                                      | Cons                                              |
| :-------------------------------------------------------- | :------------------------------------------------ |
| ✅ Uses the host's existing IPv6 connectivity and routing | ⚠️ No network isolation                           |
| ✅ Real client IPs visible                                | ⚠️ No port mapping (use env vars to change ports) |
| ✅ No separate Docker IPv6 network needed                 |                                                   |

### Option 2: Bridge Network with IPv6 (Recommended for Security)

To use IPv6 with a bridge network, you need to enable IPv6 in Docker **and** your compose file:

**Step 1:** Enable IPv6 in Docker Daemon — edit `/etc/docker/daemon.json`:

```json
{
  "ipv6": true,
  "fixed-cidr-v6": "fd00:dead:beef::/48",
  "ip6tables": true
}
```

**Step 2:** Restart Docker:

```bash
sudo systemctl restart docker
```

**Step 3:** Enable IPv6 in your `compose.yaml`:

```yaml
services:
  shieldpm:
    image: "ghcr.io/shedowe19/shieldpm:develop"
    ports:
      - "80:80"
      - "81:81"
      - "443:443"
      - "443:443/udp"
    networks:
      - shieldpm

networks:
  shieldpm:
    enable_ipv6: true
    ipam:
      config:
        - subnet: fd00:dead:beef:1::/64
```

> [!IMPORTANT]
> Use a **unique local address (ULA)** prefix like `fd00:` for Docker internal networks, not public IPv6 prefixes.

The ULA in this example is for container-to-container connectivity. To serve external IPv6 clients, the Docker host must have a reachable IPv6 address and an appropriate published listener/firewall path; to reach external IPv6 upstreams, the container needs a working route. Publishing a port and adding a ULA alone do not establish public IPv6 routing.

---

## 📦 Native / LXC & IPv6

Native and LXC installations use their own network stack directly. With a working IPv6 address and `DISABLE_IPV6=false`, ShieldPM listens on both IPv4 and IPv6.

**Proxmox LXC users:** Ensure your container has an IPv6 address assigned in the network configuration.

---

## ⚙️ ShieldPM Settings

Control how ShieldPM listens on IPv6 via `compose.yaml` or `/data/.env`:

| Variable           | Description                                                                                 | Default      |
| :----------------- | :------------------------------------------------------------------------------------------ | :----------- |
| `IPV6_BINDING`     | Bind to a specific IPv6 address                                                             | `[::]` (all) |
| `NPM_IPV6_BINDING` | Bind Admin UI to specific IPv6 address                                                      | `[::]` (all) |
| `GOA_IPV6_BINDING` | Bind Analytics to specific IPv6 address                                                     | `[::]` (all) |
| `DISABLE_IPV6`     | Disable the generated Nginx IPv6 listeners, including hosts, streams, admin UI and GoAccess | `false`      |

> [!TIP]
> Set `DISABLE_IPV6=true` if the environment cannot bind IPv6 listeners. This does not disable IPv6 DNS answers or fix outbound IPv6 routing to upstreams.

---

## ❓ Troubleshooting

### "Address family not supported by protocol"

The Nginx process cannot create the configured IPv6 listener in this environment.

**Fix:** Set `DISABLE_IPV6=true` in your environment.

### 502 Bad Gateway with IPv6 backends

Nginx resolved your backend hostname to an IPv6 address, but can't reach it via IPv6.

**Fix:**

- Use the explicit IPv4 address instead of the hostname (e.g., `192.168.1.50` instead of `myserver.local`)
- Or fix IPv6 connectivity in your Docker network (see above)

### "Host not found in upstream"

DNS resolution returned an IPv6 address that Docker can't route.

**Fix:** Use the container name or IPv4 address as the upstream target.

---

## Related pages

- [Home](./Home.md)
- [Proxy Hosts](./Proxy-Hosts.md)
