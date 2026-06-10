# Secure Interactive Demo Mode

ShieldPM includes a specialized **Demo Mode** designed for public sandbox environments. It allows users to explore the interface and features interactively while enforcing strict security and privacy controls to prevent abuse.

## Key Features

- **Interactive Sandbox**: Users can create Proxy Hosts, Streams, Redirection Hosts, and Certificates to test functionality.
- **Security Restrictions**: Critical administrative actions are blocked at the API and AI level.
- **Auto-Reset**: The database automatically resets to a clean state every 60 minutes.
- **Privacy Protection**: User IPs are hidden in Analytics, and user management is disabled.
- **Visual Indicator**: A "DEMO MODE" badge is displayed in the footer.

---

## Security Architecture

The Demo Mode is controlled by the `DEMO_MODE=true` environment variable.

### 1. API Middleware (`backend/lib/express/demo.js`)

The backend middleware intercepts and blocks specific write operations:

| Category               | What is Blocked                                                     |
| ---------------------- | ------------------------------------------------------------------- |
| **User Management**    | Creating, deleting, modifying users, password changes, permissions  |
| **Global Settings**    | All PATCH requests to `/settings`                                   |
| **Cloudflare Tunnels** | Create, update, delete operations                                   |
| **Advanced Config**    | Blocked on **ALL** host types (Proxy, Stream, Redirection, Dead)    |
| **Path Forwarding**    | `forward_scheme: path` to prevent serving local filesystem          |
| **Custom Locations**   | Completely blocked for Proxy Hosts                                  |
| **Anti-SSRF**          | Private IPs, localhost, `*.local` domains blocked on all host types |

#### Protected Host Types

| Host Type         | Forward Field Checked | Additional Blocks                       |
| ----------------- | --------------------- | --------------------------------------- |
| Proxy Hosts       | `forward_host`        | Locations, Advanced Config, Path scheme |
| Streams           | `forward_host`        | Advanced Config                         |
| Redirection Hosts | `forward_domain_name` | Advanced Config                         |
| Dead Hosts (404)  | `domain_names`        | Internal domain names                   |

### 2. AI Agent Restrictions (`backend/internal/ai.js`)

The AI Co-Pilot is aware of the demo context. It retains knowledge of all tools but actively blocks execution of:

- **Administrative Tools**: `create_user`, `update_user_password`, `delete_user`, `create_api_token`
- **Privacy-Sensitive Tools**: `read_nginx_logs`, `get_audit_log`, `get_users`
- **Infrastructure Tools**: `create_cloudflared_tunnel`, `update_cloudflared_tunnel`, `delete_cloudflared_tunnel`
- **Host Creation**: Private IPs, advanced config, path forwarding are validated and blocked

### 3. Nginx Hardening

When `DEMO_MODE=true`:

- **ModSecurity (WAF)** is automatically enabled for all proxy hosts.
- **Strict Security Headers** (HSTS, CSP, X-Frame-Options) are enforced.

### 4. Frontend UI Restrictions

| Component                 | Behavior in Demo Mode                       |
| ------------------------- | ------------------------------------------- |
| **Users Page**            | "Access Denied" screen                      |
| **Settings Page**         | "Access Denied" screen                      |
| **Cloudflare Tunnels**    | "Access Denied" screen                      |
| **User Modal**            | "Disabled in Demo Mode" message             |
| **Change Password Modal** | "Disabled in Demo Mode" message             |
| **Permissions Modal**     | "Disabled in Demo Mode" message             |
| **Analytics Page**        | All IP addresses shown as "Hidden IP"       |
| **Audit Log Details**     | IP-related fields masked as "Hidden (Demo)" |
| **Footer**                | "DEMO MODE" badge visible                   |

---

## Deployment

To deploy a demo instance, use the provided `docker-compose.demo.yaml`:

```bash
docker compose -f docker-compose.demo.yaml up -d
```

### Services

| Service    | Description                                         |
| ---------- | --------------------------------------------------- |
| `app`      | Main ShieldPM instance with `DEMO_MODE=true`        |
| `reset`    | Auto-reset sidecar (restores database every 60 min) |
| `crowdsec` | IPS protection against brute-force and botnets      |

### Auto-Reset Mechanism

1.  On startup, the sidecar waits 60 seconds for the app to initialize.
2.  It creates a clean backup of `database.sqlite` (if one doesn't exist).
3.  Every **60 minutes**, it:
    - Restores the clean backup over the active database
    - Removes WAL/SHM lock files
    - Restarts the ShieldPM container

### Configuration

```yaml
environment:
  DEMO_MODE: "true"
  TZ: "Europe/Berlin"
  DISABLE_IPV6: "true"
volumes:
  - /data/shieldpm:/data
```

---

## Live Demo

Try the public demo at: **https://demo-shieldpm.clawsucht.eu**

- **Email:** `demo.shieldpm@clawsucht.eu`
- **Password:** `ShieldPM`
