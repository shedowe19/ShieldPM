# Docker Auto-Discovery

ShieldPM supports **Docker Auto-Discovery**, a feature that allows you to automatically create Proxy Hosts for your Docker containers simply by adding labels to them. This enables "Zero-Config" deployments where a container becomes accessible immediately after startup.

## How it Works

### Architecture

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                        ShieldPM Backend                          │
  │                                                                  │
  │  ┌────────────────┐     ┌──────────────────┐   ┌────────────┐   │
  │  │ Docker Watcher │────▶│  Label Parser    │──▶│ ProxyHost  │   │
  │  │ (dockerode)    │     │  (shieldpm.*)    │   │ CRUD API   │   │
  │  └───────┬────────┘     └──────────────────┘   └──────┬─────┘   │
  │          │                                            │         │
  │          │ events: start/stop/die                      ▼         │
  │          │                                    ┌──────────────┐  │
  │          │                                    │  nginx.js    │  │
  │          │                                    │  (Generate   │  │
  │          │                                    │   .conf)     │  │
  │          │                                    └──────┬───────┘  │
  └──────────┼───────────────────────────────────────────┼──────────┘
             │                                           │
             ▼                                           ▼
  ┌──────────────────┐                          ┌──────────────┐
  │ Docker Socket    │                          │ nginx -s     │
  │ /var/run/docker  │                          │    reload    │
  │     .sock        │                          └──────────────┘
  └──────────────────┘
```

**Key Points:**

- ShieldPM monitors Docker container events in real-time via the Docker socket
- Labels prefixed with `shieldpm.*` on containers define proxy host configuration
- When a container starts, ShieldPM automatically creates/updates the corresponding proxy host
- When a container stops, the proxy host can be cleaned up automatically

### Prerequisites

- Docker Socket mounted (`/var/run/docker.sock`).
- Optional: `DOCKER_HOSTS` for _additional_ remote hosts (the local socket is **always monitored**).

### Multiple Docker Hosts

To monitor additional remote Docker daemons, set the `DOCKER_HOSTS` environment variable in your `compose.yaml`.
ShieldPM will effectively merge containers from all sources into one view.

```yaml
environment:
  - DOCKER_HOSTS=tcp://10.0.0.5:2375,tcp://192.168.1.50:2375
```

**Note**: For remote hosts, ShieldPM prioritizes the _Host IP_ (e.g., `10.0.0.5`) and attempts to find the mapped public port. If no public port is mapped, it falls back to the internal port (which might not be reachable).

## Configuration (Labels)

To expose a container, add the `shieldpm.hostname` label. All other labels are optional.

### Quick Start Example

```yaml
services:
  whoami:
    image: traefik/whoami
    labels:
      - "shieldpm.hostname=whoami.example.com"
      - "shieldpm.port=80"
      - "shieldpm.ssl_forced=true"
      - "shieldpm.ssl_provider=letsencrypt"
      - "shieldpm.ssl_email=admin@example.com"
