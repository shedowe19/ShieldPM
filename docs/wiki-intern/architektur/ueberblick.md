# Architektur-Überblick

## Zweck

Beschreibung der Gesamtarchitektur von ShieldPM und wie die einzelnen Schichten zusammenspielen.

## Kontext

ShieldPM ist eine klassische 3-Schichten-Webanwendung mit einer Nginx-Konfigurationsengine als zentralem Integrationspunkt.

## Schichten

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  React 19 + TypeScript + Vite 8 + Tailwind + shadcn/ui      │
│  State: React Query (TanStack)                               │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────────┐
│                     Backend (Node.js)                         │
│  Express.js 5 + Objection.js/Knex.js                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Routes   │  │ Internal │  │ Models   │  │ Templates│    │
│  │ (API)    │→ │ (Logic)  │→ │ (ORM)    │  │ (EJS)    │    │
│  └──────────┘  └─────┬────┘  └──────────┘  └──────────┘    │
│                       │                                      │
│              ┌────────▼────────┐                             │
│              │   nginx.js      │                             │
│              │ (Config-Engine) │                             │
│              └────────┬────────┘                             │
└───────────────────────┼─────────────────────────────────────┘
                        │ Schreibt .conf Dateien
┌───────────────────────▼─────────────────────────────────────┐
│                     Nginx (OpenResty)                         │
│  HTTP/3 + ModSecurity + CrowdSec (Lua) + OpenAppSec          │
│  /data/nginx/*.conf                                          │
└─────────────────────────────────────────────────────────────┘
```

## Technologie-Stack

### Backend

| Technologie    | Version | Zweck                              |
| -------------- | ------- | ---------------------------------- |
| Node.js        | v26+    | Runtime                            |
| Express.js     | v5.2    | Web-Framework                      |
| Objection.js   | v3.1    | ORM                                |
| Knex.js        | v3.2    | Query-Builder / Migrationen        |
| better-sqlite3 | v12.9   | SQLite-Treiber (Entwicklung)       |
| mysql2         | v3.22   | MySQL/MariaDB-Treiber (Produktion) |
| pg             | v8.20   | PostgreSQL-Treiber (Produktion)    |

### Frontend

| Technologie          | Version | Zweck                   |
| -------------------- | ------- | ----------------------- |
| React                | v19.2   | UI-Framework            |
| TypeScript           | v5.9    | Typsicherheit           |
| Vite                 | v8.0    | Build-Tool              |
| TanStack React Query | v5.100  | Server-State-Management |
| Tailwind CSS         | v3.4    | Styling                 |
| shadcn/ui (Radix)    | aktuell | UI-Komponenten          |
| react-router-dom     | v7.14   | Routing                 |
| Framer Motion        | v12.38  | Animationen             |
| i18next              | v25.10  | Internationalisierung   |

### Infrastruktur

| Technologie       | Zweck                      |
| ----------------- | -------------------------- |
| Nginx (OpenResty) | Reverse Proxy / Web Server |
| ModSecurity       | WAF (CRS v4)               |
| CrowdSec          | IPS (Lua Bouncer)          |
| OpenAppSec        | AI WAF                     |
| Anubis            | PoW-Gate gegen Bots        |
| OAuth2-Proxy      | SSO-Integration            |

## Verzeichnisstruktur

```
ShieldPM/
├── backend/              # Node.js Backend
│   ├── internal/         # Business-Logik (36+ Module)
│   │   └── ai/          # AI-Agent (executor, providers, tools, prompt)
│   ├── models/           # Objection.js Modelle (27 Dateien)
│   ├── routes/           # Express-Routen (16 Dateien + nginx/)
│   ├── migrations/       # Knex-Migrationen (74 Dateien)
│   ├── templates/        # EJS Nginx-Templates (9 Dateien)
│   ├── schema/           # OpenAPI/Swagger Schemas
│   ├── lib/              # Hilfsbibliotheken
│   └── test/             # Tests
├── frontend/             # React Frontend
│   └── src/
│       ├── pages/        # Seiten (13 Bereiche)
│       ├── components/   # Wiederverwendbare Komponenten
│       ├── api/          # React Query Hooks
│       ├── locale/       # i18n (13 Sprachen)
│       ├── modals/       # Dialog-Komponenten
│       └── modules/      # Feature-Module
├── rootfs/               # Docker-Overlay
│   ├── .env.example      # Umgebungsvariablen-Referenz
│   ├── usr/local/bin/    # Startup-Scripts
│   └── etc/              # System-Konfiguration
├── scripts/
│   └── install.sh        # Native/LXC-Installer
├── docs/
│   └── wiki/             # Benutzerdokumentation (englisch)
├── caddy/                # Caddy-Konfiguration
├── Dockerfile            # Multi-Stage Build
├── compose.yaml          # Docker Compose (vollständig)
└── compose.easy.yaml     # Docker Compose (einfach)
```

## Verwandte Seiten

- [Datenfluss](./datenfluss.md)
- [Module](./module.md)
- [Externe Abhängigkeiten](./externe-abhaengigkeiten.md)
- [Projekt-Überblick](../projekt/ueberblick.md)
