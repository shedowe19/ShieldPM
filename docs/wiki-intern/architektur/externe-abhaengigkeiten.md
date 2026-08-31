# Externe Abhängigkeiten

## Zweck

Die Manifeste und Lockfiles sind die Versionsquelle. Diese Seite hält nur Rollen und Sicherheitsgrenzen fest, damit
Paketversionslisten nicht manuell veralten.

## Backend

| Bereich       | Abhängigkeiten                                                                       | Zweck/Grenze                                              |
| ------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Web/API       | `express`, `helmet`, `csrf-csrf`, `express-rate-limit`                               | HTTP, Header, CSRF, Rate-Limits                           |
| Daten         | `objection`, `knex`, `better-sqlite3`, `mysql2`, `pg`                                | ORM und drei DB-Dialekte                                  |
| Auth          | `jsonwebtoken`, `bcryptjs`, `otplib`, `@simplewebauthn/server`, Duo, `openid-client` | Session/MFA/OIDC; Serverzustand bleibt maßgeblich         |
| AI            | `@google/genai`, native Fetch-APIs                                                   | Provider sind untrusted; Tools strikt serverseitig        |
| GitOps        | `isomorphic-git`, `ajv`                                                              | HTTPS-PAT und snapshot-v2-Validierung                     |
| Integrationen | `telegraf`, `ssh2`, `ws`, `dockerode`                                                | ChatOps, Terminal, Docker; externe Principals live prüfen |

## Frontend

React/TypeScript/Vite bilden die SPA; TanStack Query verwaltet Server-State. Radix/shadcn und Tailwind bilden die
Komponentenschicht. Frontendvalidierung ist UX und ersetzt keine Backend-Schema-/RBAC-Prüfung. Karten-/Chartdaten
werden lokal gebündelt; neue CDN-Runtime-Abhängigkeiten benötigen eine Supply-Chain-Prüfung.

## Laufzeit-Artefakte

- `shieldpm-nginx` Base-Image: externes Repository, derzeit beweglicher Tag als offene Pinning-Grenze.
- Anubis/OAuth2-Proxy/WireGuard-Hilfen: Installer/Docker-Build müssen Checksums/Signaturen und Größen prüfen.
- NodeSource: signiertes Debian-Repository; Node 24 LTS wird nach Installation verifiziert.
- GitHub Actions: auf unveränderliche Commit-SHAs pinnen; Versionstags nur als Kommentar/Lesbarkeit.

## Pflege

Dependency-Updates erfolgen mit Yarn 4 und immutable Lockfiles. CI führt Tests/Build/Audit aus. Third-Party-Notices
werden deterministisch aus den tatsächlich installierten direkten Manifesten erzeugt und bei fehlenden Metadaten nicht
teilweise überschrieben.

## Verwandte Seiten

- [Architektur-Überblick](./ueberblick.md)
- [Build](../entwicklung/build.md)
- [Tests](../entwicklung/tests.md)
- [Secrets und Sicherheit](../konfiguration/secrets-und-sicherheit.md)
