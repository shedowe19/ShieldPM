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

## Schrittweise Verlagerung von Anwendungsoptionen

Bereits umgesetzt sind die globale ACME-Profilwahl (`acme-profile`), Schlüsseltyp und Prüfintervall (`certificate-options`), alle bisherigen ACME-Konto-/TLS-Optionen einschließlich Standardzertifikat (`acme-options`), Cloudflare-IP-Abruf und Aktualisierungsintervall (`ip-ranges-options`), Analytics-Aufbewahrung (`analytics-options`) sowie Nginx-Formatierung (`nginx-options`). Diese Optionen liegen in der Datenbank und werden über validierte APIs in der UI verwaltet; Änderungen benötigen keinen Dienstneustart. Ihre Anlage-Migrationen übernehmen die jeweiligen alten Umgebungswerte einmalig; bestehende gespeicherte Werte haben Vorrang.

Die ACME-Registrierung erfolgt bei Bedarf im Backend und blockiert bei einem CA-Fehler nicht mehr den UI-Start. Neue Zertifikate verwenden die aktuelle CA-Vorgabe; bestehende behalten ihre CA-/Accountzuordnung. EAB bleibt verschlüsselt und wird aus Antworten, Audit und GitOps-Export entfernt. OCSP-/Standardzertifikat-Änderungen regenerieren und testen die Nginx-Konfiguration unter Sperre mit Wiederherstellung bei Fehlern. Feste Certbot-Vorgaben wie RSA-4096, P-384, Schlüsselrotation, nichtinteraktive Ausführung und interne Datenpfade bleiben technische Vorgaben ohne eigene UI-Schalter. Siehe [ACME-Einstellungen](../verwaltung/einstellungen.md#acme-konto-und-tls-optionen).

Stufe 1 ist umgesetzt. Die Stufen 2 bis 5 sind eine **Roadmap und noch nicht umgesetzt**; sie beschreiben die empfohlene Reihenfolge für weitere Änderungen:

| Stufe         | Kandidaten                                                                                                   | Voraussetzung                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (umgesetzt) | Nginx-Formatierung, Analytics-Aufbewahrung                                                                   | Datenbankoptionen gelten für nächste Generierung/Bereinigung; kein sofortiger Rewrite oder Purge, ungültige Retention erhält Daten                          |
| 2             | Weitere globale Nginx-Header, Buffering und Logging                                                          | Konfiguration unter Sperre prüfen, anwenden und bei Fehlern zurücksetzen                                                                                    |
| 3             | Docker-Discovery-Ziele                                                                                       | Laufende Docker-Clients sicher ersetzen                                                                                                                     |
| 4             | Passkey-RP/Origin und Yubico-Validator                                                                       | Bestehende Anmeldedaten, Origins, Geheimnisse und Fehlerverhalten schützen                                                                                  |
| 5             | Anwendungsnahe Startoptionen wie Listener/Ports/Bindings, Zeitzone, PHP-/Modulladung und Dienstkonfiguration | Dauerhafte Startkonfiguration vor Datenbank/UI bereitstellen; kontrollierte Neustarts, Validierung und Wiederherstellung des Verwaltungszugangs ermöglichen |

Anwendungsnahe Startoptionen sind durch ihre bisherige Nutzung im Launcher nicht dauerhaft von der UI-Verlagerung ausgeschlossen. Weitere Dienst-, Proxy-/Sitzungs-, Einrichtungs- und Integrationsoptionen müssen bei ihrer jeweiligen Stufe auf Neustartbedarf, Schutz von Zugangsdaten und Wiederherstellung geprüft werden. Sie bleiben bis zur tatsächlichen Migration in ihrer bisherigen Konfiguration; diese Roadmap ersetzt keinen Startpfad.

Docker-Image, Container-Netzwerkmodus, Volumes, Geräte und Capabilities bleiben Bereitstellungsentscheidungen. Auch die Datenbank-Bootstrap-Verbindung muss unabhängig von der noch nicht verfügbaren Anwendungsdatenbank bereitgestellt werden. Die bereits umgesetzten Anwendungsoptionen verändern diese Ressourcen nicht.

Bei jeder weiteren Gruppe muss die tatsächliche Anwendung zusätzlich zur Datenbankpersistenz umgesetzt werden. Ein Settings-Patch startet bisher keinen generischen Neustart; Vorlagenfingerabdruck, Timer, Nginx-Regenerierung und externe Dienstverbindungen müssen je nach Gruppe gezielt behandelt werden.

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
