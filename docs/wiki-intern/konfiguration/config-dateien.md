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

## Projekt-Dateien

| Datei                    | Zweck                                                                |
| ------------------------ | -------------------------------------------------------------------- |
| `README.md`              | Projekt-Dokumentation — öffentlicher Einstiegspunkt                  |
| `LICENSE`                | GPL-3.0 Lizenz — Urheberrechtsinformationen                          |
| `THIRD-PARTY-NOTICES.md` | Generierte Lizenz-Attribution für NPM-Drittabhängigkeiten            |
| `pentest_crowdsec.py`    | Pentest-Skript für CrowdSec-Integrationstests                        |
| `renovate.json`          | Renovate-Bot Konfiguration für automatische Dependency-Updates       |
| `.gitignore`             | Git-Ignorierliste                                                    |
| `.gitattributes`         | Git-Attribute (z.B. linguististische Erkennung)                      |
| `.imgbotconfig`          | ImgBot-Konfiguration für automatische Bildoptimierung                |
| `.version`               | ShieldPM Version (z.B. `v4.3.2`) — synchron mit package.json-Dateien |

## Agent-spezifische Dateien

Diese Dateien sind für KI-Agenten relevant und steuern das Verhalten bei der Arbeit mit diesem Projekt:

| Datei | Zweck |
| {
|-------|-------|
| `AGENTS.md` | deflection-Skill-Catalog, Common Code Patterns, Projekt-Constraints. **MUSS** vor jeder Aufgabe gelesen werden. |
| `GEMINI.md` | **Source of Truth** für AI Agent Context — alle Agenten müssen diese Datei als autoritativ betrachten. |
| `agent.md` | deflection-Pflicht-Regeln für Wiki-Pflege. Definiert wann und wie das Wiki aktualisiert werden muss. **MUSS** vor jeder Arbeitssitzung gelesen werden. |
| `.cursorrules` | Coding-Standards, Naming-Conventions, Anti-Patterns. Relevant für alle Code-Änderungen. |

## Verwandte Seiten

- [Umgebungsvariablen](./umgebungsvariablen.md)
- [Rootfs-Referenz](./rootfs.md)
- [Build](../entwicklung/build.md)
- [Deployment (CI/CD-Workflows)](../entwicklung/deployment.md)
