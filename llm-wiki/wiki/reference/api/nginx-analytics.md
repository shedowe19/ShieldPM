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

`range` unterstützt `1h`, `24h`, `7d` und `30d`; fehlende oder ungültige Werte fallen auf `24h` zurück. Die Antwort nutzt stabile JSON-Feldnamen in `camelCase`: Zeitreihen enthalten `timestamp`, `count`, `bytes`, `s2xx` bis `s5xx`; Summaries enthalten `count`, `status2xx` bis `status5xx`, `topCountries`, `topIps`, `topReferers`, `topUserAgents`, `topPaths` und `recentRequests`. Zeitreihen werden bei `7d` serverseitig auf Stunden- und bei `30d` auf Tagespunkte verdichtet. Beide Routen prüfen `analytics:list` oder die aktuell berechtigte Sicht auf den eigenen Host; der globale Analytics-Router unter `/api/analytics` verlangt `analytics:list`.

Der experimentelle Endpunkt `GET /api/nginx/analytics/flow` liefert eine
begrenzte Topologie und ein 60-Sekunden-Abschlusssample. Er verlangt zusätzlich
zur Analytics-Berechtigung die aktuelle Host-Sichtbarkeit und setzt
`Cache-Control: no-store`. Ohne `TRAFFIC_FLOW_ENABLED=true` ist die Antwort
deaktiviert. Mit zusätzlichem `TRAFFIC_FLOW_LIVE_ENABLED=true`, passender nativer
Nginx-Basis und frischen unterstützten Samples gilt `capabilities.current_rates:
true`; exakte Richtungsraten und Messintervalle kommen aus kumulativen Zählern.
HTTP/1, HTTP/2-Streams, WebSockets und qualifiziertes HTTP/3 sind unterstützt.
HTTP/3 zählt bestätigte Download-/konsumierte Upload-Streambytes; fehlende Qualität
oder unvollständige finale ACK-Abdeckung bleibt `null`. Inkompatible Gruppen
bleiben ohne Summe und liefern getrennte `rate_components`. `sample_complete: false` bleibt wegen UDP und Limits.
Ohne native Quelle bleibt ein Fünfsekunden-Abschlussfallback. Details und Grenzen:
[Analytics](../module/analytics.md#experimenteller-traffic-flow).


## Abhängigkeiten

- `internal/analytics.js` — Zugriffsprüfung und Summary aus `AnalyticCount` und `AnalyticsLogs`
- `lib/analytics-range.js` und `lib/analytics-response.js` — Bereich und API-Serialisierung

## Verwandte Seiten

- [Analytics](../module/analytics.md)
- [API-Überblick](./ueberblick.md)
- [Routen](./routen.md)
