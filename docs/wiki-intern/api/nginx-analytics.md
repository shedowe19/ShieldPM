# Nginx Analytics Routes

## Zweck

API-Routen für detaillierte Nginx-Analytics-Daten.

## Wichtige Dateien

- `backend/routes/nginx/analytics.js` — REST-API-Routen unter `/api/nginx/analytics`
- `backend/internal/analytics.js` — Business-Logik für Traffic-Analyse

## Endpunkte

| Methode | Pfad                   | Beschreibung            |
| ------- | ---------------------- | ----------------------- |
| GET     | `/api/nginx/analytics` | Analytics-Daten abrufen |

## Abhängigkeiten

- `internal/analytics.js` — AnalyticCount und AnalyticsLogs Modelle
- `internal/audit-log.js` — Protokollierung

## Verwandte Seiten

- [Analytics](../module/analytics.md)
- [API-Überblick](./ueberblick.md)
- [Routen](./routen.md)
