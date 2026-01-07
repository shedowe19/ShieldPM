# Docker Auto-Discovery

ShieldPM supports **Docker Auto-Discovery**, a feature that allows you to automatically create Proxy Hosts for your Docker containers simply by adding labels to them. This enables "Zero-Config" deployments where a container becomes accessible immediately after startup.

## How it Works

ShieldPM listens to the Docker Socket (`/var/run/docker.sock`) for container events.
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

> **Warning**: Giving a container access to the Docker socket effectively grants it root privileges on the host system. Ensure you trust the ShieldPM application and restrict access to its management interface.

## Troubleshooting

-   **Host not appearing?** Check the ShieldPM logs (`docker logs shieldpm`). Look for `Docker Auto-Discovery`.
-   **Permissions?** Ensure the user running ShieldPM inside the container has permission to read the socket (usually `root` or `docker` group).
