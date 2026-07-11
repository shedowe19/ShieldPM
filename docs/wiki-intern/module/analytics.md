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
- `frontend/src/pages/Analytics/AnalyticsMap.tsx` — viewport-gesteuerter Lazy-Loader für die Weltkarte
- `frontend/src/pages/Analytics/AnalyticsMapContent.tsx` — ausgelagerte Kartenvisualisierung
- `frontend/src/components/Analytics/` — Analytics-Visualisierungen

## Verhalten

- Sammelt Traffic-Daten pro Host (Requests, Status-Codes)
- Speichert aggregierte Zähler in `analytic_count`-Tabelle
- GoAccess für erweiterte Analyse auf Port `:91`
- Der Platzhalter der Hostauswahl verwendet die zentrale Locale-Schicht und ist in allen 13 unterstützten Sprachen übersetzt.
- Die Spaltenüberschriften der Tabelle „Letzte Anfragen“ werden ebenfalls über die zentrale Locale-Schicht in allen 13 unterstützten Sprachen ausgegeben.
- Jede neuere Analytics-Aktualisierung verdrängt noch laufende Abfragen, sodass Wechsel von Host, Zeitraum oder Sichtbarkeit keine aktuellen Kennzahlen oder Zeitreihen mit langsamen Altantworten überschreiben können.
- Bei ausgeblendeter Browser-Registerkarte pausiert die Seite ihre Analytics- und Live-Statusabfragen; beim erneuten Sichtbarwerden werden beide Datensätze sofort aktualisiert.
- Datenbank-Statistiken werden über `getDbStats` und damit den zentralen API-Client geladen. Sie folgen dadurch der gemeinsamen Cookie-/CSRF-Übergabe und der einheitlichen 401-Behandlung.
- Der Live-Netzwerkstatus wird ebenfalls über `getAnalyticsStatus` im zentralen API-Client geladen. Damit erhält auch die zweisekündliche Statusabfrage die gemeinsame Cookie-/CSRF-Übergabe sowie die einheitliche 401-Behandlung.
- Eine laufende Live-Aktualisierung sperrt weitere zweisekündliche Statusabfragen bis Status und Datenbankstatistik abgeschlossen sind. Beim Ausblenden wird die Sperre zusammen mit der veralteten Antwort aufgehoben, damit das erneute Sichtbarwerden weiterhin sofort aktuelle Werte anfordert.
- Die Weltkarte bleibt beim Aufruf der Analytics-Route zunächst als lokalisierter Ladezustand sichtbar und lädt ihre
  Visualisierungsabhängigkeiten erst, wenn ihr Bereich bis auf 200 Pixel an den Viewport heranreicht. Damit bleibt die
  Kartenfunktion beim Scrollen verfügbar, ohne den anfänglichen Analytics-Chunk zu belasten.
- Die Recharts-Zeit- und Statuscode-Charts folgen demselben viewport-gesteuerten Muster: `AnalyticsCharts.tsx` hält
  zunächst einen Ladezustand vor und lädt `AnalyticsChartContent.tsx` erst kurz vor dem Sichtbarwerden. Dadurch bleibt
  die Chart-Funktion beim Scrollen vollständig erhalten, ohne den anfänglichen Analytics-Chunk mit Recharts zu belasten.
  Schlägt der Lazy-Import fehl, begrenzt eine lokale `RouteErrorBoundary` den Fehler auf den Chart-Bereich und bietet
  einen lokalisierten Seiten-Reload als Wiederherstellungsaktion an.

## Abhängigkeiten

- `recharts` — Chart-Bibliothek im Frontend
- `react-simple-maps` — Weltkarten-Visualisierung
- GoAccess (optional, externe Binary)

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
