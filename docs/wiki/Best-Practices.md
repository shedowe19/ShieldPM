# Best Practices

Ensure your ShieldPM installation is secure, reliable, and performant with these recommendations.

---

## 🛡️ Security Hardening

### Change Default Credentials Immediately

After your first login, immediately change the default admin credentials:

1. Log in with `admin@example.com` / `changeme`
2. Go to **Users** → Click your admin user → Change email and password

> [!CAUTION]
> The default credentials are publicly known. Leaving them unchanged is a critical security risk.

### Security Headers

Security headers add an extra layer of protection for visitors:

| Header | Variable | Recommended Value | Description |
| :--- | :--- | :--- | :--- |
| **HSTS** | `NGINX_HSTS_SUBDOMAINS` | `true` | Forces HTTPS on all subdomains |
| **X-Frame-Options** | `X_FRAME_OPTIONS` | `sameorigin` | Prevents clickjacking attacks |

### Block Common Exploits

Enable **Block Exploits** on every Proxy Host. This activates built-in Nginx rules that block:

- SQL injection attempts
- Path traversal attacks (`../../etc/passwd`)
- Known vulnerability scanners
- Malformed HTTP requests

### Network Isolation (Docker)

| Mode | Security | Performance | When to Use |
| :--- | :--- | :--- | :--- |
| **Bridge** (default) | ✅ Isolated | Good | Most setups |
| **Host** | ⚠️ Shared stack | Best | When you need real client IPs or IPv6 |

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

| Data | Location | Critical |
| :--- | :--- | :---: |
| Database | `/data/database.sqlite` | ✅ |
| SSL Certificates | `/data/tls/` | ✅ |
| Configuration | `/data/nginx/` | ⚠️ (regenerated) |
| Keys | `/data/shieldpm/keys.json` | ✅ |
| Access Lists | `/data/access/` | ✅ |
| Tor Keys | `/data/tor/` | ⚠️ (if using Onion Services) |

> [!TIP]
> Use [GitOps](GitOps) to automatically back up your configuration to a Git repository after every change. This gives you versioned, off-site backups with zero effort.

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

| Database | Best For | Concurrent Users |
| :--- | :--- | :--- |
| **SQLite** | Home/Small setups | 1-5 admins |
| **MySQL/MariaDB** | Medium/Production | 5-50 admins |
| **PostgreSQL** | Enterprise/Large | 50+ admins |

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
> Always create a backup **before** updating. While ShieldPM includes automatic database migrations, it's always safer to have a rollback option.

---

## 📋 Pre-Deployment Checklist

Before exposing ShieldPM to the internet, verify:

- [ ] Default credentials changed
- [ ] Admin UI not publicly accessible (or protected by Access List)
- [ ] ACME email configured for Let's Encrypt
- [ ] Time zone set correctly (`TZ` variable)
- [ ] Backup strategy in place (manual or GitOps)
- [ ] Block Exploits enabled on all Proxy Hosts
- [ ] HSTS enabled on production hosts
- [ ] CrowdSec configured (recommended)
- [ ] HTTP/3 enabled and UDP 443 open (recommended)

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
