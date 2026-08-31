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

## ⚙️ Options

| Option                    | Description                                 | When to Enable                     |
| :------------------------ | :------------------------------------------ | :--------------------------------- |
| **Cache Assets**          | Nginx caches static files (CSS, JS, images) | Static sites, blogs                |
| **Block Common Exploits** | Blocks SQL injection, path traversal, XSS   | ✅ Always recommended              |
| **Websockets Support**    | Enables WebSocket upgrade headers           | Home Assistant, Nextcloud, Grafana |
| **HTTP/2 Support**        | Enable HTTP/2 for better performance        | ✅ Most modern services            |
| **HSTS Enabled**          | Strict Transport Security header            | Production HTTPS sites             |

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
> See [Request Rate Limiting](Request-Rate-Limiting) for a detailed guide.

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

| Field                        | Description                                                                                 |
| :--------------------------- | :------------------------------------------------------------------------------------------ |
| **Terminal Host**            | SSH server address (usually same as Forward Host)                                           |
| **Terminal Port**            | SSH port (default: `22`)                                                                    |
| **Username**                 | SSH user (e.g., `root`)                                                                     |
| **Auth Type**                | `Password` or `Private Key`                                                                 |
| **SSH Host Key Fingerprint** | Required OpenSSH `SHA256:…` (or SHA-256 hex) fingerprint obtained through a trusted channel |

- Navigate to the configured domain (e.g., `https://term.example.com`) to open the terminal
- A **Connect** shortcut is also available in the dashboard via the **⋮** (three dots) menu
- Credentials are **encrypted at rest** using AES-256-GCM

Terminal hosts fail closed unless the proxy host is certificate-backed, HTTPS-only and protected by an authenticated
Access List. The browser first exchanges the authenticated Nginx gateway assertion for a 30-second, one-use ticket.
The ticket is bound to the host ID, HTTP authority, client fingerprint and current Access-List revision; even a failed
binding attempt consumes it. Nginx signs the gateway assertion with HMAC, and the WebSocket carries the ticket in the
`shieldpm-terminal` subprotocol instead of a URL.

The SSH connection verifies the configured host-key fingerprint before sending credentials. Changing or removing a
Terminal host or its Access List revokes pending tickets and active sessions. Input frames are capped at 64 KiB and
terminal resize values are range-checked.

> [!WARNING]
> Do not copy a fingerprint from the same untrusted connection you are trying to protect. Verify it from the SSH host
> console, configuration management or another authenticated channel.

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

[🏠 Home](Home) | [📚 SSL Certificates](SSL-Certificates) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
