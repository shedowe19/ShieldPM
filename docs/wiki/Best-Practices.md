# Best Practices

Ensure your ShieldPM installation is secure, reliable, and performant with these recommendations.

---

## 🛡️ Security Hardening

### Initial Setup Wizard

When you access ShieldPM for the first time, a **Setup Wizard** guides you through creating your admin account. There are **no default credentials** — you choose your own email and password during setup.

> [!TIP]
> Read the one-time ownership token from `/data/shieldpm/initial-admin-setup-token` locally. Never expose it in logs,
> screenshots or a committed Compose file. Prefer `INITIAL_ADMIN_SETUP_TOKEN_FILE` with a mounted `0600` secret when
> provisioning automatically, and use a strong unique administrator password.

### Security Headers

Security headers add an extra layer of protection for visitors:

| Header              | Variable                | Recommended Value | Description                    |
| :------------------ | :---------------------- | :---------------- | :----------------------------- |
| **HSTS**            | `NGINX_HSTS_SUBDOMAINS` | `true`            | Forces HTTPS on all subdomains |
| **X-Frame-Options** | `X_FRAME_OPTIONS`       | `sameorigin`      | Prevents clickjacking attacks  |

### Block Common Exploits

Enable **Block Exploits** on every Proxy Host. This activates built-in Nginx rules that block:

- SQL injection attempts
- Path traversal attacks (`../../etc/passwd`)
- Known vulnerability scanners
- Malformed HTTP requests

### Network Isolation (Docker)

| Mode                 | Security        | Performance | When to Use                           |
| :------------------- | :-------------- | :---------- | :------------------------------------ |
| **Bridge** (default) | ✅ Isolated     | Good        | Most setups                           |
| **Host**             | ⚠️ Shared stack | Best        | When you need real client IPs or IPv6 |

> [!TIP]
> If using Bridge mode, ShieldPM automatically fetches and applies Cloudflare/CDN IP ranges so that the real client IP is preserved in logs and Access Lists.

### Admin UI Access

Restrict access to the Admin UI (port 81) from the public internet:

- Set `NPM_LISTEN_LOCALHOST=true` to bind the Admin UI to localhost only
- Access it through a Cloudflare Tunnel, VPN, or SSH tunnel
- Or create a Proxy Host for the Admin UI with an Access List (Basic Auth or OAuth2)

---

## 💾 Backup Strategy

### What to Backup

| Data             | Location                         |           Critical           |
| :--------------- | :------------------------------- | :--------------------------: |
| Database         | `/data/shieldpm/database.sqlite` |              ✅              |
| SSL Certificates | `/data/tls/`                     |              ✅              |
| Configuration    | `/data/nginx/`                   |       ⚠️ (regenerated)       |
| Keys             | `/data/shieldpm/keys.json`       |              ✅              |
| Access Lists     | `/data/access/`                  |              ✅              |
| Tor Keys         | `/data/tor/`                     | ⚠️ (if using Onion Services) |

> [!IMPORTANT]
> GitOps snapshot v2 is a secret-free public configuration projection, not a full backup. It deliberately excludes
> credentials, private keys, certificate material and several object types. Combine it with an encrypted `/data`
> backup and a database-native dump for external MySQL/PostgreSQL.

### Backup Commands

```bash
# Docker — Stop, backup, restart
docker compose stop shieldpm
tar -czvf shieldpm-backup-$(date +%F).tar.gz /path/to/data
docker compose up -d

# Native/LXC — Stop, backup, restart
systemctl stop shieldpm
tar -czvf shieldpm-backup-$(date +%F).tar.gz /data
systemctl start shieldpm
```

### Automated Backups

Set up a cron job for automated daily backups:

```bash
# Add to crontab (crontab -e)
0 3 * * * tar -czf /backups/shieldpm-$(date +\%F).tar.gz /data 2>/dev/null
```

---

## 🚀 Performance Optimization

### Enable HTTP/3 (QUIC)

HTTP/3 uses UDP instead of TCP and is significantly faster on high-latency or lossy networks (mobile, WiFi).

**Requirements:**

- UDP port 443 must be open in your firewall
- In Docker: expose port `443/udp` (see [Docker Compose Reference](Docker-Compose-Reference))

### Enable Caching

For static sites (blogs, documentation, landing pages), enable **Cache Assets** in the Proxy Host settings:

- Serves images, CSS, and JS directly from Nginx disk cache
- Reduces load on your backend by 50-90%
- Automatically invalidated when the backend updates

### Worker Tuning

For high-traffic installations:

```dotenv
# Set to number of CPU cores (or leave as auto)
NGINX_WORKER_PROCESSES=auto

# Increase for high-concurrency servers
NGINX_WORKER_CONNECTIONS=4096
```

### Database Choice

| Database          | Best For          | Concurrent Users |
| :---------------- | :---------------- | :--------------- |
| **SQLite**        | Home/Small setups | 1-5 admins       |
| **MySQL/MariaDB** | Medium/Production | 5-50 admins      |
| **PostgreSQL**    | Enterprise/Large  | 50+ admins       |

> [!NOTE]
> SQLite works perfectly fine for most home and small business setups. Only switch to an external database if you experience performance issues or need multi-node deployments.

---

## 🔄 Update Strategy

### Docker

```bash
# Pull latest image and recreate
docker compose pull
docker compose up -d
```

### Native / LXC

```bash
# Built-in update command
update-shieldpm
```

> [!IMPORTANT]
> Always create and test a backup **before** updating. The native updater verifies artifacts, stages the new payload,
> switches atomically and uses health-checked rollback. Application rollback cannot reverse an external database
> migration; keep an operator-verified MySQL/PostgreSQL dump.

ShieldPM handles `SIGTERM`/`SIGINT` by stopping new background work, draining analytics, DDNS and other in-flight
operations, closing listeners and database connections, then exiting. Give Docker/systemd enough stop time for that
sequence; avoid `SIGKILL` unless the process is irrecoverably stuck.

---

## 📋 Pre-Deployment Checklist

Before exposing ShieldPM to the internet, verify:

- [ ] Setup Wizard completed (admin account created)
- [ ] One-time setup token removed/retired after the ownership claim
- [ ] Admin UI not publicly accessible (or protected by Access List)
- [ ] ACME email configured for Let's Encrypt
- [ ] Time zone set correctly (`TZ` variable)
- [ ] Backup strategy in place (manual or GitOps)
- [ ] External database dump and restore test in place when not using SQLite
- [ ] Block Exploits enabled on all Proxy Hosts
- [ ] HSTS enabled on production hosts
- [ ] CrowdSec configured (recommended)
- [ ] HTTP/3 enabled and UDP 443 open (recommended)

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