```

### Reference

| Label                     | Description                                                                    | Default            |
| :------------------------ | :----------------------------------------------------------------------------- | :----------------- |
| `shieldpm.hostname`       | **Required**. Comma-separated list of domain names (e.g. `app.local,app.com`). | -                  |
| `shieldpm.port`           | The internal port of the application in the container.                         | `80` (or inferred) |
| `shieldpm.scheme`         | Scheme to use for forwarding (`http` or `https`).                              | `http`             |
| `shieldpm.auth_user`      | HTTP Basic Auth Username.                                                      | -                  |
| `shieldpm.auth_pass`      | HTTP Basic Auth Password.                                                      | -                  |
| `shieldpm.access_list_id` | ID of an existing Access List (check URL in UI for ID).                        | -                  |

### Advanced Options (Booleans)

Set these to `true` or `1` to enable.

| Label                              | Description                           | Default |
| :--------------------------------- | :------------------------------------ | :------ |
| `shieldpm.ssl_forced`              | Force SSL (HTTPS Redirect).           | `false` |
| `shieldpm.http2_support`           | Enable HTTP/2 Support.                | `false` |
| `shieldpm.hsts_enabled`            | Enable HSTS.                          | `false` |
| `shieldpm.hsts_subdomains`         | Enable HSTS Subdomains.               | `false` |
| `shieldpm.block_exploits`          | Block Common Exploits.                | `false` |
| `shieldpm.caching_enabled`         | Enable Caching.                       | `false` |
| `shieldpm.allow_websocket_upgrade` | Allow Websocket Upgrade.              | `true`  |
| `shieldpm.disable_buffering`       | Disable Buffering (good for streams). | `false` |
| `shieldpm.maintenance_active`      | Maintenance Mode Active.              | `false` |
| `shieldpm.maintenance_on_failure`  | Maintenance Mode on Failure.          | `false` |

### Advanced Configuration (Strings)

| Label                      | Description                                                                                   | Example                              |
| :------------------------- | :-------------------------------------------------------------------------------------------- | :----------------------------------- |
| `shieldpm.forward_query`   | Appends a query string to the upstream request. Useful for passing hidden API keys or tokens. | `?api_key=secret123`                 |
| `shieldpm.bandwidth_limit` | Limits bandwidth for this host.                                                               | `100k`, `1m`                         |
| `shieldpm.advanced_config` | Injects raw Nginx configuration into the server block.                                        | `proxy_set_header X-Custom "Value";` |

### SSL / Let's Encrypt

Automatically obtain certificates.

| Label                     | Description                                                                            | Example             |
| :------------------------ | :------------------------------------------------------------------------------------- | :------------------ |
| `shieldpm.ssl_provider`   | Set to `letsencrypt` to enable auto-request.                                           | `letsencrypt`       |
| `shieldpm.ssl_email`      | Email for Let's Encrypt registration.                                                  | `admin@example.com` |
| `shieldpm.force_new_cert` | Force request new cert even if one exists (Use with caution).                          | `true`              |
| `shieldpm.certificate_id` | **Manually specify a Certificate ID**. Useful for Wildcard/DNS Certs created manually. | `5`                 |

> [!TIP]
> **DNS Validation**: For Wildcard certs or Cloudflare DNS validation, create the certificate manually in ShieldPM first, then use `shieldpm.certificate_id=<ID>` to attach it to your auto-discovered containers.

### Rate Limiting

Limit request rate to prevent abuse.

| Label                  | Description                                 | Example  |
| :--------------------- | :------------------------------------------ | :------- |
| `shieldpm.limit_rate`  | Request limit rate (requests per unit).     | `10`     |
| `shieldpm.limit_unit`  | Unit for rate (`second`, `minute`, `hour`). | `second` |
| `shieldpm.limit_burst` | Burst size (queue length).                  | `20`     |

### Comprehensive Example

```yaml
services:
  secure-api:
    image: my-secure-api:latest
    labels:
      - "shieldpm.hostname=api.example.com"
      - "shieldpm.port=3000"
      - "shieldpm.ssl_forced=true"
      - "shieldpm.ssl_provider=letsencrypt"
      - "shieldpm.ssl_email=admin@example.com"
      - "shieldpm.http2_support=true"
      - "shieldpm.block_exploits=true"
      # Hidden API Token for Upstream
      - "shieldpm.forward_query=?internal_token=xyz987"
      # Custom Header
      - "shieldpm.advanced_config=proxy_set_header X-Auto-Discovered 'true';"
```

## Security & Persistence

> [!WARNING]
> Mounting `/var/run/docker.sock` gives ShieldPM full root access to your host. Ensure ShieldPM is isolated and trusted.

> [!CAUTION]
> **Zero Config / Overwrite**: This feature is designed to be declarative ("Configuration as Code"). Any changes you make manually to an auto-discovered Host via the ShieldPM UI **will be overwritten** the next time the container restarts or the labels change. Always make configuration changes **via labels** in your `compose.yaml`.

### Troubleshooting

- **Logs**: Check `docker logs shieldpm` for "Docker Auto-Discovery" messages.

* **Collision**: If you see "Collision detected!", it means a manually created host already uses the domain. ShieldPM will NOT overwrite it to prevent data loss.
* **"Welcome to Nginx"**: If you see the default page, check logs. It might be that the configuration failed to reload. (Fixed in recent versions).
