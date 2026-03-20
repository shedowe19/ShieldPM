# Backend Modules

This directory contains domain-oriented backend modules.

## Current modules

- `analytics/` — analytics ingestion, retention, authorization checks, and host summary queries

## Migration rule

When moving code out of `backend/internal/`, keep a compatibility re-export in the original file until all imports are updated. This allows incremental refactors without breaking the app.
