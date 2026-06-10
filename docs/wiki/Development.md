# Development Guide

This guide matches the current ShieldPM **4.3.2** `develop` branch.

## Toolchain

| Area            | Current value                                  |
| :-------------- | :--------------------------------------------- |
| Package manager | Yarn **4.15.0** via Corepack                   |
| Node runtime    | Node.js 22+                                    |
| Backend         | Express **5.2.1**, ESM modules                 |
| ORM             | Objection **3.1.5** / Knex **3.2.10**          |
| Frontend        | React **^19.2.7**, TypeScript **5.9.3**        |
| Build tool      | Vite **^8.0.10**                               |
| State/query     | TanStack Query **^5.101.0**                    |
| Lint/format     | Biome **^2.4.16**                              |
| Tests           | Vitest backend **^4.1.8**, frontend **^4.1.8** |

## Repository Layout

```text
ShieldPM/
├── backend/      # Express API, routes, models, migrations, OpenAPI schema
├── frontend/     # React/Vite UI, locale files, reusable components
├── rootfs/       # Runtime overlay copied into the Docker image
├── scripts/      # Native/LXC installer and maintenance scripts
├── docs/wiki/    # Public GitHub wiki source
└── Dockerfile    # Multi-stage build using shieldpm-nginx base image
```

## First Setup

Enable Corepack once on the development machine:

```bash
corepack enable yarn
```

Install dependencies separately for backend and frontend:

```bash
cd backend
yarn install

cd ../frontend
yarn install
```

The repository uses `.yarnrc.yml` with `nodeLinker: node-modules` and `enableScripts: true` so native modules such as `better-sqlite3` and `ssh2` can build correctly.

## Running Locally

### Frontend

```bash
cd frontend
yarn dev
```

### Backend

The backend package currently exposes a `test` script. For local runtime experiments, use the container/native launcher where possible, or run the backend entrypoint in a prepared environment:

```bash
cd backend
node index.js
```

The backend listens on `/run/shieldpm.sock` and expects the runtime environment, database, Nginx paths, and `/data` layout to exist. For full-stack testing, Docker/native deployments are usually closer to production than a bare backend process.

## Tests

```bash
cd backend
yarn test

cd ../frontend
yarn test
```

## Build

```bash
docker build -t shieldpm:local .
```

The Dockerfile builds frontend and backend with Yarn 4/Corepack, copies `rootfs/`, installs WireGuard support in the final image, and uses `ghcr.io/shedowe19/shieldpm-nginx:master` as the Nginx/OpenResty base.

## Formatting and Linting

Biome is the unified JS/TS formatter/linter. Use the scripts/workflows already present in the repo; avoid introducing ESLint/Prettier for JS/TS. Markdown wiki files may be formatted with Prettier if needed.

## Documentation Rules

- Public user docs live in `docs/wiki/` and sync to the GitHub Wiki.
- Internal agent/project memory lives in `docs/wiki-intern/` and is not the public wiki.
- Update `backend/schema/` whenever API behavior changes.
- Keep `.version`, `backend/package.json`, and `frontend/package.json` synchronized for releases.

---

[🏠 Home](Home) | [API Documentation](API-Docs) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
