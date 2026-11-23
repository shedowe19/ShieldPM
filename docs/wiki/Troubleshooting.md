# Troubleshooting & FAQ

Stuck? Here are solutions to the most common problems, organized by category.

Docker commands below use the Compose service name `shieldpm`; adjust the name if your service is configured differently.

---

## 🔑 Login Issues

### I Forgot My Admin Password

**SQLite (Default):** Supply the user's email and a new password; the tool cannot discover/reset an account without those arguments. The password is read from the command line, so it appears in shell history and the process list — run the command from a private shell and remove the history entry afterwards. The password must not exceed 72 UTF-8 bytes.

```bash
# Docker
docker compose exec shieldpm npm-reset-password 'admin@example.com' 'your-new-password'

# Native / LXC
sudo npm-reset-password 'admin@example.com' 'your-new-password'
```

**MySQL / PostgreSQL:** There is **no supported password-reset command** for external databases. `npm-reset-password` connects directly to SQLite and cannot change accounts stored in MySQL/MariaDB or PostgreSQL. Keep a second administrator account and a verified [instance backup](Backup-Restore), or restore the instance. Direct edits to credential hashes are unsupported and can lock the account further.

### I Lost My Second Factor / Backup Codes

There is no self-service recovery and no CLI switch to disable 2FA. Another administrator can remove the method under **Users → Edit user → Security**. If the affected account is the only administrator, recovery requires restoring a verified instance backup (or direct database intervention, which is unsupported). Keep a second administrator and current backups for this case.

### "Invalid Login Credentials"

| Cause             | Fix                                                    |
| :---------------- | :----------------------------------------------------- |
| Wrong email       | Check for typos and surrounding spaces                 |
| Account disabled  | Ask an admin to re-enable your account                 |
| Old browser cache | Clear cookies and try again                            |
| CAPS LOCK         | Passwords are case-sensitive                           |

Emails are matched case-insensitively after trimming, so a different capitalisation is not the cause.

### The Setup Form Asks for a Setup Token

On first start ShieldPM generates a random setup token in `${DATA_PATH}/setup-token` and logs its path. Read it with `docker compose exec shieldpm cat /data/setup-token` (Docker) or `sudo cat /data/setup-token` (native/LXC). `SETUP_TOKEN` overrides the generated value. The token is required until the first administrator exists; afterwards the route is no longer usable for account creation.

---

## 🌐 HTTP Error Codes

### 502 Bad Gateway

The most common error — Nginx cannot reach the upstream service.

| Cause                         | Fix                                                                                                                    |
| :---------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| Backend service is down       | Start the service and verify it's running                                                                              |
| Wrong Forward Host            | Check the IP/hostname in the Proxy Host config                                                                         |
| Docker network isolation      | Use container name (bridge) or `127.0.0.1` (host mode)                                                                 |
| Container not on same network | For bridge networking, attach both services to a common Compose network; host networking does not join bridge networks |

> [!TIP]
> Quick test: `docker compose exec shieldpm curl -s http://<forward_host>:<forward_port>` — if this fails, check the upstream address, port and networking.

### 504 Gateway Timeout

Backend is reachable but too slow to respond.

```nginx
# Add to Proxy Host → Advanced tab:
proxy_read_timeout 300s;
proxy_connect_timeout 300s;
proxy_send_timeout 300s;
```

### 413 Request Entity Too Large

File upload exceeds the default limit.

```nginx
# Add to Proxy Host → Advanced tab:
client_max_body_size 0; # Unlimited
# OR
client_max_body_size 10G; # 10 GB limit
```

### 403 Forbidden

| Cause                | Fix                                                                     |
| :------------------- | :---------------------------------------------------------------------- |
| Access List blocking | Check the assigned Access List                                          |
| ModSecurity rule     | Check `/data/nginx/error.log` for the rule ID, then exclude the rule    |
| CrowdSec ban         | Run `cscli decisions list` to check                                     |
| IP not in allow list | Add your IP to the Access List                                          |

### 429 Too Many Requests

Rate limiting is rejecting your requests. Lower the limits or increase the burst in the Proxy Host's Security tab.

---

## 🔒 SSL / Certificate Issues

### Let's Encrypt Errors

| Error                           | Fix                                                                   |
| :------------------------------ | :-------------------------------------------------------------------- |
| "Connection refused on port 80" | Check firewall/router, port 80 must be open                           |
| "DNS problem: NXDOMAIN"         | Domain doesn't point to your server                                   |
| "Too many requests"             | Check the issuing CA's rate-limit response before retrying            |
| "ACME email not set"            | Set `ACME_EMAIL` for ZeroSSL or an ACME server requiring an email/EAB |

### Self-Signed Certificate Warning

If you're seeing "Your connection is not private" on internal services:

1. Use the [Internal PKI](Internal-PKI) to generate a proper certificate
2. Install the Root CA on your devices
3. Or use Let's Encrypt with DNS-01 challenge (no port 80 needed)

---

## 📜 Where to Find Logs

| Log Type         | Docker                                                              | Native / LXC                                                    |
| :--------------- | :------------------------------------------------------------------ | :-------------------------------------------------------------- |
| **Application**  | `docker logs -f shieldpm`                                           | `journalctl -u shieldpm -f`                                     |
| **Nginx Error**  | `/data/nginx/error.log` (always written)                            | `/data/nginx/error.log`                                         |
| **JSON Access**  | `/data/nginx/json_access.log` (hosts with cache or upstream pool)   | `/data/nginx/json_access.log`                                   |
| **Base Access**  | `/data/nginx/access.log` (file logging via `LOGROTATE`)             | `/data/nginx/access.log`                                        |
| **Stream**       | `/data/nginx/stream.log` (file logging via `LOGROTATE`)             | `/data/nginx/stream.log`                                        |
| **CrowdSec**     | `docker logs crowdsec`                                              | `journalctl -u crowdsec -f`                                     |

> [!TIP]
> `LOGROTATE` (default `true`) enables the base HTTP and stream access-log files and rotates all `/data/nginx/*.log` daily; `LOGROTATIONS` controls how many rotated files are kept. It does **not** switch `json_access.log` on or off: proxy hosts with caching or an upstream pool write JSON entries independently. The Nginx error log is always written.

---

## 🐳 Docker-Specific Issues

### Container Won't Start

```bash
# Check for startup errors:
docker compose logs shieldpm

# Common causes:
# - Port already in use → Change ports in compose.yaml
# - Permission denied → Check volume ownership
# - Database locked → Check for concurrent processes and inspect logs; preserve SQLite WAL/SHM files
```

### Port Conflict

```bash
# Find what's using port 80/443:
ss -tlnp | grep -E ":80|:443"

# Common conflict: Apache or another Nginx instance
systemctl stop apache2
systemctl disable apache2
```

---

## ⚡ Performance Issues

### Slow Dashboard / High CPU

| Cause                        | Fix                                                        |
| :--------------------------- | :--------------------------------------------------------- |
| Too many retained log files  | Lower `LOGROTATIONS`; `LOGROTATE` already rotates by default |
| SQLite on large deployment   | Migrate to MySQL/PostgreSQL                                |
| Many concurrent SSL renewals | Stagger certificate expiry dates                           |

### Nginx Not Reloading

If config changes aren't taking effect:

```bash
# Test the Nginx config manually:
docker compose exec shieldpm nginx -t

# Check recent application diagnostics before retrying the change:
docker compose logs --tail 100 shieldpm
```

---

[🏠 Home](Home) | [📖 Glossary](Glossary) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
