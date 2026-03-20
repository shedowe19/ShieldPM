# Backend Modules

This directory contains domain-oriented backend modules.

## Current modules

- `analytics/` — analytics ingestion, retention, authorization checks, and host summary queries
- `auth/` — authentication domain entrypoints and split 2FA submodules (`totp`, `backup-codes`, `yubikey`, `passkeys`, `duo`)
- `proxy-host/` — proxy host domain split into `reads`, `mutations`, `lifecycle`, and shared helpers
- `certificate/` — certificate domain split into `reads`, `mutations`, `downloads`, `renewal`, and shared helpers
- `gitops/` — GitOps domain split into config/helpers, exporter, and sync/import flows
- `git-deploy/` — Git repository sync for path-based proxy hosts, split into config, sync, polling, and helpers
- `nginx/` — nginx domain entrypoint, prepared for later split of config generation, file ops, and reload/test flow
- `access-list/` — access control domain entrypoints for lists, clients, items, and file build lifecycle
- `stream/` — stream domain split into reads, mutations, lifecycle, and helpers

## Migration rule

When moving code out of `backend/internal/`, keep a compatibility re-export in the original file until all imports are updated. This allows incremental refactors without breaking the app.
