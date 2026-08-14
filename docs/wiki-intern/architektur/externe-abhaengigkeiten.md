# Externe Abhängigkeiten

## Zweck

Dokumentation aller wesentlichen externen Abhängigkeiten und deren Zweck.

## Backend-Abhängigkeiten

### Kern

| Paket            | Version | Zweck                             |
| ---------------- | ------- | --------------------------------- |
| `express`        | 5.2.1   | Web-Framework                     |
| `objection`      | 3.1.5   | ORM                               |
| `knex`           | 3.2.9   | SQL-Query-Builder und Migrationen |
| `better-sqlite3` | ^12.9.0 | SQLite-Treiber                    |
| `mysql2`         | ^3.22.3 | MySQL/MariaDB-Treiber             |
| `pg`             | ^8.20.0 | PostgreSQL-Treiber                |

### Sicherheit

| Paket                        | Version | Zweck                          |
| ---------------------------- | ------- | ------------------------------ |
| `jsonwebtoken`               | 9.0.3   | JWT-Erzeugung und -Validierung |
| `bcryptjs`                   | 3.0.3   | Passwort-Hashing               |
| `helmet`                     | 8.1.0   | HTTP-Security-Header           |
| `csrf-csrf`                  | ^4.0.3  | CSRF-Schutz                    |
| `express-rate-limit`         | 8.4.1   | Rate-Limiting                  |
| `otplib`                     | ^13.4.0 | TOTP (2FA)                     |
| `@simplewebauthn/server`     | ^13.3.0 | WebAuthn/Passkey               |
| `@duosecurity/duo_universal` | ^3.0.1  | Duo Security 2FA               |
| `openid-client`              | ^6.8.4  | OIDC-Authentifizierung         |

### Integrationen

| Paket                   | Version | Zweck                        |
| ----------------------- | ------- | ---------------------------- |
| `@google/generative-ai` | ^0.24.1 | Google Gemini AI             |
| `telegraf`              | ^4.16.3 | Telegram Bot                 |
| `dockerode`             | ^5.0.0  | Docker API                   |
| `isomorphic-git`        | ^1.37.6 | Git-Operationen              |
| `ssh2`                  | ^1.17.0 | SSH-Verbindungen (Terminal)  |
| `ws`                    | ^8.20.0 | WebSocket-Server             |
| `systeminformation`     | ^5.31.5 | System-Info (CPU, RAM, etc.) |

### Hilfsbibliotheken

| Paket           | Version | Zweck                            |
| --------------- | ------- | -------------------------------- |
| `ajv`           | ^8.20.0 | JSON-Schema-Validierung          |
| `lodash`        | ^4.18.1 | Utility-Funktionen               |
| `dayjs`         | 1.11.20 | Datums-Verarbeitung              |
| `liquidjs`      | 10.25.7 | Template-Engine (Nginx-Configs)  |
| `archiver`      | ^7.0.1  | ZIP-Archivierung (GitOps Export) |
| `js-yaml`       | ^4.1.1  | YAML-Verarbeitung                |
| `cookie-parser` | ^1.4.7  | Cookie-Parsing                   |
| `punycode.js`   | 2.3.1   | Internationalisierte Domainnamen |
| `signale`       | 1.4.0   | Logger                           |

## Frontend-Abhängigkeiten (Auswahl)

| Paket                       | Version        | Zweck                                            |
| --------------------------- | -------------- | ------------------------------------------------ |
| `react` / `react-dom`       | ^19.2.5        | UI-Framework                                     |
| `react-router-dom`          | ^7.14.2        | Routing                                          |
| `@tanstack/react-query`     | ^5.100.6       | Server-State                                     |
| `@tanstack/react-table`     | 8.21.3         | Tabellen                                         |
| `tailwindcss`               | ^3.4.19        | CSS-Framework                                    |
| `@radix-ui/*`               | diverse        | Accessible UI-Primitives                         |
| `i18next` / `react-i18next` | ^25.10 / ^16.6 | i18n                                             |
| `framer-motion`             | ^12.38.0       | Animationen                                      |
| `recharts`                  | ^3.8.1         | Charts (Analytics)                               |
| `@xterm/xterm`              | ^6.0.0         | Terminal-Emulator                                |
| `lucide-react`              | ^0.577.0       | Icons                                            |
| `zod`                       | ^4.4.1         | Schema-Validierung                               |
| `react-hook-form`           | ^7.74.0        | Formulare                                        |
| `react-markdown`            | ^10.1.0        | Markdown-Rendering (AI Chat)                     |
| `d3-geo`                    | ^3.1.1         | Projektion und SVG-Pfade der Analytics-Weltkarte |
| `topojson-client`           | ^3.1.0         | TopoJSON-Umwandlung für die Analytics-Weltkarte  |
| `world-atlas`               | ^2.0.2         | Lokal gebündelte Länder-Topologie für Analytics  |

## Entwicklungsabhängigkeiten

| Paket                    | Zweck                |
| ------------------------ | -------------------- |
| `@biomejs/biome`         | Linting & Formatting |
| `vitest`                 | Test-Framework       |
| `@testing-library/react` | React-Testing        |
| `typescript`             | TypeScript-Compiler  |
| `vite`                   | Build-Tool           |

## Verwandte Seiten

- [Architektur-Überblick](./ueberblick.md)
- [Build](../entwicklung/build.md)
