# Offene Fragen

## Zweck

Sammlung offener Fragen und Unsicherheiten, die aus dem Code nicht eindeutig abgeleitet werden können.

## Gelöste Fragen (aus Scan beantwortet)

- ~~`backend/lib/`~~ → Dokumentiert in [Backend-Lib](./architektur/backend-lib.md)
- ~~`frontend/src/modules/`~~ → 3 Module: AuthStore, Permissions, Validations → [Frontend-Internas](./ui/frontend-internas.md)
- ~~`frontend/src/modals/`~~ → 21 Modals (19 + index + DeleteConfirm) → [Frontend-Internas](./ui/frontend-internas.md)
- ~~`frontend/src/hooks/`~~ → 32 Custom-Hooks → [Frontend-Internas](./ui/frontend-internas.md)
- ~~`frontend/src/context/`~~ → AuthContext, LocaleContext, ThemeContext → [Frontend-Internas](./ui/frontend-internas.md)
- ~~`frontend/src/types/`~~ → enums.ts (8 KB) → [Frontend-Internas](./ui/frontend-internas.md)
- ~~`rootfs/usr/local/bin/`~~ → 9 Scripts dokumentiert in [Rootfs-Referenz](./konfiguration/rootfs.md)
- ~~Wird `liquidjs` parallel zu EJS für Templates verwendet oder nur als Fallback?~~ → Wird nur in `backend/lib/utils.js` (und evtl. Notifications) importiert, EJS ist der Standard für Nginx-Templates.
- ~~Genauer Mechanismus des Docker Auto-Discovery Label-Formats~~ → Dokumentiert: Sucht nach `shieldpm.hostname` Label. Unterstützt Ports, Access-Lists, Booleans und Zertifikats-Provider (`shieldpm.ssl_provider`).
- ~~Backend-`dev`-Script~~ → Es gibt kein dediziertes `yarn dev` im package.json, `node index-dev.js` wird direkt gestartet.
- ~~Umfang der Backend-Tests in `backend/test/`~~ → Ordner existiert und enthält Tests für `lib/`, `internal/` und Integrationen via Vitest.
- ~~Wie funktioniert die Migration von NPMplus-Daten beim ersten Start?~~ → Wird im `rootfs/usr/local/bin/entrypoint.sh` Skript durchgeführt. Das Skript prüft, ob `/data/npmplus` existiert und `/data/shieldpm` fehlt, und führt dann ein `mv` aus.

## Offene Fragen

- TODO: End-to-End-Beispiel mit Authentik (Auth-Typ `AUTHENTIK_PROXY`) für [OAuth2-Proxy](./module/oauth2-proxy.md) ergänzen.
- TODO: IP-Ranges-Quellen für andere CDNs (z. B. Fastly, Akamai) prüfen ([IP-Ranges](./module/ip-ranges.md)).

## In dieser Session beantwortet

- ~~Provider-Matrix für OAuth2-Proxy~~ → google, github, oidc, gitlab, azure, keycloak-oidc (verdrahtet in `frontend/src/modals/AccessListModal.tsx`); Authentik separat als `AUTHENTIK_PROXY`. Dokumentiert in [oauth2-proxy.md](./module/oauth2-proxy.md).
- ~~ML-KEM-Modi je Build~~ → Dieses Repo setzt nur `host.use_ml_kem` für interne Zertifikate; tatsächliche Hybrid-Kex-Liste liegt im `shieldpm-nginx`-Repo. Dokumentiert in [pki.md](./module/pki.md).
- ~~Update-Intervall der Cloudflare-IP-Ranges~~ → `interval_timeout = 6h × IPRT` (Umgebungsvariable). Dokumentiert in [ip-ranges.md](./module/ip-ranges.md).
- ~~Webhooks für Git-Deploy~~ → Nicht implementiert; Aktualisierung läuft per Polling-Timer pro Host (`git_poll_interval` × `git_poll_unit`). Dokumentiert in [git-deploy.md](./module/git-deploy.md).
- ~~Mechanismus der Custom-Locations~~ → `nginx.js → renderLocations()` rendert pro Eintrag das Liquid-Template `_proxy_host_custom_location.conf`, mischt Host-Eigenschaften und konkateniert die Strings. Dokumentiert in [proxy-host.md](./module/proxy-host.md).

## Konventionen

- `TODO:` — Muss noch untersucht werden
- `Unklar:` — Aus dem Code nicht eindeutig ableitbar
- `Annahme:` — Basiert auf Vermutung, nicht auf Fakten

## Verwandte Seiten

- [Wiki-Pflege](./wiki-pflege.md)
