# Analytics

## Zweck

Traffic-Analyse und Echtzeit-Statistiken für Proxy-Hosts.

## Kontext

Bietet detaillierte Einblicke in den Datenverkehr mit Statuscode-Verteilung, Weltkarte und Zeitreihen.

## Wichtige Dateien

- `backend/internal/analytics.js` (14 KB) — Business-Logik
- `backend/models/analytic_count.js` (1 KB) — Zähler-Modell
- `backend/models/analytics_logs.js` (1 KB) — Log-Modell
- `backend/routes/analytics.js` (8 KB) — API-Routen
- `backend/routes/nginx/analytics.js` (3 KB) — Nginx-Analytics-Routen
- `frontend/src/pages/Analytics/` — UI-Seite
- `frontend/src/components/Analytics/` — Analytics-Visualisierungen

## Verhalten

- Sammelt Traffic-Daten pro Host (Requests, Status-Codes)
- Speichert aggregierte Zähler in `analytic_count`-Tabelle
- GoAccess für erweiterte Analyse auf Port `:91`
- Der Platzhalter der Hostauswahl verwendet die zentrale Locale-Schicht und ist in allen 13 unterstützten Sprachen übersetzt.

## Abhängigkeiten

- `recharts` — Chart-Bibliothek im Frontend
- `react-simple-maps` — Weltkarten-Visualisierung
- GoAccess (optional, externe Binary)

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
