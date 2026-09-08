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
| `mysql2`         | ^3.24.2 | MySQL/MariaDB-Treiber             |
| `pg`             | ^8.23.0 | PostgreSQL-Treiber                |

### Sicherheit

| Paket                        | Version | Zweck                          |
| ---------------------------- | ------- | ------------------------------ |
| `jsonwebtoken`               | 9.0.3   | JWT-Erzeugung und -Validierung |
| `bcryptjs`                   | 3.0.3   | Passwort-Hashing               |
| `helmet`                     | 8.3.0   | HTTP-Security-Header           |
| `csrf-csrf`                  | ^4.0.3  | CSRF-Schutz                    |
| `express-rate-limit`         | 8.7.0   | Rate-Limiting                  |
| `otplib`                     | ^13.5.0 | TOTP (2FA)                     |
| `@simplewebauthn/server`     | ^13.3.3 | WebAuthn/Passkey               |
| `@duosecurity/duo_universal` | ^3.1.0  | Duo Security 2FA               |
| `openid-client`              | ^6.8.7  | OIDC-Authentifizierung         |

### Integrationen

| Paket                   | Version | Zweck                        |
| ----------------------- | ------- | ---------------------------- |
| `@google/generative-ai` | ^0.24.1 | Google Gemini AI             |
| `telegraf`              | ^4.16.3 | Telegram Bot                 |
| `dockerode`             | ^5.0.1  | Docker API                   |
| `isomorphic-git`        | ^1.41.9 | Git-Operationen              |
| `ssh2`                  | ^1.17.0 | SSH-Verbindungen (Terminal)  |
| `ws`                    | ^8.21.3 | WebSocket-Server             |
| `systeminformation`     | ^5.33.6 | System-Info (CPU, RAM, etc.) |

### Hilfsbibliotheken

| Paket           | Version | Zweck                            |
| --------------- | ------- | -------------------------------- |
| `ajv`           | ^8.20.0 | JSON-Schema-Validierung          |
| `lodash`        | ^4.18.1 | Utility-Funktionen               |
| `dayjs`         | 1.11.23 | Datums-Verarbeitung              |
| `liquidjs`      | 10.29.0 | Template-Engine (Nginx-Configs)  |
| `archiver`      | ^8.0.0  | ZIP-Archivierung (GitOps Export) |
| `js-yaml`       | ^5.4.1  | YAML-Verarbeitung                |
| `cookie-parser` | ^1.4.7  | Cookie-Parsing                   |
| `punycode.js`   | 2.3.1   | Internationalisierte Domainnamen |
| `signale`       | 1.4.0   | Logger                           |

## Frontend-Abhängigkeiten (Auswahl)

| Paket                       | Version       | Zweck                                            |
| --------------------------- | ------------- | ------------------------------------------------ |
| `react` / `react-dom`       | ^19.2.8       | UI-Framework                                     |
| `react-router-dom`          | ^7.18.3       | Routing                                          |
| `@tanstack/react-query`     | ^5.102.8      | Server-State                                     |
| `@tanstack/react-table`     | 9.2.4         | Tabellen                                         |
| `tailwindcss`               | ^4.3.3        | CSS-Framework                                    |
| `@radix-ui/*`               | diverse       | Accessible UI-Primitives                         |
| `i18next` / `react-i18next` | ^26.4 / ^17.0 | i18n                                             |
| `framer-motion`             | ^13.1.1       | Animationen                                      |
| `recharts`                  | ^3.10.1       | Charts (Analytics)                               |
| `@xterm/xterm`              | ^6.0.0        | Terminal-Emulator                                |
| `lucide-react`              | ^1.37.0       | Icons                                            |
| `zod`                       | ^4.5.4        | Schema-Validierung                               |
| `react-hook-form`           | ^7.87.0       | Formulare                                        |
| `react-markdown`            | ^10.1.0       | Markdown-Rendering (AI Chat)                     |
| `d3-geo`                    | ^3.1.1        | Projektion und SVG-Pfade der Analytics-Weltkarte |
| `topojson-client`           | ^3.1.0        | TopoJSON-Umwandlung für die Analytics-Weltkarte  |
| `world-atlas`               | ^2.0.2        | Lokal gebündelte Länder-Topologie für Analytics  |

## Entwicklungsabhängigkeiten

| Paket                    | Zweck                                                                   |
| ------------------------ | ----------------------------------------------------------------------- |
| `@biomejs/biome`         | ^2.5.11                                                                 |
| `vitest`                 | 4.1.11                                                                  |
| `@testing-library/react` | ^16.3.3                                                                 |
| `typescript`             | 7.0.2                                                                   |
| `@electric-sql/pglite`   | 0.5.8, ausschließlich Backend-Tests mit eingebetteter PostgreSQL-Engine |
| `vite`                   | 8.2.2                                                                   |

## Sicherheitsprüfung September 2026

`yarn audit --json` meldet nach der Korrektur keine bekannten Befunde: Backend 0 bei 536 erfassten Abhängigkeiten, Frontend 0 bei 610. Zuvor wurden im Backend 13 hohe und 4 mittlere Befunde gemeldet; mehrere davon betreffen dieselben Pakete über unterschiedliche Pfade. Dies ist der Stand der verwendeten Advisory-Datenbank, keine Zusicherung vollständiger Sicherheit.

Gezielt aktualisiert wurden `fast-uri` von 3.1.5 auf 3.1.6, `qs` von 6.15.3 auf 6.16.0 und `nanoid` von 3.3.16 auf 3.3.18. Die bestehenden und neuen Resolutions sind auf die betroffenen Abhängigkeitspfade begrenzt; die Sicherheitstests kontrollieren die korrigierten Lockfile-Versionen.

## Verwandte Seiten

- [Architektur-Überblick](./ueberblick.md)
- [Build](../entwicklung/build.md)
