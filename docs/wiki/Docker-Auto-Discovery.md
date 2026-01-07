# Docker Auto-Discovery

ShieldPM supports **Docker Auto-Discovery**, a feature that allows you to automatically create Proxy Hosts for your Docker containers simply by adding labels to them. This enables "Zero-Config" deployments where a container becomes accessible immediately after startup.

## How it Works

ShieldPM### Prerequisites
- Docker Socket mounted (`/var/run/docker.sock`) **OR** `DOCKER_HOSTS` configured.

### Multiple Remote Docker Hosts (Option A - ENV)
You can connect ShieldPM to multiple remote Docker daemons by setting the `DOCKER_HOSTS` environment variable.
Remote hosts must have their Docker socket exposed via TCP (usually port 2375).

**Environment Variable:**
`DOCKER_HOSTS="tcp://10.0.0.2:2375, tcp://10.0.0.3:2375"`

**Note:**
- ShieldPM will prefer the *remote host IP* as the target address.
- It will try to find the *mapped public port* for the container.
- If no port mapping exists, it will fallback to the internal `shieldpm.port`. for container events.
-   **On Container Start**: Checks for specific labels. If found, creates a new Proxy Host or updates an existing one (specifically for that container).
-   **On Container Stop**: Automatically **disables** the associated Proxy Host. This preserves logs, statistics, and SSL certificates but stops traffic forwarding.

> **Note**: ShieldPM must have access to `/var/run/docker.sock` for this feature to work.

## Configuration (Labels)

To expose a container, add the `shieldpm.hostname` label. All other labels are optional.

### Basic Example

```yaml
services:
  my-app:
    image: nginx:latest
    labels:
      - "shieldpm.hostname=app.example.com"
      - "shieldpm.port=80"
```

### Reference

| Label | Description | Default |
| :--- | :--- | :--- |
| `shieldpm.hostname` | **Required**. Comma-separated list of domain names. | - |
| `shieldpm.port` | The internal port of the application in the container. | `80` (or inferred) |
| `shieldpm.scheme` | Scheme to use for forwarding (`http` or `https`). | `http` |
| `shieldpm.auth_user`| HTTP Basic Auth Username. | - |
| `shieldpm.auth_pass`| HTTP Basic Auth Password. | - |
| `shieldpm.access_list_id` | ID of an existing Access List to apply. | - |

## Security Implications

Enabling this feature requires mounting the Docker socket into the ShieldPM container:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

> **Warning**: Giving a container access to the Docker socket effectively grants it root privileges on the host system.### Advanced Configuration
These labels toggle features (true/false or 1/0).

| Label | Description | Default |
| :--- | :--- | :--- |
| `shieldpm.ssl_forced` | Force SSL (HTTPS Redirect) | `false` |
| `shieldpm.http2_support` | Enable HTTP/2 Support | `false` |
| `shieldpm.hsts_enabled` | Enable HSTS | `false` |
| `shieldpm.hsts_subdomains` | Enable HSTS Subdomains | `false` |
| `shieldpm.block_exploits` | Block Common Exploits | `false` |
| `shieldpm.caching_enabled` | Enable Caching | `false` |
| `shieldpm.allow_websocket_upgrade` | Allow Websocket Upgrade | `true` |
| `shieldpm.disable_buffering` | Disable Buffering | `false` |
| `shieldpm.maintenance_active` | Maintenance Mode Active | `false` |
| `shieldpm.maintenance_on_failure` | Maintenance Mode on Failure | `false` |
| `shieldpm.forward_query` | Forward Query Parameters | `false` (or `true`) |

### Bandwidth Limiting
Limit the bandwidth for this host.

| Label | Description | Example |
| :--- | :--- | :--- |
| `shieldpm.bandwidth_limit` | Bandwidth Limit. | `100k`, `1m` |

### Advanced Configuration / Custom Nginx
Inject custom Nginx configuration snippet.

| Label | Description | Example |
| :--- | :--- | :--- |
| `shieldpm.advanced_config` | Custom Nginx config block. | `proxy_set_header X-Custom "Value";` |

### SSL / Let's Encrypt
Automatically request a Let's Encrypt certificate or use an existing one.

| Label | Description | Example |
| :--- | :--- | :--- |
| `shieldpm.ssl_provider` | Set to `letsencrypt` to enable auto-request. | `letsencrypt` |
| `shieldpm.ssl_email` | Email for Let's Encrypt registration. | `admin@example.com` |
| `shieldpm.force_new_cert` | Force request new cert even if one exists (Use with caution). | `true` |
| `shieldpm.certificate_id` | **Manually specify a Certificate ID**. Useful for Wildcard/DNS Certs. | `5` |

> [!TIP]
> **Cloudflare / DNS Validation**: If you need a certificate with DNS validation (e.g., for Cloudflare or Wildcards), create the certificate manually in the ShieldPM UI first. Then, note its ID (found in the URL or list) and use `shieldpm.certificate_id=<ID>` in your container labels.

> [!IMPORTANT]
> **DNS Resolution**: When using `shieldpm.ssl_provider=letsencrypt` (HTTP Challenge), you **must ensure** that your domain name(s) already point to the external IP address of your ShieldPM instance. If Let's Encrypt cannot reach ShieldPM via the domain, certificate generation will fail.

### Rate Limiting
Configure Nginx Rate Limiting.

| Label | Description | Example |
| :--- | :--- | :--- |
| `shieldpm.limit_rate` | Request limit rate (requests per unit). | `10` |
| `shieldpm.limit_unit` | Unit for rate (`second`, `minute`, `hour`). | `second` |
| `shieldpm.limit_burst` | Burst size (queue length). | `20` |

### Security
> [!WARNING]
> Mounting `/var/run/docker.sock` gives ShieldPM full root access to your host. Ensure ShieldPM is isolated and trusted.

> [!CAUTION]
> **Manual Changes Overwritten**: Any changes made manually to an auto-discovered Host via the ShieldPM UI will be **overwritten** the next time the container restarts or the auto-discovery service syncs. Always configure via labels!

### Troubleshooting
*   **Logs**: Check the ShieldPM container logs (`docker logs shieldpm`) for "Docker Auto-Discovery" messages.
*   **Collision**: If you see "Collision detected!", it means a manually created host already uses the domain. ShieldPM will NOT overwrite it.
*   **SSL Failures**: Ensuring your domain points to the ShieldPM server before starting the container is crucial for Let's Encrypt. Check logs for ACME errors.
