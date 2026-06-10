# Welcome to the ShieldPM Wiki

**ShieldPM** is a security-focused Nginx/OpenResty reverse proxy manager fork with a modern UI, integrated WAF/IPS features, GitOps, ChatOps, tunnels, analytics, and native/Docker deployment support.

This public wiki is synchronized from `docs/wiki/` in the ShieldPM repository. It reflects the current `develop` branch state at version **4.3.2**.

## 🚀 Key Features at a Glance

- **Reverse proxy management:** Proxy hosts, redirection hosts, dead hosts, stream hosts, SSL certificates, access lists, locations, and custom Nginx snippets.
- **Modern protocols:** HTTP/2, HTTP/3/QUIC, optional QUIC BPF, IPv4/IPv6 binding controls, and PROXY protocol support.
- **Security layers:** ModSecurity/OWASP CRS, OpenAppSec, CrowdSec, Anubis AI firewall, request rate limiting, mTLS access lists, internal PKI, OAuth2-Proxy, and 2FA.
- **Automation:** GitOps configuration sync, Git auto-deploy for static/PHP sites, Docker Auto-Discovery labels, DDNS, scheduled maintenance, and ChatOps.
- **Connectivity:** Cloudflare Tunnels, Tor Onion Services, and WireGuard tunnels for CGNAT/DS-Lite or private access use cases.
- **Observability:** Integrated analytics, GoAccess support, audit log, database statistics, and service health/status pages.
- **Localization:** Native UI translations for 13 languages.

## 📚 Documentation Sections

### Basics

- **[Installation](Installation)**: Docker, Native Debian, and Proxmox LXC installation paths.
- **[Configuration](Configuration)**: Current environment variables generated from `compose.yaml` and `.env.example`.
- **[Docker Compose Reference](Docker-Compose-Reference)**: The current repository `compose.yaml` rendered as a reference.
- **[Proxmox LXC Installation](Proxmox-LXC)**: Setup guide for LXC/native deployments.
- **[IPv6 Configuration](IPv6)**: IPv6, bind addresses, and dual-stack notes.
- **[Prerequisites & Best Practices](Best-Practices)**: Backup, security, and performance recommendations.
- **[Backup & Restore](Backup-Restore)**: Database and `/data` backup/restore procedures.
- **[Cookbook & Recipes](Cookbook)**: Example service configurations.
- **[Glossary](Glossary)**: Common ShieldPM/Nginx/security terms.

### Host Management

- **[Proxy Hosts](Proxy-Hosts)**: Proxy configuration, SSL, locations, rate limits, and per-host options such as Zstd.
- **[Stream Hosts (TCP/UDP)](Streams)**: Raw TCP/UDP forwarding.
- **[Redirection & Dead Hosts](Redirection-Hosts)**: Redirects and default/dead host behavior.
- **[Disable Buffering](Disable-Buffering)**: Streaming-friendly proxy buffering controls.
- **[Turbo-Loader](Turbo-Loader)**: Parallel download accelerator page.
- **[Maintenance Features](Maintenance)**: Scheduled and manual maintenance pages.
- **[Service Icons](Service-Icons)**: Host icon auto-detection and overrides.
- **[SSL Certificates](SSL-Certificates)**: ACME, custom certs, HSTS, and OCSP options.

### Security

- **[Security Overview](Security)**: Security model and hardening overview.
- **[CrowdSec Deep Dive](CrowdSec)**: IPS setup, logs, parser/collection, and bouncer behavior.
- **[ModSecurity Deep Dive](ModSecurity)**: OWASP CRS and tuning.
- **[OpenAppSec WAF](OpenAppSec)**: OpenAppSec attachment module and agent deployment.
- **[Anubis AI Firewall](Anubis)**: AI crawler/bot challenge integration.
- **[Two-Factor Authentication](Two-Factor-Authentication)**: TOTP, YubiKey, Passkeys/WebAuthn, Duo, and backup codes.
- **[Access Lists](Access-Lists)**: Basic Auth, IP allow/deny, and mTLS.
- **[OAuth2-Proxy Integration](OAuth2-Proxy)**: SSO through Google, GitHub, Azure, OIDC, Authentik, Keycloak, and similar providers.
- **[Request Rate Limiting](Request-Rate-Limiting)**: Per-host rate and burst controls.
- **[Internal PKI & ML-KEM](Internal-PKI)**: Internal CA and client certificate workflows.
- **[Secure Demo Mode](Demo-Mode)**: Public sandbox architecture.
- **[2026 Audit Report](Audit-Report-2026)**: Security and architecture audit findings.

### Advanced / Operations

- **[Advanced Analytics](Analytics)**: Traffic analytics and database statistics.
- **[Cloudflare Tunnels](Cloudflared-Tunnels)**: Cloudflare Zero Trust tunnels.
- **[Tor Onion Services](Tor-Onion-Services)**: Hidden services for privacy/CGNAT bypass.
- **[WireGuard Tunnels](WireGuard-Tunnels)**: ShieldTunnel VPN/tunnel support.
- **[GitOps Synchronization](GitOps)**: Export, push, pull, import, revert, and history.
- **[Dynamic DNS](DDNS)**: Built-in DDNS providers and custom URL provider.
- **[Docker Auto-Discovery](Docker-Auto-Discovery)**: Docker labels for auto-created proxy hosts.
- **[Git Auto-Deploy](Git-Auto-Deploy)**: Git-backed static/PHP site deployment.
- **[PHP Hosting](PHP-Hosting)**: PHP-FPM support for direct app hosting.
- **[Advanced Usage](Advanced-Usage)**: Extra operational recipes and advanced configuration.
- **[AI Agent](AI-Agent)**: AI administrator configuration and capabilities.
- **[ChatOps](ChatOps)**: Telegram bot integration and permission model.
- **[API Documentation](API-Docs)**: REST API, Swagger/OpenAPI, and route index.
- **[Localization](Localization)**: Supported UI languages and translation maintenance.
- **[Architecture & Internals](Architecture)**: Internal architecture and CLI tools.
- **[Development](Development)**: Yarn/Corepack/Biome/Vitest development workflow.
- **[CLI Reference](CLI-Reference)**: Operational scripts.
- **[Troubleshooting](Troubleshooting)**: Common issues and fixes.

## 🤝 Community & Support

- [GitHub Discussions](https://github.com/shedowe19/ShieldPM/discussions)
- [Report a Bug](https://github.com/shedowe19/ShieldPM/issues)

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
