# Nginx Analytics Routes

## Zweck

API-Routen für detaillierte Nginx-Analytics-Daten.

## Wichtige Dateien

- `backend/routes/nginx/analytics.js` — REST-API-Routen unter `/api/nginx/analytics`
- `backend/internal/analytics.js` — Business-Logik für Traffic-Analyse

## Endpunkte

| Methode | Pfad                                            | Beschreibung |
| ------- | ----------------------------------------------- | ------------ |
| GET     | `/api/nginx/analytics/:hostId/series?range=…`  | Zeitreihe    |
| GET     | `/api/nginx/analytics/:hostId/summary?range=…` | Summary      |

`range` akzeptiert ausschließlich `1h`, `24h`, `7d` oder `30d`. Die Antwort nutzt stabile JSON-Feldnamen in `camelCase`: Zeitreihen enthalten `timestamp`, `count`, `bytes`, `s2xx` bis `s5xx`; Summaries enthalten `count`, `status2xx` bis `status5xx`, `topCountries`, `topIps`, `topReferers`, `topUserAgents`, `topPaths` und `recentRequests`. Sie werden serverseitig für lange Zeiträume auf Stunden- beziehungsweise Tagespunkte verdichtet.

## Abhängigkeiten

- `internal/analytics.js` — AnalyticCount und AnalyticsLogs Modelle
- `internal/audit-log.js` — Protokollierung

## Verwandte Seiten

- [Analytics](../module/analytics.md)
- [API-Überblick](./ueberblick.md)
- [Routen](./routen.md)
