# Proxy Hosts

Proxy Hosts are the core feature of ShieldPM. They define how incoming traffic for a specific domain is forwarded to your internal services.

---

## 🏗️ How it Works

```
  ┌──────────┐                ┌──────────────┐               ┌──────────────┐
  │  Browser  │──── HTTPS ───▶│  ShieldPM     │──── HTTP ───▶│  Your App    │
  │  (User)   │◀──────────────│  (Nginx)      │◀─────────────│  (Backend)   │
  └──────────┘                └──────────────┘               └──────────────┘
       app.example.com           SSL Termination              192.168.1.50:3000
                                 WAF, Access Lists
                                 Caching, Rate Limiting
```

---

## 📝 Creating a Proxy Host

1. Navigate to **Proxy Hosts** in the sidebar
2. Click **Add Proxy Host**
3. Fill in the fields below and click **Save**

Before saving, you can inspect the proposed Nginx configuration with **Preview Nginx config** in the host form.

### Domain Names

Enter one or more domain names that this proxy host will respond to.

- Separate multiple domains with a comma or press Enter
- Wildcard domains are supported: `*.example.com`
- Example: `app.example.com`, `www.app.example.com`

### Forward Destination

| Field            | Description                           | Examples                                    |
| :--------------- | :------------------------------------ | :------------------------------------------ |
| **Scheme**       | Protocol used to talk to the backend  | `http`, `https`, `terminal`, `grpc`, `path` |
| **Forward Host** | IP or hostname of the backend service | `192.168.1.50`, `nextcloud`, `127.0.0.1`    |
| **Forward Port** | Port the service is listening on      | `8080`, `3000`, `443`                       |

> [!TIP]
>
> - **Docker bridge network:** Use the container name as Forward Host (e.g., `nextcloud`)
> - **Docker host network / Native:** Use `127.0.0.1` for services on the same machine
> - **Remote services:** Use the IP address of the remote machine

### Scheme Types

| Scheme           | Use Case                                               |
| :--------------- | :----------------------------------------------------- |
| `http`           | Standard web services (most common)                    |
| `https`          | Backend handles its own SSL (e.g., self-signed cert)   |
| `terminal`       | Web-based SSH terminal (see below)                     |
| `grpc` / `grpcs` | gRPC API services                                      |
| `path`           | Serve static files or PHP directly from the filesystem |

---

## Previewing the Nginx configuration

In the **Add Proxy Host** or **Edit Proxy Host** form, click **Preview Nginx config** to render the values currently in the form. Switch between **Changes from active config** and **Rendered config** to inspect the proposed directives. On an existing host, the changes are compared with its active configuration; a new host has no active configuration to compare. Edit the fields and click **Preview Nginx config** again to see an updated draft.

The preview hides known sensitive values. It does not save the host, issue a certificate, or test Nginx syntax. The normal **Save** action performs the configuration test and applies the changes. A new host receives its final ID on saving, so ID-dependent directives may change. A newly requested certificate is issued on saving, so its TLS block is not yet shown.

---

## ⚙️ Options

| Option                    | Description                                 | When to Enable                     |
| :------------------------ | :------------------------------------------ | :--------------------------------- |
| **Cache Assets**          | Nginx caches static files (CSS, JS, images) | Static sites, blogs                |
| **Block Common Exploits** | Blocks SQL injection, path traversal, XSS   | ✅ Always recommended              |
| **Websockets Support**    | Enables WebSocket upgrade headers           | Home Assistant, Nextcloud, Grafana |
| **HTTP/2 Support**        | Enable HTTP/2 for better performance        | ✅ Most modern services            |
| **HSTS Enabled**          | Strict Transport Security header            | Production HTTPS sites             |

---

## 📈 Host monitoring

The **Service check** column in **Proxy Hosts** shows whether the upstream service is reachable, separately from the Nginx configuration status. **Not configured** means no periodic check has been set up. Choose **Host monitoring** from a host's action menu to view its settings, current status and recent checks.

1. Open **Host monitoring** from the action menu.
2. Select **Enable monitoring** and choose **HTTP(S)** or **TCP**. HTTP(S) is available for HTTP and HTTPS upstreams; TCP checks the configured upstream host and port.
3. For HTTP(S), enter an **HTTP path** starting with `/` and an **Expected HTTP status**. The path is on the already configured upstream. Full URLs and query strings are not accepted.
4. Set an **Interval** of 15–3600 seconds and a **Timeout** of 500–15000 milliseconds. The timeout must be shorter than the interval.
5. Optionally enable **Notify on status changes** and save. The host's owner needs an enabled Telegram integration with permitted recipient IDs. Choose **Check now** to run an immediate check.

The column shows **Available**, **Unavailable**, **Waiting for first check** or **Paused**, with response time when a check has run. Open **Host monitoring** to see the last check and recent history, including status changes. The list refreshes the results periodically. Disabled monitoring does not run checks. A running Nginx server does not guarantee that the upstream service is available.

> [!NOTE]
> HTTP checks do not send credentials. Use an unauthenticated health endpoint for protected services, or choose a TCP check.

---

## 🔒 SSL/TLS (HTTPS)

In the **SSL** tab, configure how ShieldPM handles HTTPS:

