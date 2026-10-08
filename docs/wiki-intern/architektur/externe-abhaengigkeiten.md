# Externe Abhängigkeiten

## Zweck

Dokumentation aller wesentlichen externen Abhängigkeiten und deren Zweck.

## Backend-Abhängigkeiten

### Kern

| Paket            | Version | Zweck                             |
| ---------------- | ------- | --------------------------------- |
| `express`        | 5.2.1   | Web-Framework                     |
| `objection`      | 3.1.5   | ORM                               |
| `knex`           | 3.3.0   | SQL-Query-Builder und Migrationen |
| `better-sqlite3` | ^13.0.3 | SQLite-Treiber                    |
| `mysql2`         | ^3.24.5 | MySQL/MariaDB-Treiber             |
| `pg`             | ^8.23.1 | PostgreSQL-Treiber                |

### Sicherheit

| Paket                        | Version | Zweck                          |
| ---------------------------- | ------- | ------------------------------ |
| `jsonwebtoken`               | 9.0.3   | JWT-Erzeugung und -Validierung |
| `bcryptjs`                   | 3.0.3   | Passwort-Hashing               |
| `helmet`                     | 8.3.0   | HTTP-Security-Header           |
| `csrf-csrf`                  | ^4.0.3  | CSRF-Schutz                    |
| `express-rate-limit`         | 8.7.1   | Rate-Limiting                  |
| `otplib`                     | ^13.5.0 | TOTP (2FA)                     |
| `@simplewebauthn/server`     | ^14.0.3 | WebAuthn/Passkey               |
| `@duosecurity/duo_universal` | ^3.1.0  | Duo Security 2FA               |
| `openid-client`              | ^6.8.8  | OIDC-Authentifizierung         |

### Integrationen

| Paket                   | Version  | Zweck                        |
| ----------------------- | -------- | ---------------------------- |
| `@google/generative-ai` | ^0.24.1  | Google Gemini AI             |
| `telegraf`              | ^4.16.3  | Telegram Bot                 |
| `dockerode`             | ^5.0.1   | Docker API                   |
| `isomorphic-git`        | ^1.43.1  | Git-Operationen              |
| `ssh2`                  | ^1.17.0  | SSH-Verbindungen (Terminal)  |
| `ws`                    | ^8.22.0  | WebSocket-Server             |
| `systeminformation`     | ^5.33.15 | System-Info (CPU, RAM, etc.) |

### Hilfsbibliotheken

| Paket           | Version | Zweck                            |
| --------------- | ------- | -------------------------------- |
| `ajv`           | ^8.20.0 | JSON-Schema-Validierung          |
| `lodash`        | ^4.18.1 | Utility-Funktionen               |
| `dayjs`         | 1.11.23 | Datums-Verarbeitung              |
| `liquidjs`      | 10.30.0 | Template-Engine (Nginx-Configs)  |
| `archiver`      | ^8.0.0  | ZIP-Archivierung (GitOps Export) |
| `js-yaml`       | ^5.4.3  | YAML-Verarbeitung                |
| `cookie-parser` | ^1.4.7  | Cookie-Parsing                   |
| `punycode.js`   | 2.3.1   | Internationalisierte Domainnamen |
| `signale`       | 1.4.0   | Logger                           |

## Frontend-Abhängigkeiten (Auswahl)

| Paket                       | Version            | Zweck                                            |
| --------------------------- | ------------------ | ------------------------------------------------ |
| `react` / `react-dom`       | ^19.3.0            | UI-Framework                                     |
| `react-router-dom`          | ^7.18.4            | Routing                                          |
| `@tanstack/react-query`     | ^5.104.1           | Server-State                                     |
| `@tanstack/react-table`     | 9.2.6              | Tabellen                                         |
| `tailwindcss`               | ^4.3.3             | CSS-Framework                                    |
| `@radix-ui/*`               | diverse            | Accessible UI-Primitives                         |
| `i18next` / `react-i18next` | ^26.4.2 / ^17.0.16 | i18n                                             |
| `react-intl`                | ^12.1.4            | ICU-Formatierung für Oberflächentexte            |
| `@simplewebauthn/browser`   | ^14.0.0            | WebAuthn/Passkey im Browser                      |
| `framer-motion`             | ^14.0.0            | Animationen                                      |
| `recharts`                  | ^3.10.1            | Charts (Analytics)                               |
| `@xterm/xterm`              | ^6.0.0             | Terminal-Emulator                                |
| `lucide-react`              | ^1.52.0            | Icons                                            |
| `zod`                       | ^4.6.5             | Schema-Validierung                               |
| `react-hook-form`           | ^7.89.0            | Formulare                                        |
| `react-markdown`            | ^10.1.0            | Markdown-Rendering (AI Chat)                     |
| `d3-geo`                    | ^3.1.1             | Projektion und SVG-Pfade der Analytics-Weltkarte |
| `topojson-client`           | ^3.1.0             | TopoJSON-Umwandlung für die Analytics-Weltkarte  |
| `world-atlas`               | ^2.0.2             | Lokal gebündelte Länder-Topologie für Analytics  |

