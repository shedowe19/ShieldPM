# GitOps

## Zweck

Git-basierte Konfigurationssynchronisierung (Backup, Versionierung, Restore).

## Kontext

GitOps ermöglicht es, die gesamte ShieldPM-Konfiguration in einem Git-Repository zu sichern und wiederherzustellen.

## Wichtige Dateien

- `backend/internal/gitops.js` (38 KB) — Haupt-Business-Logik (größtes Modul)
- `backend/internal/git-deploy.js` (11 KB) — Auto-Deploy von Git-Repos
- `backend/routes/gitops.js` (3 KB) — API-Routen

## Verhalten

- Exportiert Konfiguration als JSON/YAML
- Synchronisiert mit Remote-Git-Repository via `isomorphic-git`
- Unterstützt SSH-Keys und HTTPS-Tokens für Authentifizierung
- Git-Deploy: Automatisches Klonen und Deployen von statischen Sites

## Abhängigkeiten

- `isomorphic-git` — Git-Operationen in Node.js
- `archiver` — ZIP-Archivierung für Export
- `js-yaml` — YAML-Serialisierung

## Offene Fragen

- Keine

## Verwandte Seiten

- [Git-Deploy](./git-deploy.md)
- [Modulübersicht](./README.md)
- [Deployment](../entwicklung/deployment.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
