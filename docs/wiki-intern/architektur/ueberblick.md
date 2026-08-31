# Architektur-Überblick

## Zweck

ShieldPM ist eine React-/Express-Anwendung mit Objection/Knex-Persistenz und einer transaktional behandelten
Nginx-Konfigurationsengine. Nginx terminiert öffentliche Verbindungen und spricht intern über
`/run/shieldpm.sock` mit dem Backend.

## Schichten

| Schicht          | Verantwortung                                       | Vertrauensgrenze                                          |
| ---------------- | --------------------------------------------------- | --------------------------------------------------------- |
| React/TypeScript | UI, Query-Cache, i18n, Setup-/Auth-Flows            | Browser ist untrusted; Server validiert erneut            |
| Express/Node 24  | Auth, Schema, RBAC, Services, Hintergrundarbeit     | `TRUST_PROXY` bestimmt vertrauenswürdige Forwarded-Header |
| Objection/Knex   | SQLite/MySQL/PostgreSQL, Migrationen, Transaktionen | Owner-/Tenant-Filter vor Paging/Mutation                  |
| Nginx/OpenResty  | TLS, Proxy, WAF/IPS, generierte Hosts               | Candidate wird staged und mit `nginx -t` validiert        |
| Persistenz       | `/data`, externe DB, verschlüsselte Schlüssel       | `/run` ist ephemer; Secrets nicht in GitOps               |

## Mutationsfluss

1. Route validiert Body/Query und authentifiziert den Principal.
2. Internal-Service prüft Capability und Ownership.
3. Datenbankänderung und erforderliche Runtime-Dateien werden vorbereitet.
4. Nginx rendert den vollständigen Kandidaten in Staging und führt `nginx -t` aus.
5. Erst ein gültiger Kandidat wird aktiviert/reloaded.
6. Fehler kompensieren DB und Runtime-Dateien; Audit protokolliert das Ergebnis.

GitOps erweitert dies um ein fsync-gesichertes Recovery-Journal. Analytics verwendet einen eigenen fsync-NDJSON-Spool
plus transaktionales Ledger. Der Shutdown stoppt Produzenten, drainiert In-Flight-Arbeit und schließt Ressourcen in
definierter Reihenfolge.

## Laufzeit und Build

- Node.js 24 LTS, Corepack, repository-pinned Yarn 4, immutable Lockfiles
- Backend ESM/Express, Objection/Knex; SQLite als unterstützter Standard
- Frontend React/TypeScript/Vite, TanStack Query, Tailwind/Radix
- Docker Multi-Stage auf Debian Trixie; Native/LXC über signierte NodeSource-APT-Quelle
- CI prüft zusätzlich eine neuere Node-Runtime und SQLite/MySQL/PostgreSQL-Migrationen

## Wichtige Pfade

| Pfad                                       | Inhalt                                 |
| ------------------------------------------ | -------------------------------------- |
| `/data/shieldpm/database.sqlite`           | Standarddatenbank                      |
| `/data/shieldpm/keys.json`                 | JWT-/Verschlüsselungsschlüssel         |
| `/data/shieldpm/analytics-spool.ndjson`    | Durable Analytics-Spool                |
| `/data/shieldpm/initial-admin-setup-token` | One-Time-Ownership-Token bis zum Claim |
| `/data/nginx/`                             | generierte Configs und Nginx-Logs      |
| `/data/gitops/`                            | lokaler Snapshot/Recovery-Journal      |
| `/run/shieldpm.sock`                       | ephemerer Backend-Unix-Socket          |

## Repository-Grenze

`ShieldPM` enthält App, Templates, Installer und Rootfs-Overlay. Kompilierte Nginx-Module und das Base-Image gehören zu
`shieldpm-nginx`. Ein bewegliches Base-Image kann hier nicht seriös digest-gepinnt werden, bis das externe Repository
einen unterstützten Digest veröffentlicht.

## Verwandte Seiten

- [Datenfluss](./datenfluss.md)
- [Module](./module.md)
- [Externe Abhängigkeiten](./externe-abhaengigkeiten.md)
- [Security-Modernisierung](../entscheidungen/2026-08-31-security-modernisierung.md)