## Entwicklungsabhängigkeiten (Auswahl)

| Paket                    | Version / Einsatz                                            |
| ------------------------ | ------------------------------------------------------------ |
| `@biomejs/biome`         | ^2.5.15, JS/TS-Lint und Formatierung                         |
| `vitest`                 | Backend ^5.0.3, Frontend 5.0.3; Tests                        |
| `@testing-library/react` | ^16.3.3 im Frontend; Komponententests                        |
| `typescript`             | ^7.0.2 im Backend, 7.0.2 im Frontend; Typsicherheit          |
| `@electric-sql/pglite`   | 0.5.8; Backend-Tests mit eingebetteter PostgreSQL-Engine     |
| `vite`                   | ^8.3.3 im Backend, 8.3.3 im Frontend; Build und Testumgebung |

## Sicherheitsprüfung September 2026

Der dokumentierte `yarn audit --json`-Lauf meldete nach der damaligen Korrektur keine bekannten Befunde: Backend 0 bei 536 erfassten Abhängigkeiten, Frontend 0 bei 610. Zuvor wurden im Backend 13 hohe und 4 mittlere Befunde gemeldet; mehrere davon betreffen dieselben Pakete über unterschiedliche Pfade. Diese Zahlen sind ein historischer Snapshot vor späteren Dependency-Updates und keine aktuelle Sicherheitszusage.

Gezielt aktualisiert wurden `fast-uri` von 3.1.5 auf 3.1.6, `qs` von 6.15.3 auf 6.16.0, `nanoid` von 3.3.16 auf 3.3.18 und die transitive `@apidevtools/swagger-parser`-Kette für `js-yaml` auf 4.3.2. Die Resolutions bleiben auf die betroffenen Abhängigkeitspfade begrenzt; die Sicherheitstests kontrollieren die korrigierten Lockfile-Versionen.

## Sicherheitsprüfung Oktober 2026

Die erneute Prüfung von PR #149 beginnt mit 39 Backend-Meldungen zu 25 unterschiedlichen Advisories (17 hoch, 21 mittel, eine niedrig). Dieselbe betroffene Version kann dabei über mehrere Abhängigkeitspfade gezählt werden. Die folgenden Korrekturen bleiben auf die tatsächlichen Herstellerabhängigkeiten begrenzt:

| Abhängigkeit      | Korrigierte Version | Begrenzter Pfad                                  |
| ----------------- | ------------------- | ------------------------------------------------ |
| `axios`           | 1.20.0              | Duo Universal                                    |
| `fast-uri`        | 3.1.8               | Ajv, einschließlich dessen Schema-/ORM-Aufrufern |
| `brace-expansion` | 5.0.12              | Archiver                                         |
| `@grpc/grpc-js`   | 1.14.5              | Dockerode                                        |
| `ip-address`      | 10.7.3              | Express Rate Limit und Proxy Agent               |

