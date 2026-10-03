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

Generated IP Firewall address tables appear as counts and fingerprints in the draft and active comparison.
All rules remain enforced on saving. See [IP Firewall](./IP-Firewall.md) for per-host lists, countries,
exceptions, public blocking reasons, and preview permissions; configure it in the host's **Security** tab.

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

## Table columns

The table's **Columns** control sits on the right above the Proxy Hosts list. Its checkboxes independently show or hide the icon, owner, source, destination, SSL, access, status, service check, and latency columns. All nine are visible by default. Your selection is stored in this browser and survives a reload. The row actions menu remains available. Hiding a column only changes the list display; it does not modify a host or stop its monitoring.

---

## 📈 Host monitoring

The **Service check** column in **Proxy Hosts** shows whether the upstream service is reachable, separately from the Nginx configuration status. The adjacent **Latency** column shows the latest check duration in milliseconds. **Not configured** means no periodic check has been set up. Choose **Host monitoring** from a host's action menu to view its settings, current status and recent checks.

1. Open **Host monitoring** from the action menu.
2. Select **Enable monitoring** and choose **HTTP(S)** or **TCP**. HTTP(S) is available for HTTP and HTTPS upstreams; TCP checks the configured upstream host and port.
3. For HTTP(S), enter an **HTTP path** starting with `/` and an **Expected HTTP status**. The path is on the already configured upstream. Full URLs and query strings are not accepted.
4. For HTTPS upstreams, you can optionally set an **Upstream TLS server name** and a **Custom upstream CA (PEM)**. The DNS name is used for SNI and certificate name verification when the upstream address differs from its certificate name (for example, when connecting to an IP address). It does not change the connection target. With no name set, the certificate must match the configured upstream host. Paste only public PEM certificates in the CA field (up to eight certificates and 65,535 bytes); never paste a private key. When set, the custom CA bundle replaces the system trust store for this check. Leave it blank to trust system CAs.
5. Set an **Interval** of 15–3600 seconds and a **Timeout** of 500–15000 milliseconds. The timeout must be shorter than the interval.
6. Optionally enable **Notify on status changes** and save. The host's owner needs an enabled Telegram integration with permitted recipient IDs. Choose **Check now** to run an immediate check.

**Skip certificate verification for HTTPS monitor** is an explicit, off-by-default option for checks against a trusted HTTPS upstream with a self-signed, expired or mismatched certificate. HTTPS transport is still encrypted, but neither the certificate nor its server name is verified; any certificate is accepted by this monitor. The optional server name still selects the virtual HTTPS host through SNI. The saved custom CA is ignored while this option is enabled and remains available if you turn verification back on. This setting affects only the service monitor, not visitors' TLS connections or Nginx's upstream configuration. HTTP upstreams and TCP checks do not use this option; plain HTTP has no TLS certificate to verify.

The **Service check** column shows **Available**, **Unavailable**, **Waiting for first check**, **Not verifiable** or **Paused**. **Latency** uses the latest check's `response_ms`, including failed checks; it shows a dash when no check has run, monitoring is paused, or monitor data is unavailable. For a timeout, the displayed value is the duration until the probe stopped, not a confirmed network latency. By default, an HTTPS check with an untrusted or mismatched upstream certificate is **Not verifiable** (state `unknown`), not **Unavailable**; it sends no outage alert. Configure the correct public upstream CA and, if needed, the DNS server name so TLS verification can succeed and the HTTP health response can be checked. If you explicitly skip certificate verification, an HTTPS health response may be checked even if the certificate would otherwise be rejected. Open **Host monitoring** to see the last check and recent history, including response times and status changes. The list refreshes the results periodically. Disabled monitoring does not run checks. A running Nginx server does not guarantee that the upstream service is available.

