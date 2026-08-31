# Troubleshooting & FAQ

Stuck? Here are solutions to the most common problems, organized by category.

---

## 🔑 Login Issues

### I Forgot My Admin Password

**SQLite (Default):**

```bash
# Docker
docker exec -it shieldpm npm-reset-password user@example.org 'new-long-password'

# Native / LXC
npm-reset-password user@example.org 'new-long-password'
```

Pass both required arguments: `npm-reset-password USER_EMAIL PASSWORD`. The helper accesses only
`/data/shieldpm/database.sqlite`.

**MySQL / PostgreSQL:**

The SQLite helper is not available. Use a tested, operator-approved recovery procedure for the selected database and
take a native database dump first; do not copy a SQLite password hash update blindly to another backend.

### "Invalid Login Credentials"

| Cause             | Fix                                      |
| :---------------- | :--------------------------------------- |
| Wrong email       | Check for typos; email is case-sensitive |
| Account disabled  | Ask an admin to re-enable your account   |
| Old browser cache | Clear cookies and try again              |
| CAPS LOCK         | Passwords are case-sensitive             |

---

## 🌐 HTTP Error Codes

### 502 Bad Gateway

The most common error — Nginx cannot reach the upstream service.

| Cause                         | Fix                                                    |
| :---------------------------- | :----------------------------------------------------- |
| Backend service is down       | Start the service and verify it's running              |
| Wrong Forward Host            | Check the IP/hostname in the Proxy Host config         |
| Docker network isolation      | Use container name (bridge) or `127.0.0.1` (host mode) |
| Container not on same network | Run `docker network connect <network> shieldpm`        |

> [!TIP]
> Quick test: `docker exec shieldpm curl -s http://<forward_host>:<forward_port>` — if this fails, the problem is networking, not ShieldPM.

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

| Cause                | Fix                                     |
| :------------------- | :-------------------------------------- |
| Access List blocking | Check the assigned Access List          |
| ModSecurity rule     | Check error log for rule ID, exclude it |
| CrowdSec ban         | Run `cscli decisions list` to check     |
| IP not in allow list | Add your IP to the Access List          |

### 429 Too Many Requests

Rate limiting is rejecting your requests. Lower the limits or increase the burst in the Proxy Host's Security tab.

---

## 🔒 SSL / Certificate Issues

### Let's Encrypt Errors

| Error                           | Fix                                         |
| :------------------------------ | :------------------------------------------ |
| "Connection refused on port 80" | Check firewall/router, port 80 must be open |
| "DNS problem: NXDOMAIN"         | Domain doesn't point to your server         |
| "Too many requests"             | Wait 1 hour, or use Staging server          |
| "ACME email not set"            | Set `ACME_EMAIL` in environment             |

### Self-Signed Certificate Warning

If you're seeing "Your connection is not private" on internal services:

1. Use the [Internal PKI](Internal-PKI) to generate a proper certificate
2. Install the Root CA on your devices
3. Or use Let's Encrypt with DNS-01 challenge (no port 80 needed)

---

## 📜 Where to Find Logs

| Log Type         | Docker                        | Native / LXC                  |
| :--------------- | :---------------------------- | :---------------------------- |
| **Application**  | `docker logs -f shieldpm`     | `journalctl -u shieldpm -f`   |
| **Nginx Access** | `/data/nginx/json_access.log` | `/data/nginx/json_access.log` |
| **Nginx Error**  | `/data/nginx/error.log`       | `/data/nginx/error.log`       |
| **CrowdSec**     | `docker logs crowdsec`        | `journalctl -u crowdsec -f`   |

> [!TIP]
> Enable `LOGROTATE=true` to auto-rotate and compress logs daily.

---

## 🐳 Docker-Specific Issues

### Container Won't Start

```bash
# Check for startup errors:
docker logs shieldpm

# Common causes:
# - Port already in use → Change ports in compose.yaml
# - Permission denied → Check volume ownership
# - Database locked → stop ShieldPM and take a backup; never delete WAL/SHM files from a live SQLite database
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

| Cause                        | Fix                              |
| :--------------------------- | :------------------------------- |
| Too many log entries         | Enable `LOGROTATE=true`          |
| SQLite on large deployment   | Migrate to MySQL/PostgreSQL      |
| Many concurrent SSL renewals | Stagger certificate expiry dates |

### Nginx Not Reloading

If config changes aren't taking effect:

```bash
# Test the Nginx config manually:
docker exec shieldpm nginx -t

# Validate before any manual intervention:
docker exec shieldpm nginx -t
```

Normal UI mutations stage and validate the complete Nginx configuration before reload and restore the prior state on
failure. A direct `nginx -s reload` bypasses that compensation path; use it only during a controlled recovery.

### Initial setup token rejected

- Confirm there is no existing active user; setup tokens work only for the first administrator.
- Read `/data/shieldpm/initial-admin-setup-token` locally and enter the exact value in the wizard.
- If `INITIAL_ADMIN_SETUP_TOKEN_FILE` is used, it must be a regular non-symlink file with mode `0600` or stricter.
- Do not regenerate a token after a pending ownership claim exists; use the same configured token or restore the
  consistent database/token state from backup.

---

[🏠 Home](Home) | [📖 Glossary](Glossary) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
