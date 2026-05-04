# Einstellungen

## Zweck

Verwaltung von globalen Systemeinstellungen (Standard-Seite, Default-Site, OIDC-Settings, AI-Settings, GitOps-Settings, Anubis-Settings usw.).

## Kontext

Die Anwendung benötigt globale Konfigurationswerte, die in der Datenbank gespeichert und über die API verwaltet werden. Die Werte werden u. a. von der Nginx-Engine, dem AI-Modul und den Login-Routen ausgelesen.

## Wichtige Dateien

- `backend/internal/setting.js` (3 KB) — Business-Logik für Einstellungen
- `backend/models/setting.js` — Einstellungs-Modell
- `backend/routes/settings.js` — REST-API unter `/api/settings`
- `frontend/src/pages/Settings/` — UI mit Tabs (DefaultSite, Ai, GitOps, Layout)

## Verhalten

- `setting.js` ermöglicht das Lesen und Aktualisieren von Systemeinstellungen.
- Einzelne Settings werden per Key gespeichert (z. B. `default-site`, `oidc-config`).
- Nach einer Änderung wird ggf. ein Nginx-Reload oder ein Service-Restart ausgelöst.

## Abhängigkeiten

- Objection.js-Modell `setting.js`
- `internal/audit-log.js` — Protokollierung
- Wird von `internal/nginx.js`, `internal/ai.js`, `internal/gitops.js`, `internal/anubis.js` u. a. gelesen

## Hinweis

Dashboard-Notizen sind ein eigenständiges Feature und werden auf einer separaten Seite dokumentiert: [Dashboard-Notizen](../module/dashboard-notes.md).

## Verwandte Seiten

- [Verwaltungsübersicht](./README.md)
- [Dashboard-Notizen](../module/dashboard-notes.md)
- [Audit-Log](./audit-log.md)
- [Modulübersicht](../module/README.md)
