# IPv6 Configuration

ShieldPM fully supports IPv6 for both incoming traffic and upstream connections. This guide explains how to configure IPv6 in different deployment environments.

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

By default, Docker containers **do not** have IPv6 connectivity. The standard bridge network is IPv4-only.

### Option 1: Host Network Mode (Easiest)

If you use `network_mode: host`, ShieldPM shares the host's network stack:

```yaml
services:
  app:
    image: "ghcr.io/shedowe19/shieldpm:latest"
    network_mode: host
```

| Pros                             | Cons                                              |
| :------------------------------- | :------------------------------------------------ |
| ✅ IPv6 works immediately        | ⚠️ No network isolation                           |
| ✅ Real client IPs visible       | ⚠️ No port mapping (use env vars to change ports) |
| ✅ No extra configuration needed |                                                   |

### Option 2: Bridge Network with IPv6 (Recommended for Security)

To use IPv6 with a bridge network, you need to enable IPv6 in Docker **and** your compose file:

**Step 1:** Enable IPv6 in Docker Daemon — edit `/etc/docker/daemon.json`:

```json
{
  "ipv6": true,
  "fixed-cidr-v6": "fd00:dead:beef::/48",
  "experimental": true,
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
  app:
    image: "ghcr.io/shedowe19/shieldpm:latest"
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

---

## 📦 Native / LXC & IPv6

Native and LXC installations use the host's network stack directly. If your server has IPv6, ShieldPM will automatically listen on both IPv4 and IPv6.

**Proxmox LXC users:** Ensure your container has an IPv6 address assigned in the network configuration.

---

## ⚙️ ShieldPM Settings

Control how ShieldPM listens on IPv6 via `compose.yaml` or `/data/.env`:

| Variable           | Description                             | Default      |
| :----------------- | :-------------------------------------- | :----------- |
| `IPV6_BINDING`     | Bind to a specific IPv6 address         | `[::]` (all) |
| `NPM_IPV6_BINDING` | Bind Admin UI to specific IPv6 address  | `[::]` (all) |
| `GOA_IPV6_BINDING` | Bind Analytics to specific IPv6 address | `[::]` (all) |
| `DISABLE_IPV6`     | Completely disable all IPv6 listeners   | `false`      |

> [!TIP]
> Set `DISABLE_IPV6=true` if your environment does not support IPv6. This prevents "Address family not supported by protocol" errors in the logs.

---

## ❓ Troubleshooting

### "Address family not supported by protocol"

Your system or Docker container doesn't have IPv6 support.

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

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
