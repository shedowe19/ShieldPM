# Config-Dateien

## Zweck

Überblick über wichtige Konfigurationsdateien im Projekt.

## Backend

| Datei                   | Zweck                                     |
| ----------------------- | ----------------------------------------- |
| `backend/knexfile.js`   | Knex-Datenbank-Konfiguration              |
| `backend/biome.json`    | Biome Linting-Konfiguration               |
| `backend/jsconfig.json` | JavaScript-Pfad-Konfiguration             |
| `backend/tsconfig.json` | TypeScript-Konfiguration (für Typprüfung) |

## Frontend

| Datei                         | Zweck                              |
| ----------------------------- | ---------------------------------- |
| `frontend/vite.config.ts`     | Vite Build-Konfiguration           |
| `frontend/tailwind.config.js` | Tailwind CSS Konfiguration         |
| `frontend/postcss.config.js`  | PostCSS Konfiguration              |
| `frontend/tsconfig.json`      | TypeScript-Konfiguration           |
| `frontend/biome.json`         | Biome Linting-Konfiguration        |
| `frontend/components.json`    | shadcn/ui Komponentenkonfiguration |

## Docker

| Datei                      | Zweck                                     |
| -------------------------- | ----------------------------------------- |
| `Dockerfile`               | Multi-Stage Docker Build                  |
| `compose.yaml`             | Vollständige Docker-Compose-Konfiguration |
| `compose.easy.yaml`        | Vereinfachte Docker-Compose-Konfiguration |
| `docker-compose.demo.yaml` | Demo-Modus-Konfiguration                  |

## Projekt

| Datei                    | Zweck                                                           |
| ------------------------ | --------------------------------------------------------------- |
| `.version`               | Versionsdatei (aktuell: 4.3.2)                                  |
| `renovate.json`          | Dependency-Update-Bot-Konfiguration                             |
| `.gitignore`             | Git-Ignore-Regeln                                               |
| `.gitattributes`         | Git-Attribut-Regeln (Line-Endings, Linguist)                    |
| `.imgbotconfig`          | Image-Optimierungs-Bot                                          |
| `.cursorrules`           | Coding-Standards und Architektur-Referenz für Cursor-/AI-Agents |
| `agent.md`               | Wiki-Pflichtregeln für LLM-Agents                               |
| `AGENTS.md`              | AI-Agent-Richtlinien                                            |
| `GEMINI.md`              | Projekt-Kontext für AI-Agents                                   |
| `THIRD-PARTY-NOTICES.md` | Auto-generierte Lizenzen (von `scripts/generate-notices.js`)    |
| `pentest_crowdsec.py`    | Hilfsskript zum Testen von CrowdSec-Bouncern (manueller Lauf)   |

## Caddy-Sidecar

| Datei              | Zweck                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| `caddy/Dockerfile` | Build-Definition des Caddy-Sidecars (`ghcr.io/shedowe19/shieldpm:caddy`) |
| `caddy/Caddyfile`  | Caddy-Konfiguration: HTTP→HTTPS-Redirector, optional ACME-Helfer         |

Verwendung: optionaler Sidecar-Container vor ShieldPM, der Plain-HTTP auf HTTPS umleitet (siehe [Deployment](../entwicklung/deployment.md)).

## Rootfs-Overlay

| Datei                 | Zweck                               |
| --------------------- | ----------------------------------- |
| `rootfs/.env.example` | Umgebungsvariablen-Referenz für LXC |

Siehe [Rootfs-Referenz](./rootfs.md) für vollständige Auflistung.

## Verwandte Seiten

- [Umgebungsvariablen](./umgebungsvariablen.md)
- [Rootfs-Referenz](./rootfs.md)
- [Build](../entwicklung/build.md)
- [Deployment (CI/CD-Workflows)](../entwicklung/deployment.md)
