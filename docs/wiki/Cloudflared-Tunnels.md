# Cloudflare Tunnels

ShieldPM includes native integration for managing **Cloudflare Tunnels**. This allows you to securely expose your locally running services to the internet without opening public inbound ports on your firewall.

## 🚀 Introduction

Cloudflare Tunnel (formerly Argo Tunnel) creates a secure, encrypted link between your ShieldPM instance and the Cloudflare edge network.

**Key Benefits:**

- **No Inbound Ports:** You don't need to open port 80 or 443 on your router.
- **DDoS Protection:** Traffic passes through Cloudflare's filtering before reaching your server.
- **Static IP Bypass:** Works even behind CGNAT (Carrier-Grade NAT) or dynamic IPs.

## 🏗️ Architecture

```
  ┌──────────┐     ┌──────────────────┐     ┌──────────────────────────────┐
  │  Browser  │────▶│  Cloudflare Edge │────▶│         ShieldPM             │
  │  (User)   │◀────│  (DDoS Filter,   │     │                              │
  └──────────┘     │   TLS Termination)│     │  ┌────────────────────────┐  │
                   └──────────────────┘     │  │  cloudflared (Tunnel)  │  │
        Internet ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─▶│  Receives traffic via  │  │
                      │  QUIC Tunnel        │  │  encrypted QUIC tunnel │  │
                      │  (outbound only,    │  └──────────┬─────────────┘  │
                      │   no open ports!)   │             │                │
                                            │             ▼                │
                                            │  ┌────────────────────────┐  │
                                            │  │   Nginx (Port 443)     │  │
                                            │  │  SSL, WAF, AccessList  │  │
                                            │  └──────────┬─────────────┘  │
                                            └─────────────┼────────────────┘
                                                          ▼
                                            ┌────────────────────────┐
                                            │    Backend Service     │
                                            │  (192.168.1.50:8080)   │
                                            └────────────────────────┘
```

**Key Points:**

- `cloudflared` creates an **outbound-only** connection — no ports need to be opened on your firewall
- Traffic is encrypted end-to-end via QUIC protocol
- ShieldPM manages the `cloudflared` process lifecycle automatically
- All Nginx features (Access Lists, WAF, Caching) still work normally

---

## ⚙️ Configuration

### 1. Prerequisites

- A **Cloudflare Account**.
- A domain managed by Cloudflare DNS.
- **ShieldPM** running (Docker, Native, or LXC).

### 2. Create a Tunnel (Cloudflare Dashboard)

1. Go to the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. Navigate to **Access** > **Tunnels**.
3. Click **Create a tunnel**.
4. Choose **Cloudflared** as the connector type.
5. Give your tunnel a name (e.g., `shieldpm-home`) and click **Save**.
6. **Copy the Tunnel Token**. You will see a command like `cloudflared service install eyJhIjoi...`. Copy **only** the token string starting with `ey...`.

### 3. Add Tunnel in ShieldPM

1. Open your ShieldPM Admin Interface.
2. Navigate to the **Cloudflare Tunnel** tab (Cloud icon).
3. Click **Add Tunnel**.
4. **Name:** Enter a friendly name for this tunnel (e.g., `Home Server`).
5. **Tunnel Token:** Paste the token you copied in Step 2.
6. Click **Save**.

ShieldPM will automatically start a dedicated `cloudflared` process for this tunnel. The status badge should turn **Green (Online)** within a few seconds.

---

## 🌐 Exposing Services

Once your tunnel is online, you can use it to expose services via **Proxy Hosts**.

1. In the Cloudflare Dashboard:
   - Go to your Tunnel > **Public Hostname**.
   - Add a public hostname (e.g., `app.example.com`).
   - **Service**: pointing to your ShieldPM instance.
     - Type: `HTTP`
     - URL: `localhost:80` (or the internal IP of your ShieldPM container).

2. In ShieldPM:
   - Create a **Proxy Host** for `app.example.com`.
   - Forward to your internal service (e.g., `192.168.1.50:8080`).

**Note:** The traffic flow is:
`User` -> `Cloudflare Edge` -> `Cloudflared (in ShieldPM)` -> `Nginx (in ShieldPM)` -> `Your Backend Service`.

This allows you to still use Nginx features like Access Lists, ModSecurity, and Caching even when using Tunnels.

---

## � Advanced: HTTPS & mTLS

### Using HTTPS Backends

If you want the connection between Cloudflare and ShieldPM to be encrypted (HTTPS), follow these steps:

1. In Cloudflare Dashboard (Public Hostname), set **Service Type** to `HTTPS` and URL to `localhost:443`.
2. Under **Additional application settings** > **TLS**:
   - Enable **No TLS Verify**. This is required because ShieldPM uses self-signed or internal certificates for localhost, which Cloudflare cannot verify by default.
3. In ShieldPM Proxy Host:
   - Ensure **Scheme** is `https`.
   - **SSL Certificate:** You can use "None" (fallback to default) or a self-signed cert, as Cloudflare is the only client.

### Integration with Internal PKI & mTLS

ShieldPM includes a powerful **Internal Public Key Infrastructure (PKI)** and **Mutual TLS (mTLS)** feature. However, using this with Cloudflare Tunnels requires understanding how traffic is handled.

**The Limitation:**
Cloudflare Tunnel (in HTTP mode) terminates the SSL connection at the Cloudflare Edge. This means the client (visitor) performs the TLS handshake with Cloudflare, not with ShieldPM.

- **Result:** Nginx **cannot** request a Client Certificate from the visitor because the connection it sees comes from `cloudflared` (localhost).
- **Impact:** If you enable "mTLS" in an Access List on a host served via Tunnel, visitors will get a 400 Bad Request or 403 Forbidden because they cannot present a certificate to Nginx.

**Recommended Solutions:**

1. **Use Cloudflare Access (mTLS):** Configure mTLS enforcement in the Cloudflare Zero Trust dashboard. Cloudflare will validate the client certificate at the edge and then forward the request to your tunnel.
2. **Use Internal CA for Backend Security:** You can still use the ShieldPM Internal CA to issue certificates for your backend services (the apps ShieldPM points to).
3. **For pure mTLS (End-to-End):** You would need to use Cloudflare Tunnel in **TCP Mode** (arbitrary TCP logging), which passes the raw encrypted packets to Nginx. Note that this bypasses Cloudflare's WAF and requires `cloudflared` on the client side or specific enterprise setups.

---

## �🛠️ Troubleshooting

- **Status stays Offline:** Check your internet connection and ensuring the provided token is correct. Check the container logs `docker logs shieldpm` for `cloudflared` errors.
- **Maintenance:** If you delete a tunnel in ShieldPM, the process is stopped immediately.

---

## 🔒 Security Best Practices

- **Do not proxy the Tunnel through Nginx again:** Cloudflared handles the connection.
- **Use Access Lists:** You can still apply ShieldPM Access Lists to Proxy Hosts served via the tunnel for an extra layer of security.
