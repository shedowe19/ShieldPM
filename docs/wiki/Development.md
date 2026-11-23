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
verwenden dasselbe Setup und dieselben deterministischen Regeln. Die
[vollständige TScanner-Anleitung](./TScanner.md) beschreibt Index-/Arbeitskopie-Schutz, Berichte, Baseline-Review und
die lokale Editor-Einrichtung.

## 🐳 Building the Docker Image

To build the full image locally:

```bash
docker build -t shieldpm:local .
```

This multi-stage build will compile the frontend, install backend dependencies, and assemble the final Debian Trixie-based image.

The public English Wiki pages live in `docs/wiki/` and are synchronized to the GitHub Wiki by `.github/workflows/wiki-sync.yml` on eligible pushes. The internal German notes live in `llm-wiki/`: the entry point and current state under `llm-wiki/wiki/`, the deep-dive reference under `llm-wiki/wiki/reference/`.

## ?? Releasing

A release is an immutable version tag, not a branch head:

- `develop` builds produce `develop` images for testing and never create a GitHub release.
- A release is published only from a `vX.Y.Z` tag whose value matches `.version` and whose commit is the one that passed CI. The workflow verifies that the tag points at the checked-out commit before it uploads anything.
- `update-shieldpm` follows the latest published release tag by default; `--branch <ref>` is the explicit development path.
- Images and `SHA256SUMS` are signed keylessly with Cosign, and the image digest carries SBOM and provenance attestations. Verification commands are in [SECURITY.md](https://github.com/shedowe19/ShieldPM/blob/develop/SECURITY.md#verifying-releases).

If a release must be withdrawn, delete the GitHub release and the tag, then publish a new patch version. Do not move an existing tag: caches, updater clients and signatures are bound to it.

---

[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
