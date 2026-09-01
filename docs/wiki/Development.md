# Development Guide

Want to contribute or build ShieldPM from source? This guide covers the development environment, project structure, and build process.

---

## 🏗️ Project Architecture

```
  ShieldPM Repository
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
  │  │  /frontend   │  │  /backend    │  │  /rootfs      │   │
  │  │  React + TS  │  │  Express.js  │  │  Docker       │   │
  │  │  Vite        │  │ Node 24 LTS │  │  Overlay      │   │
  │  │  Tailwind    │  │  Objection   │  │  Scripts      │   │
  │  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘   │
  │         │                 │                 │            │
  │         │    docker build │                 │            │
  │         ▼                 ▼                 ▼            │
  │  ┌──────────────────────────────────────────────────┐    │
  │  │           Final Docker Image                      │    │
  │  │  Base: ghcr.io/shedowe19/shieldpm-nginx:master    │    │
  │  │  OS: Debian Trixie | Nginx + Modules              │    │
  │  └──────────────────────────────────────────────────┘    │
  └──────────────────────────────────────────────────────────┘
```

---

## 🛠️ Prerequisites

- Node.js 24 LTS (match `.nvmrc`)
- Corepack with the repository-pinned Yarn 4 release (both workspaces)
- Docker

## 🏗️ Project Structure

- **/backend**: Node.js API server, database models, and Nginx generation logic.
- **/frontend**: React application (Vite + TypeScript).
- **/rootfs**: Filesystem overlays for the final Docker image.

## 💻 Running Locally

### Backend

1. Navigate to `backend/`.
2. Enable Corepack and install dependencies: `corepack enable && yarn install --immutable`.
3. Run development server:

   ```bash
   yarn dev
   ```

### Frontend

1. Navigate to `frontend/`.
2. Install dependencies: `yarn install --immutable`.
3. Run development server:

   ```bash
   yarn dev
   ```

## 🧪 Testing

The project uses **Vitest** for unit and integration testing.

```bash
# Backend Tests
cd backend && yarn test

# Frontend Tests
cd frontend && yarn test
```

Run the complete workspace quality gate with `yarn check`. CI also checks lockfile immutability, TypeScript, locale
parity, the production frontend build, backend/frontend unit suites, browser smokes and migration compatibility. Do not
use npm to rewrite Yarn lockfiles.

## 🐳 Building the Docker Image

To build the full image locally:

```bash
export SHIELDPM_NGINX_IMAGE='ghcr.io/shedowe19/shieldpm-nginx@sha256:<approved-multiarch-digest>'
docker build --build-arg SHIELDPM_NGINX_IMAGE="$SHIELDPM_NGINX_IMAGE" -t shieldpm:local .
```

The build intentionally has no moving-tag fallback. Use the reviewed digest configured for the repository or supplied
by the maintainers; do not invent or copy a digest from another build context. The multi-stage build compiles the
frontend, installs backend dependencies, and assembles the final Debian Trixie-based image.

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
