# Nginx Analytics Routes

## Zweck

API-Routen für detaillierte Nginx-Analytics-Daten.

## Wichtige Dateien

- `backend/routes/nginx/analytics.js` — REST-API-Routen unter `/api/nginx/analytics`
- `backend/internal/analytics.js` — Business-Logik für Traffic-Analyse

## Endpunkte

| Methode | Pfad                                           | Beschreibung |
| ------- | ---------------------------------------------- | ------------ |
| GET     | `/api/nginx/analytics/:hostId?range=…`         | Zeitreihe    |
| GET     | `/api/nginx/analytics/:hostId/summary?range=…` | Summary      |

`range` unterstützt `1h`, `24h`, `7d` und `30d`; fehlende oder ungültige Werte fallen auf `24h` zurück. Die Antwort nutzt stabile JSON-Feldnamen in `camelCase`: Zeitreihen enthalten `timestamp`, `count`, `bytes`, `s2xx` bis `s5xx`; Summaries enthalten `count`, `status2xx` bis `status5xx`, `topCountries`, `topIps`, `topReferers`, `topUserAgents`, `topPaths` und `recentRequests`. Zeitreihen werden bei `7d` serverseitig auf Stunden- und bei `30d` auf Tagespunkte verdichtet. Die 1h-/24h-Zeitreihe liest Minutenaggregate; ab 7d bedient der stabile Teil des Zeitraums die Stundenaggregate aus dem Rollup, während die angeschnittene erste und letzte Stunde sowie der Rand bis zur letzten stabilen Rollup-Stunde aus den Minutenaggregaten kommen. Solange kein Rollup committet ist, bleibt der gesamte Zeitraum auf den Minutenaggregaten. Beide Routen prüfen `analytics:list` oder die aktuell berechtigte Sicht auf den eigenen Host; der globale Analytics-Router unter `/api/analytics` verlangt `analytics:list`.

## Abhängigkeiten

- `internal/analytics.js` — Zugriffsprüfung und Summary aus `AnalyticCount` und `AnalyticsLogs`
- `internal/analytics-rollup.js` — Stundenaggregate für 7d/30d und langreichweitige globale KPIs
- `lib/analytics-query.js` — Aufteilung auf Stunden- und Minutenaggregate
- `lib/analytics-range.js` und `lib/analytics-response.js` — Bereich und API-Serialisierung

## Verwandte Seiten

- [Analytics](../module/analytics.md)
- [API-Überblick](./ueberblick.md)
- [Routen](./routen.md)
