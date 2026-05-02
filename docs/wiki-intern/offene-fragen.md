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

## Offene Fragen

- Unklar: Wird `liquidjs` parallel zu EJS für Templates verwendet oder nur als Fallback?
- Unklar: Genauer Mechanismus des Docker Auto-Discovery Label-Formats (`backend/internal/docker.js`)
- Unklar: Wie funktioniert die Migration von NPMplus-Daten beim ersten Start?
- Unklar: Backend-`dev`-Script — Gibt es ein `yarn dev` Script oder wird `node index-dev.js` direkt verwendet?
- Unklar: Umfang der Backend-Tests in `backend/test/` — Existiert dieser Ordner überhaupt?

## Konventionen

- `TODO:` — Muss noch untersucht werden
- `Unklar:` — Aus dem Code nicht eindeutig ableitbar
- `Annahme:` — Basiert auf Vermutung, nicht auf Fakten

## Verwandte Seiten

- [Wiki-Pflege](./wiki-pflege.md)
