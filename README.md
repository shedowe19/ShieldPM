# ShieldPM

![CI Status](https://img.shields.io/github/actions/workflow/status/shedowe19/ShieldPM/docker.yml?style=for-the-badge)
![Version](https://img.shields.io/github/v/release/shedowe19/ShieldPM?style=for-the-badge&color=blue)
![License](https://img.shields.io/badge/license-Proprietary-red?style=for-the-badge)

A modern, security-focused reverse proxy manager built on top of Nginx — with a clean web UI, advanced TLS management, and built-in protection features.

---

> [!CAUTION]
> **Migration from NPMplus required.**
>
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

Open the admin UI at `http://<your-ip>:81`. Port 81 serves HTTP by default; terminate TLS in a trusted
reverse proxy or tunnel if the management UI must be reachable over HTTPS.

There are **no default credentials**. On first start ShieldPM creates a short-lived ownership token in
`/data/shieldpm/initial-admin-setup-token` (mode `0600`). Read it locally and enter it in the setup wizard;
the token is retired atomically after the first administrator is created. It is never printed to the logs.

---

## 🛠️ Tech Stack

![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?style=flat-square&logo=nginx&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-404D59?style=flat-square&logo=express&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-729B1B?style=flat-square&logo=vitest&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-005C84?style=flat-square&logo=mysql&logoColor=white)
![MariaDB](https://img.shields.io/badge/MariaDB-003545?style=flat-square&logo=mariadb&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat-square&logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)
![Radix UI](https://img.shields.io/badge/Radix_UI-161618?style=flat-square&logo=radix-ui&logoColor=white)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-FF4154?style=flat-square&logo=react-query&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=flat-square&logo=framer&logoColor=white)
![Lucide](https://img.shields.io/badge/Lucide-F56565?style=flat-square&logo=lucide&logoColor=white)
![Knex.js](https://img.shields.io/badge/Knex.js-D26B38?style=flat-square&logo=knexdotjs&logoColor=white)
![Objection.js](https://img.shields.io/badge/Objection.js-222222?style=flat-square)
![Caddy](https://img.shields.io/badge/Caddy-1F88C0?style=flat-square&logo=caddy&logoColor=white)
![PHP](https://img.shields.io/badge/PHP-777BB4?style=flat-square&logo=php&logoColor=white)
![GoAccess](https://img.shields.io/badge/GoAccess-373737?style=flat-square&logo=goaccess&logoColor=white)
![ModSecurity](https://img.shields.io/badge/ModSecurity-003545?style=flat-square&logo=owasp&logoColor=white)
![OpenAppSec](https://img.shields.io/badge/OpenAppSec-141D2B?style=flat-square)
![CrowdSec](https://img.shields.io/badge/CrowdSec-F8A51B?style=flat-square&logo=crowdsec&logoColor=white)
![MaxMind](https://img.shields.io/badge/MaxMind-031E37?style=flat-square)
![Cloudflare](https://img.shields.io/badge/Cloudflare_Tunnels-F38020?style=flat-square&logo=cloudflare&logoColor=white)

---

## ✨ Features

- **Reverse Proxy** — Manage Nginx hosts, redirects, and streams from a clean UI
- **SSL/TLS** — Automatic Let's Encrypt certificates with HTTP/2 and HTTP/3 (QUIC) support
- **WAF** — ModSecurity with OWASP CoreRuleSet + OpenAppSec integration
- **CrowdSec IPS** — Community-powered intrusion prevention
- **Cloudflare Tunnels** — Create and manage Zero Trust tunnels directly from the UI
- **PHP-FPM** — Optional PHP 8.2 / 8.3 / 8.4 integration
- **Analytics** — Built-in durable analytics ingestion plus an optional GoAccess dashboard on port `:91`
- **Auth Requests** — SSO support via Authentik and similar providers
- **Multi-DB** — SQLite (default), MySQL/MariaDB, or PostgreSQL
- **i18n** — UI available in English, German, Spanish, French, and more

---

## 📚 Documentation

Full setup guides, configuration options, and advanced usage are in the **[Wiki](https://github.com/shedowe19/ShieldPM/wiki)**.

Report vulnerabilities privately according to the [Security Policy](SECURITY.md); do not publish exploit details in a
public issue.

### Projekt-Wiki (Intern)

Die interne Entwicklerdokumentation für Entwickler und AI-Agenten befindet sich unter:

- [Internes Projekt-Wiki](docs/wiki-intern/index.md)

---

## 🔨 Development

```bash
# Node.js 24 LTS and Corepack are required
corepack enable

# Frontend
cd frontend && yarn install --immutable && yarn dev

# Backend (in a second shell)
cd backend && yarn install --immutable && yarn dev

# Run the complete checks in each workspace
yarn check
```

---

## 🙏 Acknowledgments

Special thanks to **[@ZoeyVid](https://github.com/ZoeyVid)** for the foundational work on NPMplus, and to all contributors who help make ShieldPM better.

**Questions or ideas?** Head over to [GitHub Discussions](https://github.com/shedowe19/ShieldPM/discussions) — we'd love to hear from you.

---

_Maintained with ❤️ by the ShieldPM Contributors._
