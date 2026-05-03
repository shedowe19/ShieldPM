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

- Unklar: Genaue Provider-Matrix für [OAuth2-Proxy](./module/oauth2-proxy.md) (welche Provider sind getestet/empfohlen?)
- TODO: Liste der unterstützten ML-KEM-Modi je `shieldpm-nginx`-Build dokumentieren ([PKI](./module/pki.md))
- Unklar: Konfigurierbares Update-Intervall für Cloudflare-IP-Ranges ([IP-Ranges](./module/ip-ranges.md))
- Unklar: Vorhandensein/Geplant von Webhooks für automatisches Pull in [Git-Deploy](./module/git-deploy.md)
- Unklar: Genauer Mechanismus der Custom-Locations (`custom_locations` Feld auf [Proxy-Host](./module/proxy-host.md))

## Konventionen

- `TODO:` — Muss noch untersucht werden
- `Unklar:` — Aus dem Code nicht eindeutig ableitbar
- `Annahme:` — Basiert auf Vermutung, nicht auf Fakten

## Verwandte Seiten

- [Wiki-Pflege](./wiki-pflege.md)
