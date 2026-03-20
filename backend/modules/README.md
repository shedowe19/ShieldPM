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
- `dead-host/` — dead-host domain split into reads, mutations, lifecycle, and helpers
- `redirection-host/` — redirection-host domain split into reads, mutations, lifecycle, and helpers
- `ddns/` — DDNS runner split into WAN IP fetch, provider handlers, and timer/process orchestration
- `ddns-provider/` — DDNS provider CRUD/test domain split into reads and mutations
- `cloudflared/` — Cloudflared tunnel lifecycle split into state and service orchestration
- `oauth2-proxy/` — OAuth2 Proxy lifecycle split into process state and service/config orchestration
- `docker/` — Docker auto-discovery split into client/state management and service orchestration
- `maintenance/` — maintenance window runtime split into timer/state and service orchestration
- `audit-log/` — audit log domain split into reads and mutations/add service
- `host/` — shared host domain helpers split into certificate/meta cleanup and hostname/domain checks
- `token/` — token domain split into auth credential issuance, fresh/user token issuance, and auth-session delegation
- `user/` — user domain split into reads, mutations, avatar handling, and shared constants/helpers
- `auth-session/` — auth session domain split into token/session builders, constants, rotation, and revocation service
- `setting/` — setting domain split into reads and update/runtime reconfiguration mutations
- `ai/` — AI domain split into config, model discovery, and chat/tool orchestration facade
- `chat/` — chat integration domain split into helpers, bot state, and bot lifecycle/message orchestration
- `terminal/` — terminal runtime split into websocket/service lifecycle and SSH/session bridge helpers
- `tor/` — onion-service runtime split into config/key helpers and tor lifecycle orchestration

## Migration rule

When moving code out of `backend/internal/`, keep a compatibility re-export in the original file until all imports are updated. This allows incremental refactors without breaking the app.
