# WireGuard Tunnels (ShieldTunnel)

ShieldPM includes a built-in **WireGuard VPN Server** that allows you to securely expose services running behind restricted networks (CGNAT, DS-Lite, no port forwarding) through your ShieldPM VPS.

## 🚇 How It Works

The concept is simple: ShieldPM acts as a WireGuard server on your cloud VPS (with a public IP). Your home server connects to it as a WireGuard peer and receives a private tunnel IP. You then create Nginx proxy hosts that route traffic to the tunnel IP.

```
  ┌──────────────────┐     ┌──────────────────────────────────────┐
  │   Browser/User   │────▶│         ShieldPM VPS (Cloud)         │
  │   (Internet)     │     │                                      │
  └──────────────────┘     │  ┌──────────────────────────────┐    │
                           │  │   Nginx Reverse Proxy        │    │
                           │  │   nextcloud.example.com      │    │
                           │  │   → http://10.8.0.2:8080     │    │
                           │  └─────────────┬────────────────┘    │
                           │                │                     │
                           │  ┌─────────────▼────────────────┐    │
                           │  │   WireGuard Server (wg0)     │    │
                           │  │   10.8.0.1/24 :51820/udp     │    │
                           │  └─────────────┬────────────────┘    │
                           └────────────────┼─────────────────────┘
                                            │ Encrypted WG Tunnel
                           ┌────────────────▼─────────────────────┐
                           │       Home Server (behind CGNAT)     │
                           │                                      │
                           │  ┌──────────────────────────────┐    │
                           │  │   WireGuard Client (wg0)     │    │
                           │  │   10.8.0.2/32                │    │
                           │  └─────────────┬────────────────┘    │
                           │                │                     │
                           │  ┌─────────────▼────────────────┐    │
                           │  │   Docker Containers          │    │
                           │  │   Nextcloud (:8080)          │    │
                           │  │   Home Assistant (:8123)     │    │
                           │  └──────────────────────────────┘    │
                           └──────────────────────────────────────┘
```

**Key Benefits:**

* **No port forwarding required** — Your home server connects *outbound* to the VPS.
* **Works behind CGNAT/DS-Lite** — No public IP needed at home.
* **Full Nginx features** — WAF, Access Lists, SSL, Caching still work.
* **Self-hosted** — No dependency on Cloudflare, Tailscale, or third parties.

## 📋 Prerequisites

### Docker Deployment

Your `compose.yaml` needs these additions:

```yaml
services:
  shieldpm:
    # ... existing config ...
    cap_add:
      - NET_ADMIN
      - NET_RAW
    sysctls:
      net.ipv4.ip_forward: 1
      net.ipv4.conf.all.src_valid_mark: 1
    devices:
      - /dev/net/tun:/dev/net/tun
```

### Native / LXC Deployment

Ensure `wireguard-tools` is installed and the kernel has WireGuard support:

```bash
apt install wireguard-tools
# Verify
modprobe wireguard
wg --version
```

## ⚙️ Configuration

WireGuard settings are configured **directly in the ShieldPM UI** — no environment variables needed.

### Step 1: Configure Server Settings

1. Navigate to **Hosts → WireGuard Tunnels** in the sidebar.
2. In the **WireGuard Settings** card, click **Edit**.
3. Configure:
   - **Server Endpoint**: Your VPS domain or public IP (e.g., `vpn.example.com` or `203.0.113.10`)
   - **Listen Port**: UDP port for WireGuard (default: `51820`)
   - **VPN Subnet**: Internal tunnel network (default: `10.8.0.0/24`)
4. Click **Save**.

> ⚠️ **Important**: You **must** set the Server Endpoint before creating peers. Without it, generated client configs won't have a valid endpoint address.

### Step 2: Create a Peer

1. Click **Add Peer**.
2. Fill in:
   - **Peer Name**: A friendly identifier (e.g., `Home Raspberry Pi`)
   - **Description** *(optional)*: What services run on this peer
   - **Allowed IPs**: Default `10.8.0.0/24` (tunnel-only traffic). Use `0.0.0.0/0, ::/0` for full VPN mode.
   - **Keepalive**: `25` seconds (recommended for NAT traversal)
   - **DNS**: `1.1.1.1` or your preferred DNS
3. Click **Save**.

### Step 3: Install the Config on Your Home Server

After creating a peer, ShieldPM will show you the client configuration:

- **Download** the `.conf` file
- **Scan** the QR code with the WireGuard mobile app
- **Copy** the config text

Install on your home server:

```bash
# Copy the downloaded file
sudo cp wg-peer.conf /etc/wireguard/wg0.conf

# Start WireGuard
sudo wg-quick up wg0

# Enable auto-start on boot
sudo systemctl enable wg-quick@wg0
```

