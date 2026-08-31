# Welcome to the ShieldPM Wiki

**ShieldPM** is an advanced fork of Nginx Proxy Manager (NPM), designed to provide a secure, high-performance, and user-friendly way to manage your Nginx reverse proxies.

## 🚀 Key Features at a Glance

- **HTTP/3 (QUIC):** Native support for the latest web protocol.
- **Security First:** Integrated **CrowdSec** (IPS) and **ModSecurity** (WAF) support.
- **Advanced TLS:** OCSP Stapling, Must-Staple, and support for various ACME providers.
- **Database Flexibility:** SQLite (default), MySQL, MariaDB, and PostgreSQL support with Auto-Migration.
- **Enhanced Management:** Access Lists (incl. **mTLS**), Audit Logs, and Stream/Redirection hosts.

## 📚 Documentation Sections

### Basics

- **[Installation](Installation)**: Get started with Docker Compose and migration guides.
- **[Proxmox LXC Installation](Proxmox-LXC)**: Setup guide for Native Containers (Systemd).
- **[Configuration](Configuration)**: Environment variables and database setup.
- **[IPv6 Configuration](IPv6)**: Setup guide for Docker and IPv6.
- **[Docker Compose Reference](Docker-Compose-Reference)**: Full reference file with all options.
- **[Prerequisites & Best Practices](Best-Practices)**: Backup strategies, security hardening, and performance tips.
- **[Cookbook & Recipes](Cookbook)**: Configuration guides for Nextcloud, Home Assistant, Jellyfin, and more.
- **[Backup & Restore](Backup-Restore)**: Dedicated guide for backing up and restoring your instance.
- **[Glossary](Glossary)**: Definitions of common terms.

### Host Management

- **[Proxy Hosts](Proxy-Hosts)**: Detailed guide on configuring hosts, locations, and cache.
- **[Stream Hosts (TCP/UDP)](Streams)**: Forward raw TCP/UDP traffic (Game Servers, Databases, VPN).
- **[Turbo-Loader (Parallel Downloads)](Turbo-Loader)**: Accelerate large file downloads.
- **[Redirection & Dead Hosts](Redirection-Hosts)**: Managing 301/302 redirects and 404 blocks.
- **[Disable Buffering](Disable-Buffering)**: Optimizing for streaming services (Jellyfin/Plex).
- **[Maintenance Features](Maintenance)**: Configuring automatic maintenance pages for downtime.
- **[Service Icons](Service-Icons)**: Auto-detection and custom icons for your hosts.
- **[SSL Certificates](SSL-Certificates)**: Let's Encrypt, Custom Certs, and HSTS best practices.

### Security

- **[Security Overview](Security)**: Introduction to security features.
- **[CrowdSec Deep Dive](CrowdSec)**: Setup, Bouncer, and Collections.
- **[ModSecurity Deep Dive](ModSecurity)**: OWASP CRS, Paranoia Levels, and Tuning.
- **[Two-Factor Authentication (2FA)](Two-Factor-Authentication)**: TOTP, YubiKey, Passkey (FIDO2), and Duo Security.
- **[Access Lists](Access-Lists)**: Basic Auth, IP Ranges, and Authorization.
- **[OAuth2-Proxy Integration](OAuth2-Proxy)**: Setup Single Sign-On using Google, GitHub, Azure, OIDC, etc.
- **[Anubis AI Firewall](Anubis)**: Stop AI crawlers and automated bots.
- **[Request Rate Limiting](Request-Rate-Limiting)**: Protect hosts from abuse and DDoS.
- **[Internal PKI & ML-KEM](Internal-PKI)**: Setup and use the internal Certificate Authority with Post-Quantum security.
- **[Secure Demo Mode](Demo-Mode)**: Architecture and deployment of the public sandbox environment.
- **[2026 Audit Report](Audit-Report-2026)**: Full-system security and architecture audit findings.
- **[Security Policy](../../SECURITY.md)**: Private vulnerability reporting and supported release line.

### Advanced

- **[Advanced Analytics](Analytics)**: Real-time traffic insights and status code breakdown.
- **[Cloudflare Tunnels](Cloudflared-Tunnels)**: Native support for exposing services via Cloudflare Zero Trust.
- **[Tor Onion Services](Tor-Onion-Services)**: Expose services via Tor Hidden Services for privacy and CGNAT bypass.
- **[WireGuard Tunnels](WireGuard-Tunnels)**: Self-hosted VPN tunnel to expose home services behind CGNAT/DS-Lite.
- **[GitOps Synchronization](GitOps)**: Backup, version control, and restore your configuration with Git.
- **[Dynamic DNS (DDNS)](DDNS)**: Built-in DDNS client for Cloudflare, DuckDNS, and Custom URLs.
- **[Docker Auto-Discovery](Docker-Auto-Discovery)**: Automatically expose containers using labels (Traefik-like).
- **[Git Auto-Deploy](Git-Auto-Deploy)**: Auto-sync static sites/apps from Git repositories.
- **[PHP Hosting](PHP-Hosting)**: Host PHP apps (Nextcloud, WordPress) directly with ShieldPM (No extra container needed).
- **[Advanced Usage](Advanced-Usage)**: GoAccess analytics, Dashboard Notes, and custom configs.
- **[AI Agent (Administrator)](AI-Agent)**: Configuring and using the AI Co-Pilot.
- **[ChatOps (Telegram Bot)](ChatOps)**: Manage ShieldPM via Telegram using the AI Agent.
- **[Architecture & Internals](Architecture)**: Data flow, file structure, and internal CLI tools.
- **[API Documentation](API-Docs)**: Developer reference for the REST API.
- **[Troubleshooting](Troubleshooting)**: Common issues and solutions (FAQ).
- **[Development](Development)**: How to build and test ShieldPM locally.
- **[CLI Reference](CLI-Reference)**: Documentation for internal scripts and `cscli` usage.

## 🤝 Community & Support

- [GitHub Discussions](https://github.com/shedowe19/ShieldPM/discussions)
- [Report a Bug](https://github.com/shedowe19/ShieldPM/issues)

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
