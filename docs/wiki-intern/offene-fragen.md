# Offene Fragen

## Zweck

**Zentrale Sammelseite** aller offenen Fragen, Unsicherheiten und TODOs aus dem internen Wiki. Einzelne Modul-Seiten verlinken hierhin, statt eigene "Offene Fragen"-Listen zu führen — so gibt es genau einen Ort für die Übersicht.

## Konventionen

- `TODO:` — Muss noch untersucht werden
- `Unklar:` — Aus dem Code nicht eindeutig ableitbar
- `Annahme:` — Basiert auf Vermutung, nicht auf Fakten

## Offene Fragen

- TODO: Die vom nativen Installer in `scripts/install.sh` erzeugte OpenAppSec-`local_policy.yaml` an das Schema der installierten Agent-Version anpassen: Derzeit stehen Inline-Objekte in `policies.default.practices` und `triggers`; das dokumentierte v1beta1-Schema erwartet dort Verweise auf separat definierte Practices und Log-Trigger. Anschließend `open-appsec-ctl --apply-policy`, aktive Policy und Erkennung mit dem Agent prüfen ([OpenAppSec](./module/openappsec.md)).
- TODO: Den Native/LXC-Pfad für das optionale OpenAppSec-Advanced-Modell im Installer überprüfen und funktionsfähig machen. `scripts/install.sh` kopiert das Archiv derzeit nur nach `/etc/cp/conf/open-appsec-advanced-model.tgz` und bestätigt die Modellaktivierung nicht; die OpenAppSec-Anleitung für Linux Embedded beschreibt eine Bereitstellung unter `/advanced-model` sowie Entpacken und einen Agent-Neustart für bestehende Installationen. Die Aktivierung am laufenden Agent nachweisen ([OpenAppSec](./module/openappsec.md)).
- TODO: End-to-End-Beispiel mit Authentik (Auth-Typ `AUTHENTIK_PROXY`) für [OAuth2-Proxy](./module/oauth2-proxy.md) ergänzen — der Auth-Typ ist parallel zu oauth2-proxy verfügbar, ein konkretes Setup-Beispiel fehlt aber noch.
- TODO: IP-Ranges-Quellen für andere CDNs (z. B. Fastly, Akamai) prüfen ([IP-Ranges](./module/ip-ranges.md)).
- TODO: `backend/schema/swagger.json` um die vorhandenen Analytics-, OIDC-, GitOps- und Upload-Relay-Routen ergänzen. Die generierte OpenAPI/Swagger-Ansicht bildet derzeit nicht alle Express-Endpunkte ab ([API-Schemas](./api/schemas.md)).

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
- ~~`frontend/src/modules/`~~ → 3 Module: AuthStore, Permissions, Validations → [Frontend-Internas](./ui/frontend-internas.md).
- ~~`frontend/src/modals/`~~ → Dokumentiert in [Frontend-Internas](./ui/frontend-internas.md).
- ~~`frontend/src/hooks/`~~ → Dokumentiert in [Frontend-Internas](./ui/frontend-internas.md).
- ~~`frontend/src/context/`~~ → AuthContext, LocaleContext, ThemeContext → [Frontend-Internas](./ui/frontend-internas.md).
- ~~`frontend/src/types/`~~ → Dokumentiert in [Frontend-Internas](./ui/frontend-internas.md).
- ~~`rootfs/usr/local/bin/`~~ → Dokumentiert in [Rootfs-Referenz](./konfiguration/rootfs.md).
- ~~Welche Template-Engine rendert die Nginx-Konfiguration?~~ → `backend/lib/utils.js` erzeugt eine LiquidJS-Instanz; `backend/internal/nginx.js` rendert damit die Templates unter `backend/templates/`.
- ~~Backend-`dev`-Script~~ → `backend/package.json` definiert `yarn dev` als `node index-dev.js`; Scheduler und Analytics werden im Entwicklungsmodus gestartet und bei `SIGINT` oder `SIGTERM` beendet. Siehe [lokale Entwicklung](./entwicklung/lokale-entwicklung.md).
- ~~Umfang der Backend-Tests in `backend/test/`~~ → Ordner existiert und enthält Tests für `lib/`, `internal/` und Integrationen via Vitest.
- ~~Wie funktioniert die Migration von NPMplus-Daten beim ersten Start?~~ → `rootfs/usr/local/bin/entrypoint.sh` prüft, ob `/data/npmplus` existiert und `/data/shieldpm` fehlt, und führt dann ein `mv` aus.

## Verwandte Seiten

- [Wiki-Pflege](./wiki-pflege.md)
- [Index](./index.md)
