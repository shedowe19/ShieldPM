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
- Host-Firewall-Policies werden vor zugehörigen Proxy-Hosts importiert. Ihre YAML-Daten werden vor dem Persistieren mit derselben Validierung wie die API normalisiert. Volatile Feed-Caches gehören nicht ins Repository; die konfigurierten Quellen werden beim Restore vor Nginx-Render und Reload aktualisiert, während ein vorhandener letzter gültiger Cache bis zum vollständigen Ersatz erhalten bleibt. Fehlt ein Cache für eine nicht erreichbare Quelle, wird kein Reload mit einer leeren Feed-Sperre vorgenommen.

## Abhängigkeiten

- `isomorphic-git` — Git-Operationen in Node.js
- `archiver` — ZIP-Archivierung für Export
- `js-yaml` — YAML-Serialisierung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Git-Deploy](./git-deploy.md)
- [Modulübersicht](./README.md)
- [Deployment](../entwicklung/deployment.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
