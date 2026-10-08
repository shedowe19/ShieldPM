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
| `.version`               | Versionsdatei (aktuell: 4.4.1)                                  |
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

## TScanner-Entwicklungswerkzeuge

`.tscanner/config.jsonc` definiert deterministische Regeln, AI-Regeln, Dateimuster und Editor-Verhalten.
AI verwendet `provider: "custom"` und `command: "./.tscanner/providers/codex"`; dieser Launcher startet den lokalen
Codex-Adapter. Für natives Windows ist stattdessen `./.tscanner/providers/codex.cmd` einzutragen. Der Adapter verwendet
das lokal konfigurierte Codex-Modell und erwartet das native Prompt-Format der gepinnten Version für `agentic`-Regeln.
`SHIELDPM_TSCANNER_CODEX_CLI` kann den ausführbaren Clientnamen oder Pfad
vorgeben, jedoch keine Shell-Befehlszeile mit Argumenten.

`.tscanner/baseline.json` hält geprüfte Altbefunde fest; `.tscanner/package.json` und `.tscanner/yarn.lock` pinnen das
private Scanner-Paket. Provider-Anmeldung und Codex-Konfiguration bleiben auf dem eigenen Rechner beziehungsweise
dem eigenen Runner. `.github/workflows/tscanner.yml` verwendet ausschließlich deterministische Prüfungen.
`.github/workflows/tscanner-codex.yml` ergänzt den ausdrücklich freigeschalteten eigenen Linux-Runner ohne
Repository-Secrets, API-Fallback oder geplante Läufe.

| Variable                        | Bedeutung                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `SHIELDPM_CODEX_RUNNER_ENABLED` | Repository-Variable; nur der exakte Wert `true` schaltet den eigenen AI-Job frei. |
| `SHIELDPM_CODEX_HOME`           | Optionaler absoluter Codex-Pfad; Standard `/var/lib/shieldpm-codex`.              |
| `CODEX_HOME`                    | Im Job der gewählte persistente Pfad außerhalb des Checkouts.                     |

`CODEX_HOME` muss dem Runner-Benutzer gehören, privat sein und eine dateibasierte ChatGPT-Anmeldung enthalten.
Der Runner-Modus ignoriert Codex-Benutzerkonfiguration und zusätzliche CLI-Regeln; lokale Aufrufe behalten das
konfigurierte Modell. Codex-Konfiguration in Repository-/Elternverzeichnissen sowie `/etc/codex/config.toml` und
`/etc/codex/managed_config.toml` wird für diesen Modus abgelehnt. Setup, Modus-/Besitzprüfungen, Windows-Hinweise und die Einschränkung der offiziellen
Anleitung für öffentliche Repositories beschreibt die [TScanner-Anleitung](../../wiki/TScanner.md).

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

| Datei                    | Zweck                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `README.md`              | Projekt-Dokumentation — öffentlicher Einstiegspunkt                                                                          |
| `LICENSE`                | ShieldPM-Lizenz für private/interne Nutzung mit MIT-Hinweisen zu übernommenen Anteilen; Einschränkungen stehen im Lizenztext |
| `THIRD-PARTY-NOTICES.md` | Generierte Lizenz-Attribution für NPM-Drittabhängigkeiten                                                                    |
| `pentest_crowdsec.py`    | Pentest-Skript für CrowdSec-Integrationstests                                                                                |
| `renovate.json`          | Renovate-Bot Konfiguration für automatische Dependency-Updates                                                               |
| `.gitignore`             | Git-Ignorierliste                                                                                                            |
| `.gitattributes`         | Git-Attribute (z.B. linguististische Erkennung)                                                                              |
| `.imgbotconfig`          | ImgBot-Konfiguration für automatische Bildoptimierung                                                                        |
| `.version`               | ShieldPM Version (z.B. `4.4.1`) — synchron mit package.json-Dateien                                                          |

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
