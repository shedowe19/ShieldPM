# Secure Interactive Demo Mode

ShieldPM includes a specialized **Demo Mode** designed for public sandbox environments. It allows users to explore the interface and features interactively while enforcing strict security and privacy controls to prevent abuse.

## Key Features

-   **Interactive Sandbox**: Users can create Proxy Hosts, Streams, and Certificates to test functionality.
-   **Security Restrictions**: Critical administrative actions are blocked at the API and AI level.
-   **Auto-Reset**: The database automatically resets to a clean state every 60 minutes.
-   **Privacy**: User management and logs are restricted to protect user data.
-   **Visual Indicator**: A "DEMO MODE" badge is displayed in the footer.

## Security Architecture

The Demo Mode is controlled by the `DEMO_MODE=true` environment variable.

### 1. API Blocks
The backend middleware (`backend/lib/express/demo.js`) intercepts and blocks specific write operations:
-   **User Management**: Creating, deleting, or modifying users.
-   **Global Settings**: Changing system-wide settings.
-   **Cloudflare Tunnels**: Creating or modifying tunnels.
-   **Nginx Security**:
    -   `advanced_config`: Blocked on **ALL** host types (Proxy, Stream, Redirection, Dead) to prevent injection.
    -   `forward_scheme: path`: Blocked to prevent serving local filesystem files.
    -   **Anti-SSRF**: Forwarding to **Private IPs** (`192.168.x.x`, `10.x.x.x`, etc.) and internal hostnames (`localhost`, `db`, `*.local`) is strictly blocked.

### 2. AI Agent Restrictions
The AI Co-Pilot is aware of the demo context (`backend/internal/ai.js`). It retains knowledge of all tools but actively blocks execution of:
-   **Administrative Tools**: `create_user`, `update_user_password`, `create_api_token`.
-   **Privacy-Sensitive Tools**: `read_nginx_logs`, `get_audit_log`, `get_users`.
-   **Infrastructure Tools**: `create_cloudflared_tunnel`, `update_cloudflared_tunnel`.

### 3. Nginx Hardening
When `DEMO_MODE=true`:
-   **ModSecurity (WAF)** is automatically enabled for all proxy hosts to prevent exploit attempts.
-   **Strict Security Headers** (HSTS, CSP, X-Frame-Options) are enforced.

### 4. Frontend UI
-   **Cloudflare Tunnels**: The management page is replaced with an "Access Denied" screen.
-   **Footer**: Displays a "DEMO MODE" badge.

## Deployment

To deploy a demo instance, use the provided `docker-compose.demo.yaml`. This configuration includes an auto-reset sidecar and CrowdSec for additional protection.

```bash
docker compose -f docker-compose.demo.yaml up -d
```

### Auto-Reset Mechanism
A sidecar Alpine container monitors the instance.
1.  On startup, it creates a clean backup of `database.sqlite` (if one doesn't exist).
2.  Every **60 minutes**, it restores the clean backup over the active database, wiping all user-created data.

### CrowdSec Integration
The demo environment includes CrowdSec to provide IPS (Intrusion Prevention System) capabilities, protecting against brute-force attacks and botnets.
