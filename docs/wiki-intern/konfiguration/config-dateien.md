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

## Persistente Instanzkonfiguration

`backend/lib/config.js` liest zuerst `${DATA_PATH:-/data}/shieldpm/default.json`, sofern darin eine Datenbank konfiguriert ist. Eine vorhandene, aber nicht lesbare oder ungültige JSON-Datei bricht die Initialisierung ab. Sie darf nicht stillschweigend eine andere Datenbank oder die Ersteinrichtung auswählen. Ohne diese Datei gelten die Datenbank-Umgebungsvariablen und anschließend SQLite als Standard.

Die Schlüsseldatei `shieldpm/keys.json` wird vollständig in eine private temporäre Datei geschrieben und vor ihrer Veröffentlichung synchronisiert. Die Erweiterung um einen fehlenden `encryptionKey` ersetzt die bisherige Datei atomar; ein Schreibfehler erhält die bisherigen RSA-Schlüssel. Bei konkurrierender erstmaliger Erstellung gewinnt genau eine vollständige Datei, die anschließend von beiden Aufrufern gelesen wird. Konkurrierende Erweiterungen einer alten Datei wählen über eine ebenfalls private, atomar angelegte Kandidatendatei denselben Verschlüsselungsschlüssel. Der Kandidat wird vor dem erneuten Lesen der Hauptdatei gelesen; ein bereits veröffentlichter Schlüssel gewinnt. Bei fehlgeschlagener Veröffentlichung bleibt der vollständige Kandidat für den nächsten Versuch erhalten, nach Erfolg wird er entfernt.

`backend/lib/environment-hash.js` berechnet gemeinsam für `envs.sh` und `utils.writeHash()` den Fingerabdruck der Nginx-Vorlagen, ihrer benannten Umgebungswerte und der Template-Version. Die strukturierte Kodierung unterscheidet beispielsweise die Portpaare `443/80` und `44/380`. Änderungen der Vorlagendateien selbst führen auch ohne Versionsänderung zu `REGENERATE_ALL=true`. Nach abgeschlossener Neuerzeugung liegt der Fingerabdruck unter `${DATA_PATH:-/data}/shieldpm/env.sha512sum`.

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

| Datei          | Zweck                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`    | Skill-Katalog, gemeinsame Code-Muster und Projektvorgaben. **MUSS** vor jeder Aufgabe gelesen werden.                                                |
| `GEMINI.md`    | **Source of Truth** für AI Agent Context — alle Agenten müssen diese Datei als autoritativ betrachten.                                               |
| `agent.md`     | Verbindliche Regeln für die Wiki-Pflege. Definiert wann und wie das Wiki aktualisiert werden muss. **MUSS** vor jeder Arbeitssitzung gelesen werden. |
| `.cursorrules` | Coding-Standards, Naming-Conventions, Anti-Patterns. Relevant für alle Code-Änderungen.                                                              |

## Verwandte Seiten

- [Umgebungsvariablen](./umgebungsvariablen.md)
- [Rootfs-Referenz](./rootfs.md)
- [Build](../entwicklung/build.md)
- [Deployment (CI/CD-Workflows)](../entwicklung/deployment.md)
