# Nginx Analytics Routes

## Zweck

API-Routen für detaillierte Nginx-Analytics-Daten.

## Wichtige Dateien

- `backend/routes/nginx/analytics.js` — REST-API-Routen unter `/api/nginx/analytics`
- `backend/internal/analytics.js` — Business-Logik für Traffic-Analyse

## Endpunkte

| Methode | Pfad                                   | Beschreibung                                     |
| ------- | -------------------------------------- | ------------------------------------------------ |
| GET     | `/api/nginx/analytics/:hostId`         | Detaillierte Host-Analytics abrufen              |
| GET     | `/api/nginx/analytics/:hostId/summary` | Aggregierte Host-Zusammenfassung und Recent Logs |

Die Recent-Logs enthalten zusätzlich HTTP/3- und TLS-Felder (`http3`, `ssl_early_data`, `ssl_sigalg`, `ssl_client_sigalg`), sofern sie im Nginx-JSON-Log vorhanden waren.

## Abhängigkeiten

- `internal/analytics.js` — AnalyticCount und AnalyticsLogs Modelle
- `internal/audit-log.js` — Protokollierung

## Verwandte Seiten

- [Analytics](../module/analytics.md)
- [API-Überblick](./ueberblick.md)
- [Routen](./routen.md)
