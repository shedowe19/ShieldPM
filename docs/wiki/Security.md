# Security Overview

ShieldPM provides a **layered security architecture** that protects your services at multiple levels — from network to application layer.

---

## 🏗️ Security Layers

```
  ┌──────────┐     ┌──────────────────────────────────────────────────┐
  │  Client   │────▶│                    ShieldPM                      │
  └──────────┘     │                                                  │
                   │  Layer 1: Network                                │
                   │  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
                   │  │ Rate Limit │  │ IP Access  │  │  mTLS     │  │
                   │  │ (429)      │  │ Lists      │  │  Client   │  │
                   │  └─────┬──────┘  └─────┬──────┘  └─────┬─────┘  │
                   │        ▼               ▼               ▼        │
                   │  Layer 2: Authentication                         │
                   │  ┌────────────┐  ┌────────────┐                 │
                   │  │ Basic Auth │  │  OAuth2 /  │                 │
                   │  │            │  │  SSO       │                 │
                   │  └─────┬──────┘  └─────┬──────┘                 │
                   │        ▼               ▼                        │
                   │  Layer 3: Application Firewall                   │
                   │  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
                   │  │ ModSec     │  │ OpenAppSec │  │  Anubis   │  │
                   │  │ (CRS WAF)  │  │ (AI WAF)   │  │ (AI FW)   │  │
                   │  └─────┬──────┘  └─────┬──────┘  └─────┬─────┘  │
                   │        ▼               ▼               ▼        │
                   │  Layer 4: Threat Intelligence                    │
                   │  ┌────────────────────────────────────────────┐  │
                   │  │           CrowdSec (IPS)                   │  │
                   │  │     Community-driven IP Reputation          │  │
                   │  └────────────────────────────────────────────┘  │
                   └──────────────────────────────────────────────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │   Your Backend    │
                              │   (Protected)     │
                              └──────────────────┘
```

---

## 🛡️ Feature Comparison

| Feature                                    | Type          | Protection Against                        | Configuration                                |
| :----------------------------------------- | :------------ | :---------------------------------------- | :------------------------------------------- |
| **[CrowdSec](CrowdSec)**                   | IPS           | Brute force, botnets, known malicious IPs | Sidecar / System service                     |
| **[ModSecurity](ModSecurity)**             | WAF           | SQL injection, XSS, path traversal        | Per-host toggle                              |
| **[OpenAppSec](OpenAppSec)**               | AI WAF        | Zero-day attacks, unknown patterns        | Module + Agent                               |
| **[Anubis](Anubis)**                       | Bot challenge | AI crawlers, automated bots, scrapers     | Per-host rules; optional `ANUBIS_ENABLED`    |
| **[Access Lists](Access-Lists)**           | ACL           | Unauthorized access                       | Per-host assignment                          |
| **[IP Firewall](./IP-Firewall.md)**        | IP policy     | Operator-selected networks and countries  | Central lists; per-host rules and exceptions |
| **[OAuth2-Proxy](OAuth2-Proxy)**           | SSO           | Unauthorized access via Identity Provider | Per-host assignment                          |
| **[Rate Limiting](Request-Rate-Limiting)** | DDoS          | Abuse, scraping, brute force              | Per-host config                              |
| **[mTLS](Internal-PKI)**                   | Zero Trust    | Clients without a valid certificate from the configured CA | Access List + Internal CA                    |
| **Block Exploits**                         | Basic Rules   | Common attack patterns                    | Per-host toggle                              |
| **HSTS**                                   | Header        | Protocol downgrade attacks                | Per-host / global                            |

---

## 🔐 Encryption

### TLS Protocols

ShieldPM supports modern TLS protocols out of the box:

| Protocol          | Status          | Notes                                                                                                          |
| :---------------- | :-------------- | :------------------------------------------------------------------------------------------------------------- |
| **TLS 1.3**       | ✅ Default      | Fastest, most secure                                                                                           |
| **TLS 1.2**       | ✅ Supported    | For older client compatibility                                                                                 |
| **HTTP/3 (QUIC)** | ✅ When enabled | Requires UDP listener and `DISABLE_H3_QUIC=false`                                                              |
| **ML-KEM-768**    | Conditional     | Hybrid key exchange depends on the Nginx/OpenSSL build and client support; internal CA signatures remain ECDSA |