| Option                          | Description                                                            |
| :------------------------------ | :--------------------------------------------------------------------- |
| **None**                        | No SSL — HTTP only                                                     |
| **Request a New Certificate**   | Auto-request from Let's Encrypt (requires domain pointing to ShieldPM) |
| **Select Existing Certificate** | Use a previously created certificate (e.g., wildcard)                  |

### SSL Options

| Option              | Description                                        |
| :------------------ | :------------------------------------------------- |
| **Force SSL**       | Redirect all HTTP requests to HTTPS (301 redirect) |
| **HTTP/2**          | Enable HTTP/2 protocol support                     |
| **HSTS**            | Add `Strict-Transport-Security` header             |
| **HSTS Subdomains** | Include subdomains in HSTS                         |

> [!IMPORTANT]
> For Let's Encrypt to work, port 80 must be reachable from the internet and the domain must point to your ShieldPM server's IP address.

---

## 🔧 Advanced Features

### Bandwidth Limiting

Dynamically throttle bandwidth for clients:

- Enter a value like `100k` (KB/s) or `1m` (MB/s)
- ShieldPM uses **dynamic damping**: allows initial bursts, then slows long downloads to the set rate
- Useful for preventing a single user from saturating your connection

### Forward Query String

Append additional query parameters to every request forwarded to the backend:

- Enter: `api_key=secret123&internal=true`
- Client query parameters are always preserved — this field **adds** extra ones
- Useful for passing API keys or internal routing flags

### Rate Limiting

Protect individual hosts from abuse:

| Field     | Description                      | Example                    |
| :-------- | :------------------------------- | :------------------------- |
| **Rate**  | Requests per unit                | `10`                       |
| **Unit**  | Time unit                        | `second`, `minute`, `hour` |
| **Burst** | Queue size for exceeding clients | `20`                       |

> [!TIP]
> See [Request Rate Limiting](./Request-Rate-Limiting.md) for a detailed guide.

---

## 📂 Locations

Locations let you map specific URL paths to different backends or configurations:

| Field                 | Description                         | Example                     |
| :-------------------- | :---------------------------------- | :-------------------------- |
| **Path**              | URL path prefix to match            | `/api`, `/static`, `/admin` |
| **Forward Host/Port** | Can differ from the main host       | `api-server:3001`           |
| **Custom Config**     | Nginx directives for this path only | `proxy_read_timeout 300s;`  |

**Example:** Route `/api` to a different backend:

- Main host: `frontend:3000` (React app)
- Location `/api`: `backend:8080` (Express API)

---

## 💻 Terminal Scheme (Web SSH)

Selecting **terminal** as the scheme enables a web-based SSH terminal:

| Field             | Description                                       |
| :---------------- | :------------------------------------------------ |
| **Terminal Host** | SSH server address (usually same as Forward Host) |
| **Terminal Port** | SSH port (default: `22`)                          |
| **Username**      | SSH user (e.g., `root`)                           |
| **Auth Type**     | `Password` or `Private Key`                       |

- Navigate to the configured domain (e.g., `https://term.example.com`) to open the terminal
- A **Connect** shortcut is also available in the dashboard via the **⋮** (three dots) menu
- Credentials are **encrypted at rest** using AES-256-GCM

---

## 🛠️ Custom Nginx Configuration

In the **Advanced** tab, you can write raw Nginx directives that are injected into the server block:

**Increase Upload Limit:**

```nginx
client_max_body_size 10G;
```

**Custom Headers:**

```nginx
proxy_set_header X-Custom-Header "MyValue";
```

**Longer Timeouts (for slow backends):**

```nginx
proxy_read_timeout 300s;
proxy_connect_timeout 60s;
proxy_send_timeout 300s;
```

**Disable Buffering (for streaming):**

```nginx
proxy_buffering off;
```

> [!WARNING]
> Invalid Nginx syntax in the Advanced config will prevent Nginx from reloading. If your host stops working after saving, check the advanced config for errors.

---

## Host diagnostics

Choose **Diagnose host** from a proxy host's action menu to check its stored configuration immediately. The ordered results cover DNS A/AAAA resolution, the certificate served by local Nginx, local HTTP routing, upstream TCP reachability, and, when configured, authentication and a WebSocket handshake. Red indicates a failure; yellow indicates a finding that may need review. Skipped checks do not apply to that host.

You need permission to view the host. The checks do not follow redirects or send credentials. With OIDC, OAuth2 or Basic authentication, a redirect or 401/403 response can be expected. Enter your app's WebSocket endpoint as a relative path (for example `/api/ws`); the default is `/`. This tests only that path and cannot verify a signed-in user's reconnect. The routing probe runs on the ShieldPM instance and cannot verify an external CDN, public firewall or DNS from another network.

For HTTPS hosts, ShieldPM verifies the local Nginx certificate before sending the route or WebSocket probe. If the certificate is self-signed or issued by a private authority that the system does not trust, ShieldPM can still test the local route when the served certificate matches the certificate configured for that host and its hostname is valid. The TLS result continues to warn that clients may not trust the certificate. If this local verification needs a configured certificate and that certificate is missing, does not match the one served by Nginx, or has the wrong hostname, the HTTPS route and WebSocket checks fail without sending HTTP requests. A successful local route check does not prove that browsers trust the certificate.

---

## Related pages

- [Home](./Home.md)
- [SSL certificates](./SSL-Certificates.md)
- [Request rate limiting](./Request-Rate-Limiting.md)
- [Report an issue](https://github.com/shedowe19/ShieldPM/issues)
