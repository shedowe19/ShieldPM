# Cloudflare Tunnels

NPMplus includes native integration for managing **Cloudflare Tunnels**. This allows you to securely expose your locally running services to the internet without opening public inbound ports on your firewall.

## 🚀 Introduction

Cloudflare Tunnel (formerly Argo Tunnel) creates a secure, encrypted link between your NPMplus instance and the Cloudflare edge network.

**Key Benefits:**
*   **No Inbound Ports:** You don't need to open port 80 or 443 on your router.
*   **DDoS Protection:** Traffic passes through Cloudflare's filtering before reaching your server.
*   **Static IP Bypass:** Works even behind CGNAT (Carrier-Grade NAT) or dynamic IPs.

---

## ⚙️ Configuration

### 1. Prerequisites
*   A **Cloudflare Account**.
*   A domain managed by Cloudflare DNS.
*   **NPMplus** running in Docker.

### 2. Create a Tunnel (Cloudflare Dashboard)
1.  Go to the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2.  Navigate to **Access** > **Tunnels**.
3.  Click **Create a tunnel**.
4.  Choose **Cloudflared** as the connector type.
5.  Give your tunnel a name (e.g., `npmplus-home`) and click **Save**.
6.  **Copy the Tunnel Token**. You will see a command like `cloudflared service install eyJhIjoi...`. Copy **only** the token string starting with `ey...`.

### 3. Add Tunnel in NPMplus
1.  Open your NPMplus Admin Interface.
2.  Navigate to the **Cloudflare Tunnel** tab (Cloud icon).
3.  Click **Add Tunnel**.
4.  **Name:** Enter a friendly name for this tunnel (e.g., `Home Server`).
5.  **Tunnel Token:** Paste the token you copied in Step 2.
6.  Click **Save**.

NPMplus will automatically start a dedicated `cloudflared` process for this tunnel. The status badge should turn **Green (Online)** within a few seconds.

---

## 🌐 Exposing Services

Once your tunnel is online, you can use it to expose services via **Proxy Hosts**.

1.  In the Cloudflare Dashboard:
    *   Go to your Tunnel > **Public Hostname**.
    *   Add a public hostname (e.g., `app.example.com`).
    *   **Service**: pointing to your NPMplus instance.
        *   Type: `HTTP`
        *   URL: `localhost:80` (or the internal IP of your NPMplus container).

2.  In NPMplus:
    *   Create a **Proxy Host** for `app.example.com`.
    *   Forward to your internal service (e.g., `192.168.1.50:8080`).

**Note:** The traffic flow is:
`User` -> `Cloudflare Edge` -> `Cloudflared (in NPMplus)` -> `Nginx (in NPMplus)` -> `Your Backend Service`.

This allows you to still use Nginx features like Access Lists, ModSecurity, and Caching even when using Tunnels.

---

## 🛠️ Troubleshooting

*   **Status stays Offline:** Check your internet connection and ensuring the provided token is correct. Check the container logs `docker logs npmplus` for `cloudflared` errors.
*   **Maintenance:** If you delete a tunnel in NPMplus, the process is stopped immediately.

---

## 🔒 Security Best Practices

*   **Do not proxy the Tunnel through Nginx again:** Cloudflared handles the connection.
*   **Use Access Lists:** You can still apply NPMplus Access Lists to Proxy Hosts served via the tunnel for an extra layer of security.
