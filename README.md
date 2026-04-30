# ShieldPM

![CI Status](https://img.shields.io/github/actions/workflow/status/shedowe19/ShieldPM/docker.yml?style=for-the-badge)
![Version](https://img.shields.io/github/v/release/shedowe19/ShieldPM?style=for-the-badge&color=blue)
![License](https://img.shields.io/badge/license-Proprietary-red?style=for-the-badge)

A modern, security-focused reverse proxy manager built on top of Nginx — with a clean web UI, advanced TLS management, and built-in protection features.

---

> [!CAUTION]
> **Migration from NPMplus required.**
> - Update your `compose.yaml` to use `ghcr.io/shedowe19/shieldpm:latest`
> - Data now lives at `/data/shieldpm` (auto-migrated from `/data/npmplus` on first start)
> - Switched from Alpine to **Debian Trixie** — use Debian package names (e.g. `php8.2-curl` instead of `php82-curl`)
> - Downgrading is not possible — **back up your data before upgrading**

---

## 🚀 Quick Start

```bash
# 1. Download config
curl -o compose.yaml https://raw.githubusercontent.com/shedowe19/ShieldPM/refs/heads/develop/compose.yaml

# 2. Set your timezone and ACME email in compose.yaml, then start
docker compose up -d
```

Open the admin UI at `https://<your-ip>:81`

**Default credentials:**
- **Email:** `admin@example.org`
- **Password:** Check the container logs → `docker logs shieldpm`

---

## ✨ Features

- **Reverse Proxy** — Manage Nginx hosts, redirects, and streams from a clean UI
- **SSL/TLS** — Automatic Let's Encrypt certificates with HTTP/2 and HTTP/3 (QUIC) support
- **WAF** — ModSecurity with OWASP CoreRuleSet + OpenAppSec integration
- **CrowdSec IPS** — Community-powered intrusion prevention
- **Cloudflare Tunnels** — Create and manage Zero Trust tunnels directly from the UI
- **PHP-FPM** — Optional PHP 8.2 / 8.3 / 8.4 integration
- **Analytics** — Built-in GoAccess dashboard on port `:91`
- **Auth Requests** — SSO support via Authentik and similar providers
- **Multi-DB** — SQLite (default), MySQL/MariaDB, or PostgreSQL
- **i18n** — UI available in English, German, Spanish, French, and more

---

## 📚 Documentation

Full setup guides, configuration options, and advanced usage are in the **[Wiki](https://github.com/shedowe19/ShieldPM/wiki)**.

---

## 🔨 Development

```bash
# Frontend
cd frontend && yarn install && yarn dev

# Backend
cd backend && npm install && npm run dev

# Tests
npm test
```

---

## 🙏 Acknowledgments

Special thanks to **[@ZoeyVid](https://github.com/ZoeyVid)** for the foundational work on NPMplus, and to all contributors who help make ShieldPM better.

**Questions or ideas?** Head over to [GitHub Discussions](https://github.com/shedowe19/ShieldPM/discussions) — we'd love to hear from you.

---

*Maintained with ❤️ by the ShieldPM Contributors.*