Telegram alerts for an outage show the host and configured domain (when available), checked upstream and path, expected and observed HTTP status, elapsed time versus the configured timeout, and the UTC check time. They distinguish DNS errors, refused or unreachable connections, TLS protocol errors, HTTP status mismatches, and the phase in which a timeout occurred (DNS lookup, TCP connection, TLS handshake, or waiting for HTTP response headers). Each alert suggests a relevant next check. A recovery alert identifies the failed check that triggered the DOWN alert and separately labels a later failed check with its UTC time, if present; if the original check was pruned, only the latest failure is labeled as such, or the message says when earlier results are unavailable. The five-minute alert cooldown does not prove continuous downtime. These details describe what the service monitor observed, not a definitive root cause. Suspicious token-like path segments are masked for Telegram; avoid putting secrets in health-check paths. The monitor does not send response bodies, authentication headers, custom CA data or raw network error text. Existing notification cooldown and owner-only delivery still apply.

Changing the upstream target clears the certificate verification exception, including when changing between two HTTPS targets. Re-enable it explicitly for the new HTTPS target if needed. When a monitored host is changed to a file-system or Unix socket target, the monitor is disabled automatically. Change back to a network upstream before re-enabling it. The dialog shows the previous status but does not offer monitoring settings for unsupported targets.

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

| Option              | Description                                    |
| :------------------ | :--------------------------------------------- |
| **Force SSL**       | Redirect HTTP requests to HTTPS (308 redirect) |
| **HTTP/2**          | Enable HTTP/2 protocol support                 |
| **HSTS**            | Add `Strict-Transport-Security` header         |
| **HSTS Subdomains** | Include subdomains in HSTS                     |

> [!IMPORTANT]
> The HTTP-01 Let's Encrypt challenge requires the domain to reach ShieldPM on port 80. If you choose a supported DNS challenge instead, configure that DNS provider's credentials and follow its requirements; a public port 80 is not required for DNS-01.

---

## 🔧 Advanced Features

### Bandwidth Limiting

Dynamically throttle bandwidth for clients:

- Enter a value like `100k` (KB/s) or `1m` (MB/s)
- ShieldPM uses **dynamic damping**: allows initial bursts, then slows long downloads to the set rate
- Useful for preventing a single user from saturating your connection

### Forward Query String

Append additional query parameters to every request forwarded to the backend:

- Enter: `source=proxy&internal=true`
- Client query parameters are always preserved — this field **adds** extra ones
- Useful for internal routing flags. Avoid secrets in URLs or query strings because they can appear in browser history and logs.

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

## Resumable Upload Relay

For an upstream that already understands chunked uploads (for example, Nextcloud WebDAV or tus), open the Proxy Host's **Advanced** tab and enable **Upload Relay**. The optional **Upload path** defaults to `/_shieldpm-upload`. Set the **Chunk size** in **bytes** between 5 and 90 MiB (default: 83,886,080 bytes, or 80 MiB). The path must be handled by your upstream application; ShieldPM does not create a file storage endpoint there.

When enabled, ShieldPM gives the chosen upload path and its subpaths longer upstream timeouts, disables request and response buffering, and raises the request body and ModSecurity limits for each chunk. Nextcloud's `/remote.php/dav/uploads/` namespace is detected separately and accepts chunks up to 100 MiB. Requests retain their original method, URI and upload headers; WebDAV's `Destination` header stays available to the application. The Proxy Host's regular access list and other security settings still apply. Without an access list or another access control layer, the upload path is publicly accessible.

The public upload path goes from Nginx to the host's existing private HTTP(S) upstream. A separate authenticated backend tus API at `/api/nginx/proxy-hosts/:hostId/upload-relay` exists for integrations and stores sessions under `/data/upload-relay/`; enabling the toggle does not route public uploads through that API. ShieldPM does not split an arbitrary single browser form upload into chunks or bypass limits imposed by a CDN or your application. Your client and upstream must support the same chunked upload protocol. Keep each request below every intermediary's limit.

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
> Invalid Nginx syntax fails validation; ShieldPM records the error and restores the previous generated configuration. Check the host error status and the advanced directives before trying again.

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
