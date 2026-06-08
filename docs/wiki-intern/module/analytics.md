# Analytics

## Zweck

Traffic-Analyse und Echtzeit-Statistiken für Proxy-Hosts.

## Kontext

Bietet detaillierte Einblicke in den Datenverkehr mit Statuscode-Verteilung, Weltkarte und Zeitreihen.

## Wichtige Dateien

- `backend/internal/analytics.js` (14 KB) — Business-Logik
- `backend/models/analytic_count.js` (1 KB) — Zähler-Modell
- `backend/models/analytics_logs.js` (1 KB) — Log-Modell
- `backend/migrations/20260608001000_add_analytics_protocol_tls_fields.js` — Detailfelder für HTTP/3 und TLS-Metadaten
- `backend/routes/analytics.js` (8 KB) — API-Routen
- `backend/routes/nginx/analytics.js` (3 KB) — Nginx-Analytics-Routen
- `frontend/src/pages/Analytics/` — UI-Seite
- `frontend/src/components/Analytics/` — Analytics-Visualisierungen

## Verhalten

- Sammelt Traffic-Daten pro Host (Requests, Status-Codes)
- Speichert aggregierte Zähler in `analytic_count`-Tabelle
- GoAccess für erweiterte Analyse auf Port `:91`
- Das Nginx-JSON-Log (`json_analytics` in der Root-`nginx.conf` des `shieldpm-nginx`-Images) enthält zusätzlich NGINX-1.31.x-nahe Felder für HTTP/3 (`http3`), TLS Early Data (`ssl_early_data`) und TLS-Signaturalgorithmen (`ssl_sigalg`, `ssl_client_sigalg`). Nicht unterstützte TLS-Variablen bleiben leer.
- Der vorhandene `upstream_cache_status`-Wert wird durch den neuen Asset-Cache praktisch nutzbar und kann `HIT`, `MISS`, `BYPASS`, `EXPIRED`, `STALE`, `UPDATING` oder `REVALIDATED` enthalten.

## HTTP/3- und TLS-Detailfelder

Die Detailtabelle `analytics_logs` speichert zusätzlich:

| Feld                | Quelle im Nginx-JSON-Log | Zweck                                       |
| ------------------- | ------------------------ | ------------------------------------------- |
| `http3`             | `$http3`                 | Erkennung von HTTP/3-/QUIC-Requests         |
| `ssl_early_data`    | `$ssl_early_data`        | Markierung von TLS-1.3-0-RTT-Early-Data     |
| `ssl_sigalg`        | `$ssl_sigalg`            | TLS-Signaturalgorithmus der Verbindung      |
| `ssl_client_sigalg` | `$ssl_client_sigalg`     | Client-Signaturalgorithmus, falls verfügbar |

`backend/internal/analytics.js` übernimmt diese Felder beim Tailen von `/data/nginx/json_access.log` in den Detail-Log-Puffer. Die bestehende Recent-Requests-Abfrage (`select("*")`) liefert sie über die API aus; der Frontend-API-Client wandelt die Feldnamen nach camelCase (`sslEarlyData`, `sslSigalg`, `sslClientSigalg`).

Die Analytics-UI zeigt die Werte in der Tabelle "Recent Requests" als Protokoll-/TLS-Spalten an. 0-RTT wird als Badge dargestellt.

## Abhängigkeiten

- `recharts` — Chart-Bibliothek im Frontend
- `react-simple-maps` — Weltkarten-Visualisierung
- GoAccess (optional, externe Binary)

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Nginx Config Templates](./nginx-templates.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
