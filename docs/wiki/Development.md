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
  │  │  Vite v7.3   │  │  Node v26+   │  │  Overlay      │   │
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

* Node.js (matching `.nvmrc` or latest LTS)
* Yarn (for Frontend)
* Docker

## 🏗️ Project Structure

* **/backend**: Node.js API server, database models, and Nginx generation logic.
* **/frontend**: React application (Vite + TypeScript).
* **/rootfs**: Filesystem overlays for the final Docker image.

## 💻 Running Locally

### Backend

1. Navigate to `backend/`.
2. Install dependencies: `npm install`.
3. Run development server:

    ```bash
    npm run dev
    ```

### Frontend

1. Navigate to `frontend/`.
2. Install dependencies: `yarn install`.
3. Run development server:

    ```bash
    yarn dev
    ```

## 🧪 Testing

The project uses **Vitest** for unit and integration testing.

```bash
# Backend Tests
cd backend && npm test

# Frontend Tests
cd frontend && npm test
```

## 🐳 Building the Docker Image

To build the full image locally:

```bash
docker build -t shieldpm:local .
```

This multi-stage build will compile the frontend, install backend dependencies, and assemble the final Debian Trixie-based image.

---
[🏠 Home](Home) | [🐞 Report a Bug](https://github.com/shedowe19/ShieldPM/issues)