Die Axios-Version bringt zugleich ihre reguläre `form-data`-Abhängigkeit 4.0.6 mit. Lockfile-Untergrenzen und tatsächliche URI-/IP-/FTP-Kompatibilitätsproben ergänzen die Anwendungssuiten. [Fast URI 3.1.8](https://github.com/fastify/fast-uri/releases/tag/v3.1.8) korrigiert zusätzlich zur vorherigen 3.1.7 die Hostnormalisierung; die ältere Empfehlung 3.1.7 reicht daher für die aktuelle Prüfung nicht. Die [gRPC-Herstellerwarnung](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j) nennt 1.14.5 als korrigierte Version der vorhandenen 1.14-Linie. Ein Paketbefund beweist für sich allein keinen über ShieldPM erreichbaren Angriffspfad.

`basic-ftp` bleibt vorerst bei 5.3.1 im transitiven Pfad `proxy-agent → pac-proxy-agent → get-uri`. Die [Hersteller-Releases](https://github.com/patrickjuchli/basic-ftp/releases) korrigieren die bekannte Listing-Schwachstelle erst in 6.2.1; 6.2.2 enthält eine weitere Listing-/PASV-Korrektur. Ein bloßer Major-Override ist mit dem vorhandenen `get-uri` 8.0.1 jedoch nicht kompatibel: Dessen `downloadTo(...).then(...)` hat keinen Rejectionhandler, während FTP v6 getrennte passive Transferhosts standardmäßig ablehnt. Die isolierte Gegenprobe prüft denselben lokalen Splitserver: Mit 5.3.1 gelingt der Download; mit 6.2.2 entsteht nach Rückgabe des Streams eine unbehandelte Promise-Ablehnung und Prozessabbruch. Eine normale FTP-Verbindung auf demselben Host gelingt mit beiden Versionen. Der offene FTP-Befund wird deshalb ausdrücklich erhalten, bis die aufrufende Kette sicher aktualisiert werden kann; eingebundener Vendorcode wird nicht gepatcht oder die Warnung unterdrückt.

Der frische lokale Audit nach den Korrekturen meldet bei 522 Backend-Abhängigkeiten nur noch den genannten einen hohen FTP-Befund (keine niedrigen, mittleren oder kritischen Meldungen); das Frontend meldet bei 629 Abhängigkeiten keine bekannten Befunde. Zuvor waren es 39 Backend-Meldungen.

Der jeweilige Paket-Audit-Snapshot und die abschließenden CI-Ergebnisse stehen im [Oktober-Prüfnachweis](../entwicklung/code-audit-coverage-2026-10.json) und in [PR #149](https://github.com/shedowe19/ShieldPM/pull/149). Diese Zahlen beschreiben den geprüften Zeitpunkt und sind keine dauerhafte Sicherheitszusage.

## Nachprüfung des Dependency-Updates in PR #150

Der frische Backend-Audit vom 7. Oktober 2026 meldete zusätzlich zum bekannten FTP-Befund zwei weitere Advisories:
`proxy-addr` 2.0.7 (kritisch) und `source-map-js` 1.2.1 (hoch). Die gezielten Auflösungen
`express/proxy-addr` auf 2.0.8 und `vite/postcss/source-map-js` auf 1.2.2 halten die Korrekturen auf den betroffenen
Backend-Abhängigkeitspfaden. Das Frontend verwendet bereits `source-map-js` 1.2.2.

Die [Proxy-Addr-Herstellerwarnung](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h)
betrifft die Zuordnung von IPv4-Adressen zu IPv6-Subnetzen bei vertrauenswürdigen Proxys. Das
[Source-Map-JS-Release 1.2.2](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) korrigiert die
Offset-Verarbeitung indizierter Source Maps. Die bestehenden Lockfile-Untergrenzen werden um beide Pakete ergänzt;
Laufzeitproben prüfen zusätzlich die tatsächliche Proxy-Vertrauensprüfung und Source-Map-Verarbeitung.

Der Frontend-Audit meldete außerdem zwei Advisories für `seroval` 1.5.6 in den React-Query-Entwicklerwerkzeugen
(ein kritischer und ein hoher Befund). Die Auflösung `@tanstack/react-query-devtools/**/seroval` auf 1.6.3
korrigiert beide. Sie überschreibt bewusst Solids Versionsbereich `~1.5.4`; die verwendeten Exporte und die
JSON-Verarbeitung einschließlich des URL-Plugins werden gegen die tatsächlich aufgelöste Bibliothek geprüft.
`seroval-plugins` 1.5.6 bleibt kompatibel, da dessen Peer-Abhängigkeit `seroval` mit `^1.0` zulässt.

Die anschließenden Audits melden bei 522 Backend-Abhängigkeiten nur noch den bekannten hohen FTP-Befund
(keine kritischen, mittleren oder niedrigen Meldungen) und bei 629 Frontend-Abhängigkeiten keine bekannten Befunde.
Diese Zahlen sind ein Snapshot vom 7. Oktober 2026; die historischen Prüfungen oben bleiben unverändert.

## Verwandte Seiten

- [Architektur-Überblick](./ueberblick.md)
- [Build](../entwicklung/build.md)
