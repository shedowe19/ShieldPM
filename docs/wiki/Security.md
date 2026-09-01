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

| Feature                                    | Type        | Protection Against                        | Configuration             |
| :----------------------------------------- | :---------- | :---------------------------------------- | :------------------------ |
| **[CrowdSec](CrowdSec)**                   | IPS         | Brute force, botnets, known malicious IPs | Sidecar / System service  |
| **[ModSecurity](ModSecurity)**             | WAF         | SQL injection, XSS, path traversal        | Per-host toggle           |
| **[OpenAppSec](OpenAppSec)**               | AI WAF      | Zero-day attacks, unknown patterns        | Module + Agent            |
| **[Anubis](Anubis)**                       | AI Firewall | AI crawlers, automated bots, scrapers     | Environment variable      |
| **[Access Lists](Access-Lists)**           | ACL         | Unauthorized access                       | Per-host assignment       |
| **[OAuth2-Proxy](OAuth2-Proxy)**           | SSO         | Unauthorized access via Identity Provider | Per-host assignment       |
| **[Rate Limiting](Request-Rate-Limiting)** | DDoS        | Abuse, scraping, brute force              | Per-host config           |
| **[mTLS](Internal-PKI)**                   | Zero Trust  | All unauthorized clients                  | Access List + Internal CA |
| **Block Exploits**                         | Basic Rules | Common attack patterns                    | Per-host toggle           |
| **HSTS**                                   | Header      | Protocol downgrade attacks                | Per-host / global         |

---

## 🔐 Encryption

### TLS Protocols

ShieldPM supports modern TLS protocols out of the box:

| Protocol          | Status       | Notes                                        |
| :---------------- | :----------- | :------------------------------------------- |
| **TLS 1.3**       | ✅ Default   | Fastest, most secure                         |
| **TLS 1.2**       | ✅ Supported | For older client compatibility               |
| **HTTP/3 (QUIC)** | ✅ Enabled   | UDP-based, improved mobile performance       |
| **ML-KEM-768**    | ✅ Available | Post-quantum key exchange (via Internal PKI) |

### Certificate Management

| Method            | Best For                    | Automation    |
| :---------------- | :-------------------------- | :------------ |
| **Let's Encrypt** | Public-facing services      | ✅ Auto-renew |
| **DNS Challenge** | Wildcards, blocked port 80  | ✅ Auto-renew |
| **Custom Cert**   | Corporate CAs, bought certs | ❌ Manual     |
| **Internal CA**   | Private/internal services   | ✅ Auto-issue |

👉 **[SSL Certificates Guide](SSL-Certificates)** | **[Internal PKI Guide](Internal-PKI)**

---

## 📋 Security Hardening Checklist

- [ ] Initial administrator claimed with the local one-time ownership token; generated token file is retired
- [ ] Admin UI not publicly accessible (use tunnel/VPN or Access List)
- [ ] TLS terminates before HTTP port 81 whenever the UI crosses an untrusted network
- [ ] `TRUST_PROXY` matches only the supported direct/single-proxy topology
- [ ] HSTS enabled on production hosts
- [ ] Block Exploits enabled on all Proxy Hosts
- [ ] CrowdSec installed and configured
- [ ] ModSecurity enabled on sensitive hosts (login pages, APIs)
- [ ] Rate Limiting configured on authentication endpoints
- [ ] Dead Host (`*.yourdomain.com`) catching undefined subdomains
- [ ] SSL certificates configured for all public hosts
- [ ] HTTP/3 enabled (UDP 443 open)
- [ ] Encrypted `/data` backup plus external database-native dump where applicable
- [ ] GitOps v2 is treated as a secret-free configuration projection, not a full backup
- [ ] Terminal SSH host-key fingerprints verified through an independent trusted channel

Report vulnerabilities privately according to the repository [Security Policy](../../SECURITY.md), without publishing
exploit details in an issue.

---

[🏠 Home](Home) | [🔒 SSL Certificates](SSL-Certificates) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