### Step 4: Create a Proxy Host

1. Go to **Hosts → Proxy Hosts** → **Add Proxy Host**.
2. Configure:
   - **Domain**: `nextcloud.example.com`
   - **Forward Hostname/IP**: `10.8.0.2` (the tunnel IP assigned to your peer)
   - **Forward Port**: `8080` (the port of your service)
3. **Save** and optionally add an SSL certificate.

Your home service is now securely accessible via `https://nextcloud.example.com`! 🎉

## 🔧 Settings Reference

| Setting | Default | Description |
|---------|---------|-------------|
| **Server Endpoint** | *(empty)* | Domain or IP clients connect to. **Required.** |
| **Listen Port** | `51820` | UDP port for WireGuard traffic |
| **VPN Subnet** | `10.8.0.0/24` | Internal tunnel network. Server gets `.1`. |

## 🔐 Security

### Key Storage

- **Server keys** are stored in `/data/wireguard/server_private.key` (file-based)
- **Client private keys** are encrypted at rest using AES-256 in the database
- Keys are only decrypted when generating client configs

### Network Isolation

By default, peers can only reach the ShieldPM server (`10.8.0.1`) and services routed through Nginx. The `AllowedIPs = 10.8.0.0/24` setting restricts traffic to tunnel-only mode.

### Demo Mode

WireGuard Tunnels are **completely disabled** in Demo Mode. All write API endpoints return 403 errors.

## 📂 File Locations

| Path | Description |
|------|-------------|
| `/data/wireguard/` | WireGuard data directory |
| `/data/wireguard/server_private.key` | Server private key |
| `/data/wireguard/server_public.key` | Server public key |
| `/data/wireguard/wg0.conf` | Generated WireGuard config |

## 🔄 Peer Lifecycle

### Creating a Peer

1. A new key pair (client private + public key) is generated
2. A preshared key is generated for additional security
3. The next available IP in the subnet is assigned
4. The WireGuard interface is automatically updated

### Enabling/Disabling

- **Disable**: Removes the peer from the active WireGuard config (tunnel stops)
- **Enable**: Re-adds the peer to the config (tunnel resumes)
- The peer's keys and IP are preserved

### Deleting

- The peer is permanently removed from the database
- Its IP address becomes available for new peers
- The client config becomes invalid

## 🛠️ Troubleshooting

### WireGuard Not Available

If you see "Unavailable" in the server status:

1. Check if `wg` CLI is available:

   ```bash
   # Docker
   docker exec shieldpm wg --version

   # Native / LXC
   wg --version
   ```

2. Verify the container has `NET_ADMIN` capability
3. Check if `/dev/net/tun` is accessible

### Peer Shows "Waiting" Instead of "Online"

- The peer config hasn't connected yet, or there's a firewall blocking UDP on the listen port
- Ensure port `51820/udp` (or your custom port) is open on the VPS firewall
- Check client-side: `sudo wg show` should show a recent handshake

### Can't Reach Services Through the Tunnel

1. Verify the tunnel is up: `ping 10.8.0.1` from the home server
2. Check IP forwarding: `cat /proc/sys/net/ipv4/ip_forward` should be `1`
3. Verify the proxy host is configured with the correct tunnel IP and port
4. Check Docker container networking on the home server

### Peer IP Conflict

If you're migrating from a different WireGuard setup, ensure the subnet doesn't overlap with existing networks. Change the **VPN Subnet** in settings before creating peers.

## ⚖️ Comparison with Other Tunnel Solutions

| Feature | ShieldTunnel (WireGuard) | Cloudflare Tunnels | Tor Onion Services |
|---------|:------------------------:|:------------------:|:------------------:|
| Self-hosted | ✅ | ❌ (Cloudflare) | ✅ |
| Speed | ⚡ Very fast | 🔵 Fast | 🐢 Slow |
| Latency | ~1ms overhead | ~10-50ms overhead | ~200-500ms |
| CGNAT bypass | ✅ | ✅ | ✅ |
| Open ports needed | UDP (VPS) | None | None |
| DDoS protection | ❌ (manual) | ✅ (built-in) | ✅ (Tor) |
| Privacy | 🟡 VPS IP visible | 🟡 CF sees traffic | ✅ Full anonymity |
| Protocol | UDP (WireGuard) | QUIC (HTTP/2) | TCP (Tor circuits) |

---
[🏠 Home](Home) | [☁️ Cloudflare Tunnels](Cloudflared-Tunnels) | [🧅 Tor Onion Services](Tor-Onion-Services) | [🔒 Security](Security)
