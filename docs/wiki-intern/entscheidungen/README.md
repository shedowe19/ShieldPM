# ADR-Übersicht

## Zweck

Architecture Decision Records (ADR) dokumentieren wichtige technische Entscheidungen.

## Vorhandene Entscheidungen

Die Haupt-Entscheidungen sind zusammengefasst in:

- [Architektur-Entscheidungen](../architektur/entscheidungen.md)
- [Backend-Bibliotheken Modernisierung (Dezember 2025)](./2025-12-03-backend-library-modernization.md)
- [Entfernung des Domain Hover Previews (Dezember 2025)](./2025-12-03-remove-domain-preview.md)
- [Migration der Environment-Validierung auf Node.js (Dezember 2025)](./2025-12-03-env-validation-nodejs.md)
- [Full-Stack Refactoring Phase 1 & 2 (Dezember 2025)](./2025-12-03-full-stack-refactoring.md)
- [Einführung des Certificate Expiry Widgets (Dezember 2025)](./2025-12-03-certificate-expiry-widget.md)
- [Einführung von JSON Access Logging für Nginx (Dezember 2025)](./2025-12-10-nginx-json-logging.md)
- [Einführung des Bandwidth Limiting Features (Dezember 2025)](./2025-12-13-bandwidth-limiting.md)
- [Einführung Hidden API Key für Sentinel / Integrationen (Dezember 2025)](./2025-12-13-hidden-api-key.md)
- [Authentik (OIDC/Proxy) Access List Integration (Dezember 2025)](./2025-12-14-authentik-access-list.md)
- [Security Hardening & Vulnerability Patching (Dezember 2025)](./2025-12-16-security-hardening.md)
- [Migration zu Shadcn UI & Radix Primitives (Dezember 2025)](./2025-12-23-shadcn-migration.md)
- [Einführung von MySQL als Produktionsdatenbank (Dezember 2025)](./2025-12-24-mysql-support.md)
- [Passive Health Checks & Maintenance Page (Dezember 2025)](./2025-12-25-passive-health-checks.md)
- [Auslagerung des Nginx-Builds (shieldpm-nginx) (Dezember 2025)](./2025-12-29-split-nginx-repo.md)
- [Advanced Analytics v2 (Dezember 2025)](./2025-12-29-advanced-analytics.md)
- [Request Rate Limiting (Dezember 2025)](./2025-12-29-request-rate-limiting.md)
- [Einführung von Mutual TLS (mTLS) Support (Dezember 2025)](./2025-12-30-mtls-support.md)
- [Scheduled Maintenance Mode (Dezember 2025)](./2025-12-31-scheduled-maintenance-mode.md)
- [Einführung einer internen Public Key Infrastructure (PKI) (Dezember 2025)](./2025-12-31-internal-pki.md)
- [Integration von Cloudflare Tunnels (Januar 2026)](./2026-01-01-cloudflared-integration.md)
- [Integration des AI Agenten (Gemini / Local LLM) (Januar 2026)](./2026-01-03-ai-agent-integration.md)
- [Project Fork & Rebranding (NPMplus -> ShieldPM) (Januar 2026)](./2026-01-06-rebranding-shieldpm.md)
- [Docker Auto-Discovery (Januar 2026)](./2026-01-07-docker-auto-discovery.md)
- [Secure Demo Mode & Security Hardening (Januar 2026)](./2026-01-15-secure-demo-mode.md)
- [Native PHP Hosting Mode (Januar 2026)](./2026-01-18-php-hosting-mode.md)
- [GitOps Sync Engine (Januar 2026)](./2026-01-19-gitops-sync.md)
- [Git Auto-Deploy für Proxy Hosts (Januar 2026)](./2026-01-19-git-auto-deploy.md)
- [Integration von Tor Onion Services (Januar 2026)](./2026-01-22-tor-onion-services.md)
- [Dynamic DNS (DDNS) Client Integration (Januar 2026)](./2026-01-22-ddns-integration.md)
- [CrowdSec IPS Integration (Lua Bouncer) (Januar 2026)](./2026-01-24-crowdsec-integration.md)
- [Web Terminal Hosts (Januar 2026)](./2026-01-23-terminal-hosts.md)
- [ChatOps & Telegram Bot Integration (Januar 2026)](./2026-01-29-chatops-integration.md)
- [Debian-Migration & Nativer Installer (Februar 2026)](./2026-02-02-native-lxc-installer.md)
- [ARM64 / Raspberry Pi 4 Architektur-Support (Februar 2026)](./2026-02-03-arm64-rpi4-support.md)
- [OpenAppSec AI WAF Integration (Februar 2026)](./2026-02-09-openappsec-integration.md)
- [Integration der Anubis AI Firewall (Februar 2026)](./2026-02-19-anubis-ai-firewall.md)
- [Integration von OAuth2 Proxy (OIDC) (Februar 2026)](./2026-02-27-oauth2-proxy-support.md)
- [Granular Role-Based Access Control (RBAC) (März 2026)](./2026-03-03-granular-rbac.md)
- [Advanced 2FA Authentication (WebAuthn/Passkeys) (März 2026)](./2026-03-19-advanced-2fa.md)
- [Self-Hosted WireGuard Tunnels (ShieldTunnel) (April 2026)](./2026-04-07-wireguard-tunnels.md)
- [Browser Turbo-Loader (Multi-Part Download Injection) (April 2026)](./2026-04-09-browser-turbo-loader.md)
- [Einführung der internen Wiki-Wissensbasis (docs/wiki-intern) (Mai 2026)](./2026-05-02-internal-wiki.md)
- [Performance & Code Optimierungen (Mai 2026)](./2026-05-20-performance-optimizations.md)
- [Yarn v4 Migration (Corepack) (Mai 2026)](./2026-05-20-yarn-v4-migration.md)
- [Linter- & Formatter-Konsolidierung auf Biome (Mai 2026)](./2026-05-24-biome-unification.md)
- [Architektur- und Performance-Optimierungen (Mai 2026)](./2026-05-24-architecture-optimizations.md)

## Neue ADR anlegen

Für größere Entscheidungen eine eigene Datei anlegen:

```
docs/wiki-intern/entscheidungen/YYYY-MM-DD-kurzer-titel.md
```

## ADR-Vorlage

Siehe: [ADR-Vorlage](./adr-template.md)

## Verwandte Seiten

- [Architektur-Entscheidungen](../architektur/entscheidungen.md)
