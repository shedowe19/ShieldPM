# Projekt-Überblick

## Zweck

ShieldPM (Shedowe's Shield Proxy Manager) ist ein sicherheitsfokussierter Fork von Nginx Proxy Manager (NPM). Es bietet eine Web-UI zur Verwaltung von Nginx Reverse Proxies mit Fokus auf Sicherheit (WAF, IPS), moderne Protokolle (HTTP/3, QUIC) und native Performance.

## Kontext

- **Basis**: Fork von NPMplus (ZoeyVid), welches selbst ein Fork von Nginx Proxy Manager (Jamie Curnow) ist.
- **Version**: Quelle der Wahrheit sind `.version` sowie beide Package-Manifeste; Versionsbump nur nach expliziter Entscheidung.
- **Lizenz**: UNLICENSED (Proprietär)
- **Primäre Ausgabe**: Docker Image (`ghcr.io/shedowe19/shieldpm:latest`) und Native Installer (`scripts/install.sh`).

## Kernfunktionen

| Bereich          | Funktionen                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Proxy-Verwaltung | HTTP/HTTPS/HTTP3, Streams (TCP/UDP), Redirections, 404-Hosts                                             |
| Sicherheit       | WAF (ModSecurity/OpenAppSec), IPS (CrowdSec), Access Lists (Basic Auth/mTLS), SSL (Let's Encrypt/Custom) |
| Netzwerk         | Cloudflare Tunnels, Tor Onion Services, WireGuard Tunnels, DDNS                                          |
| Wartung          | Geplante Maintenance-Windows, Failure-Pages                                                              |
| Tools            | Web-Terminal (SSH), GitOps (Backup/Sync), ChatOps (Telegram), AI-Assistent                               |
| Erweiterungen    | Service-Icons, Dashboard Notes, PHP-Hosting, Analytics (GoAccess), Docker Auto-Discovery                 |

## Zwei-Repository-Architektur

ShieldPM besteht aus **zwei** getrennten Repositories:

| Repository                | Verantwortung                                                                    |
| ------------------------- | -------------------------------------------------------------------------------- |
| `ShieldPM` (dieses Repo)  | Backend-API, Frontend-UI, Migrations, Installer, Docker-Overlays                 |
| `shieldpm-nginx` (extern) | Nginx-Binaries, OS-Umgebung (Debian Trixie), Root-nginx.conf, Modul-Kompilierung |

> **Wichtig:** Änderungen an Nginx-Kompilierungsflags, Modulen oder der Root-`nginx.conf` müssen im `shieldpm-nginx`-Repo erfolgen, nicht hier.

## Wichtige Dateien

| Datei                       | Beschreibung                                   |
| --------------------------- | ---------------------------------------------- |
| `backend/internal/nginx.js` | Nginx-Konfigurationsengine ("Das Gehirn")      |
| `backend/templates/*.conf`  | EJS-Templates für Nginx-Konfigurationen        |
| `backend/migrations/`       | Knex.js Migrationen (ESM)                      |
| `frontend/src/Router.tsx`   | React-Routing (Lazy-Loading)                   |
| `frontend/src/api/`         | React Query Hooks                              |
| `scripts/install.sh`        | Native/LXC-Installer                           |
| `rootfs/`                   | Docker-Image-Overlay-Dateien                   |
| `Dockerfile`                | Multi-Stage Build (Frontend → Backend → Final) |
| `.version`                  | Release-Versionsdatei                          |

## Verwandte Seiten

- [Architektur-Überblick](../architektur/ueberblick.md)
- [Externe Abhängigkeiten](../architektur/externe-abhaengigkeiten.md)
- [Setup](../entwicklung/setup.md)