### Certificate Management

| Method            | Best For                    | Automation    |
| :---------------- | :-------------------------- | :------------ |
| **Let's Encrypt** | Public-facing services      | ✅ Auto-renew |
| **DNS Challenge** | Wildcards, blocked port 80  | ✅ Auto-renew |
| **Custom Cert**   | Corporate CAs, bought certs | ❌ Manual     |
| **Internal CA**   | Private/internal services   | ✅ Auto-issue |

👉 **[SSL Certificates Guide](SSL-Certificates)** | **[Internal PKI Guide](Internal-PKI)**

### Data at Rest and Key Rotation

Credentials (Git tokens, terminal passwords and keys, tunnel tokens, WireGuard
keys, notification secrets, TOTP seeds, Duo client secrets and the OIDC client
secret) are encrypted with AES-256-GCM before they reach the database.

The ciphertext names its key (`v2:<key-id>:...`). To rotate the data key:

1. Take a database backup.
2. Set `SHIELDPM_ENCRYPTION_KEY` to the new 64-hex key and
   `SHIELDPM_ENCRYPTION_KEY_PREVIOUS` to the old key. Restart ShieldPM.
3. Run the re-encryption inside the instance:
   ```bash
   node /app/scripts/rotate-encryption-key.js --dry-run
   node /app/scripts/rotate-encryption-key.js --yes
   ```
4. When the report shows no remaining values, remove
   `SHIELDPM_ENCRYPTION_KEY_PREVIOUS` and restart again.

A value encrypted with an unknown key id is rejected, never guessed. Keep the
key outside `/data` (for example in a secrets manager) so a volume backup does
not contain both the ciphertext and its key.

### Verifying Releases

