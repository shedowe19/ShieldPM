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
  │  │  Vite v8.3   │  │  Node v26+   │  │  Overlay      │   │
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

- Node.js 26 or newer (see `engines` in both `package.json` files; the repository has no `.nvmrc`)
- Yarn Classic 1.22.22 for the committed `yarn.lock` files
- Docker for image builds and container-backed integration tests

## 🏗️ Project Structure

- **/backend**: Node.js API server, database models, and Nginx generation logic.
- **/frontend**: React application (Vite + TypeScript).
- **/rootfs**: Filesystem overlays for the final Docker image.

## 💻 Running Locally

### Backend

1. Navigate to `backend/`.
2. Install dependencies: `yarn install --frozen-lockfile`.
3. Run development server:

   ```bash
   yarn dev
   ```

### Frontend

1. Navigate to `frontend/`.
2. Install dependencies: `yarn install --frozen-lockfile`.
3. Run development server:

   ```bash
   yarn dev
   ```

## 🧪 Testing

The project uses **Vitest** for unit and integration testing. Run these commands in the appropriate directory; the `dev` commands alone do not install or start a full local Nginx/database deployment.

```bash
# Backend Tests
(cd backend && yarn test --run)

# Frontend Tests
(cd frontend && yarn test --run)
```

### TScanner-Projektregeln

TScanner ergänzt neun eingebaute Regeln, vier lokale AST-Prüfungen, Editor-Unterstützung und eine eigenständige
CI-Prüfung mit Leserechten. Das private Entwicklungspaket gelangt nicht ins Produktionsimage. Im Repository-Root:

```bash
yarn --cwd .tscanner install --frozen-lockfile --ignore-scripts --production=false
node scripts/ci/tscanner.mjs --validate
node scripts/ci/tscanner.mjs
yarn --cwd .tscanner test
```

`--branch origin/develop`, `--staged` und `--uncommitted` prüfen geänderte Zeilen. Bestehende Baseline-Fehler bleiben
im vollständigen Bericht sichtbar; auf geänderten Zeilen gelten keine Baseline-Ausnahmen. Neue Fehler und
Scanner-Ausführungsfehler blockieren den Lauf, Hinweise bleiben sichtbar. Die empfohlene VSCode-Extension und Aufgaben
verwenden dasselbe Setup. Die drei lokalen AI-Reviews benötigen eine separat authentifizierte Provider-CLI und einen
ausdrücklichen manuellen Start; sie sind in CI gesperrt und nicht mit Git-Prüfmodi kombinierbar. Die
[vollständige TScanner-Anleitung](./TScanner.md) beschreibt Index-/Arbeitskopie-Schutz, Berichte, Baseline-Review und
die lokale AI-Einrichtung.

## 🐳 Building the Docker Image

To build the full image locally:

```bash
docker build -t shieldpm:local .
```

This multi-stage build will compile the frontend, install backend dependencies, and assemble the final Debian Trixie-based image.

The public English Wiki pages live in `docs/wiki/` and are synchronized to the GitHub Wiki by `.github/workflows/wiki-sync.yml` on eligible pushes. The internal German architecture notes live in `docs/wiki-intern/`.

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
