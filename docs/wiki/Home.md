# Welcome to the NPMplus Wiki!

**NPMplus** is an advanced fork of Nginx Proxy Manager (NPM), designed to provide a secure, high-performance, and user-friendly way to manage your Nginx reverse proxies.

## 🚀 Key Features at a Glance

*   **HTTP/3 (QUIC):** Native support for the latest web protocol.
*   **Security First:** Integrated **CrowdSec** (IPS) and **ModSecurity** (WAF) support.
*   **Advanced TLS:** OCSP Stapling, Must-Staple, and support for various ACME providers.
*   **Database Flexibility:** SQLite (default), MySQL, MariaDB, and PostgreSQL support with Auto-Migration.
*   **Enhanced Management:** Access Lists, Audit Logs, and Stream/Redirection hosts.

## 📚 Documentation Sections

### Basics
*   **[Installation](Installation)**: Get started with Docker Compose and migration guides.
*   **[Configuration](Configuration)**: detailed environment variables and database setup.
*   **[IPv6 Configuration](IPv6)**: Setup guide for Docker and IPv6.
*   **[Docker Compose Reference](Docker-Compose-Reference)**: Full reference file with all options.
*   **[Prerequisites & Best Practices](Best-Practices)**: Backup strategies, security hardening, and performance tips.
*   **[Cookbook & Recipes](Cookbook)**: Configuration guides for Nextcloud, Home Assistant, Jellyfin, and more.
*   **[Backup & Restore](Backup-Restore)**: Dedicated guide for backing up and restoring your instance.
*   **[Glossary](Glossary)**: Definitions of common terms.

### Host Management
*   **[Proxy Hosts](Proxy-Hosts)**: Detailed guide on configuring hosts, locations, and cache.
*   **[Redirection & Dead Hosts](Redirection-Hosts)**: Managing 301/302 redirects and 404 blocks.
*   **[SSL Certificates](SSL-Certificates)**: Let's Encrypt, Custom Certs, and HSTS best practices.

### Security
*   **[Security Overview](Security)**: Introduction to security features.
*   **[CrowdSec Deep Dive](CrowdSec)**: Setup, Bouncer, and Collections.
*   **[ModSecurity Deep Dive](ModSecurity)**: OWASP CRS, Paranoia Levels, and Tuning.
*   **[Access Lists](Access-Lists)**: Basic Auth, IP Ranges, and Authorization.

### Advanced
*   **[Advanced Usage](Advanced-Usage)**: GoAccess analytics, PHP-FPM, Streams, and custom configs.
*   **[Architecture & Internals](Architecture)**: Data flow, file structure, and internal CLI tools.
*   **[API Documentation](API-Docs)**: Developer reference for the REST API.
*   **[Troubleshooting](Troubleshooting)**: Common issues and solutions (FAQ).
*   **[Development](Development)**: How to build and test NPMplus locally.
*   **[CLI Reference](CLI-Reference)**: Documentation for internal scripts and `cscli` usage.

## 🤝 Community & Support

*   [GitHub Discussions](https://github.com/shedowe19/NPMplus/discussions)
*   [Report a Bug](https://github.com/shedowe19/NPMplus/issues)

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/NPMplus/issues)