Release images and `SHA256SUMS` are signed keylessly with Cosign. See
[SECURITY.md](https://github.com/shedowe19/ShieldPM/blob/develop/SECURITY.md#verifying-releases)
for the exact `cosign verify` commands and the expected workflow identity.

---

## 🚪 Admin UI Exposure and First Start

The Admin UI listens on port 81 with a self-signed certificate. Binding and firewall rules decide who can reach it; an Access List attached to a Proxy Host for the Admin UI does **not** close the direct listener on port 81.

- **First start:** until the first administrator exists, the setup form is the only way to create one. ShieldPM generates a random **setup token** in `${DATA_PATH}/setup-token` (for example `/opt/shieldpm/setup-token`) on first start and logs its path. Enter that token in the setup form; `SETUP_TOKEN` overrides it for automated deployments. Treat it like a password — it is required before setup completes and is not accepted afterwards. Complete setup over localhost, an SSH tunnel or a private network, or start with `NPM_LISTEN_LOCALHOST=true`. As an alternative, `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` bootstrap the first account on first start (remove the values afterwards; environment variables are visible to anyone who can inspect the container).
- **Ongoing:** bind the UI to loopback or a private interface (`NPM_LISTEN_LOCALHOST=true`, `NPM_IPV4_BINDING`, `NPM_IPV6_BINDING`), restrict port 81 in the host firewall, and prefer VPN/SSH tunnel access.
- **Setup exposure:** if port 81 was reachable before setup, check the users and audit log for accounts you did not create.

---

## 🔐 Host Configuration Boundaries

- **Terminal hosts** (`forwardScheme: terminal`) terminate SSH inside ShieldPM and stream the session through the host's WebSocket. Enable **Force SSL** for terminal hosts so browsers use `wss://`; otherwise keystrokes and terminal output travel in clear text. Add an Access List as well. Terminal credentials are encrypted at rest, but the generated Nginx configuration contains a host-bound terminal token — protect `/data/nginx` and any GitOps export.
- **Path hosts** (`forwardScheme: path`) serve files from a document root on the ShieldPM host; a wrong root can expose `/data`, including keys and certificates.
- **Advanced configuration** (`advancedConfig`) injects raw Nginx directives.
- `path` and `advancedConfig` are administrator-only. Delegate host management without granting these fields.

---

## Security Event Detection

ShieldPM writes security-relevant actions to the audit log with the request
context (source IP, user agent, session/family, request id and outcome) and
turns them into in-product security incidents. An incident carries a stable
rule id, a severity and a deduplication counter, so a brute-force burst becomes
one actionable row instead of hundreds.

| Rule id | Signal | Default severity |
| :--- | :--- | :--- |
| `SPM-AUTH-001` | Repeated failed password logins per IP | high after 5 in 15 min |
| `SPM-AUTH-002` | Successful login from a previously unseen IP | medium |
| `SPM-AUTH-003` | Repeated OIDC login failures per IP | high after 5 in 15 min |
| `SPM-AUTH-004` | Refresh-token replay; the family is revoked | high |
| `SPM-AUTH-005` / `006` | Two-factor method removed / added | high / medium |
| `SPM-AUTH-007` / `008` / `009` | Role, permission or password change | high / medium / medium |
| `SPM-AUTH-010` | Local login blocked because SSO is enforced | medium |
| `SPM-TOKEN-001` | Refresh family used from a different IP | medium |
| `SPM-EXFIL-001`..`004` | Backup, certificate/private key, WireGuard config or root CA download | high / high / high / medium |
| `SPM-EXEC-001` | Terminal session opened or denied | high |
| `SPM-CONFIG-001`..`005` | GitOps import/pull, Git-Deploy sync, Docker discovery, WAF+CrowdSec disabled | high / medium / high / medium / high |
| `SPM-TUNNEL-001` | Cloudflare tunnel connector token replaced | high |
| `SPM-CHATOPS-001` | ChatOps denied or requested a state-changing action | high |
| `SPM-ACME-001` | ACME certificate issued, renewed or renewal failed | medium / high on failure |

Incidents are delivered through the notification channels configured under
**Incidents** (webhook, ntfy, Discord); administrators receive them even when
the action belongs to another account. Administrators can read and resolve the
stream at `GET /api/incidents/security` and
`POST /api/incidents/security/{id}/resolve`.

The detection layer is not a SIEM: it has no hash chain, no external push and
no host-runtime telemetry. Container escape, file-integrity changes and
manipulation of the audit database itself remain outside its reach.

---

## 📋 Security Hardening Checklist

- [ ] Setup completed and verified **before** port 81 is reachable from an untrusted network
- [ ] Admin UI bound to localhost or a private interface, or blocked by the host firewall/VPN
- [ ] Access List on a Proxy Host for the Admin UI is only an additional layer; port 81 itself is closed or bound
- [ ] HSTS enabled on production hosts
- [ ] Block Exploits enabled on all Proxy Hosts (new hosts default to on)
- [ ] CrowdSec installed and configured
- [ ] ModSecurity enabled on sensitive hosts (login pages, APIs)
- [ ] Rate Limiting configured on authentication endpoints
- [ ] Dead Host (`*.yourdomain.com`) catching undefined subdomains
- [ ] SSL certificates configured for all public hosts
- [ ] Terminal hosts use Force SSL/HTTPS and an Access List
- [ ] HTTP/3 enabled (UDP 443 open)
- [ ] Regular backups: encrypted instance backups or `/data` + database dumps, restored and verified
- [ ] At least one incident notification channel configured and tested for security alerts

> [!WARNING]
> Use a **private, access-controlled repository** for GitOps. Current exports redact credentials, but they still contain hostnames, users, roles, Access List structure and integration configuration. Review repository access and rotate credentials that were exposed by older exports. GitOps versions configuration; it is **not a backup** and does not replace `/data`, database dumps or certificate private keys.

---

[🏠 Home](Home) | [🔒 SSL Certificates](SSL-Certificates) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
