# Offene Fragen

## Zweck

**Zentrale Sammelseite** aller offenen Fragen, Unsicherheiten und TODOs aus dem internen Wiki. Einzelne Modul-Seiten verlinken hierhin, statt eigene "Offene Fragen"-Listen zu führen — so gibt es genau einen Ort für die Übersicht.

## Konventionen

- `TODO:` — Muss noch untersucht werden
- `Unklar:` — Aus dem Code nicht eindeutig ableitbar
- `Annahme:` — Basiert auf Vermutung, nicht auf Fakten

## Offene Fragen

- TODO: Den freigegebenen Multiarch-Digest aus dem privaten `shieldpm-nginx`-Repository als Repository-Variable
  `SHIELDPM_NGINX_IMAGE` hinterlegen und bei jeder geplanten Baseline-Aktualisierung separat prüfen.
- TODO: Für produktive MySQL-/PostgreSQL-Installationen einen operatorseitigen Backup-/Restore-Runbook-Test etablieren;
  ShieldPM kann externe Datenbanken bewusst nicht durch lokale Dateikopien sichern oder automatisch zurückrollen.
- TODO: End-to-End-Beispiel mit Authentik (Auth-Typ `AUTHENTIK_PROXY`) für [OAuth2-Proxy](./module/oauth2-proxy.md) ergänzen — der Auth-Typ ist parallel zu oauth2-proxy verfügbar, ein konkretes Setup-Beispiel fehlt aber noch.
- TODO: IP-Ranges-Quellen für andere CDNs (z. B. Fastly, Akamai) prüfen ([IP-Ranges](./module/ip-ranges.md)).
- TODO (extern): GitHub Branch Protection/Rulesets für `develop` und Release-Branches im GitHub-Repository aktivieren
  und erforderliche CI-Checks auswählen. Repositorycode kann diese Einstellung nicht setzen.
- TODO (extern): Einen unterstützten unveränderlichen Digest für `ghcr.io/shedowe19/shieldpm-nginx:master` im
  `shieldpm-nginx`-Repository veröffentlichen; erst danach den Base-Image-Tag in diesem Repo ersetzen.
- TODO (Betrieb): Für jede externe MySQL/PostgreSQL-Installation einen nativen Dump-/Restore-Runbook bestätigen.
  Application-Payload-Rollback ersetzt diesen Datenbank-Rollback nicht.

## Gelöste Fragen

### Aktuelle Session

- ~~Provider-Matrix für OAuth2-Proxy~~ → `google` (Default), `github`, `oidc`, `gitlab`, `azure`, `keycloak-oidc` (verdrahtet in `frontend/src/modals/AccessListModal.tsx`); Authentik separat als Auth-Typ `AUTHENTIK_PROXY`. Dokumentiert in [oauth2-proxy.md](./module/oauth2-proxy.md).
- ~~ML-KEM-Modi je `shieldpm-nginx`-Build~~ → Dieses Repo setzt für Hosts mit interner CA nur das Flag `host.use_ml_kem` in `nginx.js`. Die tatsächliche Hybrid-Kex-Liste (X25519MLKEM768 etc.) liegt im separaten `shieldpm-nginx`-Repository. Dokumentiert in [pki.md](./module/pki.md).
- ~~Update-Intervall der Cloudflare-IP-Ranges~~ → `interval_timeout = 6h × IPRT` (Umgebungsvariable, Standard-Multiplikator 1). Manueller Trigger über AI-Tool `renew_ip_ranges`. Dokumentiert in [ip-ranges.md](./module/ip-ranges.md).
- ~~Webhooks für Git-Deploy~~ → Nicht implementiert; Aktualisierung läuft ausschließlich über Polling-Timer pro Host (`git_poll_interval` × `git_poll_unit`, eigener `setInterval` pro Host in `pollingTimers`). Dokumentiert in [git-deploy.md](./module/git-deploy.md).
- ~~Mechanismus der Custom-Locations auf Proxy-Hosts~~ → `nginx.js → renderLocations()` iteriert über `host.locations`, mischt Host-Eigenschaften (Access-List, Zertifikat, SSL/HSTS-Flags), rendert pro Eintrag das Liquid-Template `_proxy_host_custom_location.conf` und konkateniert die Strings. Bei `path === "/"` wird die Default-Location ausgeschaltet. Dokumentiert in [proxy-host.md](./module/proxy-host.md).
- ~~Genauer Mechanismus des Docker Auto-Discovery Label-Formats~~ → Sucht nach `shieldpm.hostname`-Label. Unterstützt Ports, Access-Lists, Booleans und Zertifikats-Provider (`shieldpm.ssl_provider`). Dokumentiert in [docker.md](./module/docker.md).

### Frühere Sessions

- ~~`backend/lib/`~~ → Dokumentiert in [Backend-Lib](./architektur/backend-lib.md).
- ~~Frontend-Module, Modals und Hooks~~ → [Frontend-Internas](./ui/frontend-internas.md).
- ~~`frontend/src/context/`~~ → AuthContext, LocaleContext, ThemeContext → [Frontend-Internas](./ui/frontend-internas.md).
- ~~Frontend-Typen~~ → [Frontend-Internas](./ui/frontend-internas.md).
- ~~Rootfs-Start-/Wartungsskripte~~ → [Rootfs-Referenz](./konfiguration/rootfs.md).
- ~~Wird `liquidjs` parallel zu EJS für Templates verwendet oder nur als Fallback?~~ → Wird nur in `backend/lib/utils.js` importiert, EJS ist der Standard für Nginx-Templates.
- ~~Backend-`dev`-Script~~ → Es gibt kein dediziertes `yarn dev` im `package.json`, `node index-dev.js` wird direkt gestartet.
- ~~Umfang der Backend-Tests in `backend/test/`~~ → Ordner existiert und enthält Tests für `lib/`, `internal/` und Integrationen via Vitest.
- ~~Wie funktioniert die Migration von NPMplus-Daten beim ersten Start?~~ → `rootfs/usr/local/bin/entrypoint.sh` prüft, ob `/data/npmplus` existiert und `/data/shieldpm` fehlt, und führt dann ein `mv` aus.

## Verwandte Seiten

- [Wiki-Pflege](./wiki-pflege.md)
- [Index](./index.md)
- [Security-Modernisierung](./entscheidungen/2026-08-31-security-modernisierung.md)
