# Best Practices

Ensure your ShieldPM installation is secure, reliable, and performant with these recommendations.

---

## 🛡️ Security Hardening

### Initial Setup Wizard

When you access ShieldPM for the first time, a **Setup Wizard** guides you through creating your admin account. There are **no default credentials** — you choose your own email and password during setup.

> [!TIP]
> Use a strong, unique password for your admin account. Consider using a password manager to generate one.

### Security Headers

Security headers add an extra layer of protection for visitors:

| Header              | Variable                                           | Recommended Value                                              | Description                                                                     |
| :------------------ | :------------------------------------------------- | :------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| **HSTS**            | Proxy Host `HSTS` setting; `NGINX_HSTS_SUBDOMAINS` | Enable per host after verifying HTTPS for the affected domains | Advertises HTTPS to browsers; the subdomain option applies when HSTS is enabled |
| **X-Frame-Options** | `X_FRAME_OPTIONS`                                  | `sameorigin`                                                   | Prevents clickjacking attacks                                                   |

### Block Common Exploits

Enable **Block Exploits** where appropriate and test the upstream application. This turns on ModSecurity rules for that Proxy Host; inspect ModSecurity logs if legitimate requests are blocked.

### Network Isolation (Docker)

| Mode                          | Security                   | Performance | When to Use                                                    |
| :---------------------------- | :------------------------- | :---------- | :------------------------------------------------------------- |
| **Bridge**                    | Separate network namespace | Good        | Simple published-port installations                            |
| **Host** (repository samples) | Host network namespace     | Good        | Direct host listeners and integrations needing host networking |

> [!TIP]
> Cloudflare IP-range fetching is **off by default**. Enable it under **Settings → Network** when needed and configure trusted upstreams carefully. The setting is independent of Docker's network mode; it does not automatically preserve client IPs behind every CDN.

### Admin UI Access

Restrict access to the Admin UI (port 81) from the public internet:

- Set `NPM_LISTEN_LOCALHOST=true` to bind the Admin UI to localhost only
- Access it through a Cloudflare Tunnel, VPN, or SSH tunnel
- If you create a Proxy Host for the Admin UI with an Access List or OAuth2, also block direct access to port 81 with a firewall or bind it to localhost; the Proxy Host does not close the direct listener

---

## 💾 Backup Strategy

### What to Backup

| Data             | Location                                                        |           Critical           |
| :--------------- | :-------------------------------------------------------------- | :--------------------------: |
| Database         | `/data/shieldpm/database.sqlite` (or an external database dump) |              ✅              |
| SSL Certificates | `/data/tls/`                                                    |              ✅              |
| Configuration    | `/data/nginx/`                                                  |       ⚠️ (regenerated)       |
| Keys             | `/data/shieldpm/keys.json`                                      |              ✅              |
| Access Lists     | `/data/access/`                                                 |              ✅              |
| Tor Keys         | `/data/tor/`                                                    | ⚠️ (if using Onion Services) |

> [!TIP]
> [GitOps](GitOps) can auto-push versioned configuration when enabled. It is not a complete backup: certificate private keys are excluded from exported certificate files, and service credentials may appear in YAML. Keep the repository private and back up `/data` separately.

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
# Stop the service before archiving SQLite, or make a consistent SQLite snapshot first.
# See Backup & Restore for complete procedures.
```

---

## 🚀 Performance Optimization

### Enable HTTP/3 (QUIC)

HTTP/3 uses UDP instead of TCP and is significantly faster on high-latency or lossy networks (mobile, WiFi).

**Requirements:**

- UDP port 443 must be open in your firewall
- In Docker: expose port `443/udp` (see [Docker Compose Reference](Docker-Compose-Reference))

### Test Caching per Application

Enable the Proxy Host's **Cache Assets** option only after checking the generated configuration and your application's cache behavior. Do not assume automatic invalidation or a fixed performance gain for dynamic responses.

### Worker Tuning

For high-traffic installations:

```dotenv
# Set to number of CPU cores (or leave as auto)
NGINX_WORKER_PROCESSES=auto

# Increase for high-concurrency servers
NGINX_WORKER_CONNECTIONS=4096
```

### Database Choice

| Database          | Typical fit                                             |
| :---------------- | :------------------------------------------------------ |
| **SQLite**        | Small installations without a separate database service |
| **MySQL/MariaDB** | Deployments already operating that database             |
| **PostgreSQL**    | Deployments already operating that database             |

> [!NOTE]
> Measure the workload before changing database engines. ShieldPM's file-based Nginx configuration and local runtime state are not designed for multiple nodes sharing one database without additional coordination.

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

- [ ] Setup Wizard completed (admin account created)
- [ ] Admin UI not publicly accessible (or protected by Access List)
- [ ] ACME email configured for certificate notices and for providers that require it
- [ ] Time zone set correctly (`TZ` variable)
- [ ] Backup strategy in place (manual or GitOps)
- [ ] Block Exploits enabled on all Proxy Hosts
- [ ] HSTS enabled on production hosts
- [ ] CrowdSec configured (recommended)
- [ ] HTTP/3 enabled and UDP 443 open (recommended)

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
