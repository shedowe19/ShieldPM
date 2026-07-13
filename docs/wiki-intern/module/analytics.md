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
- `frontend/src/pages/Analytics/index.tsx` — URL-gesteuerte Auswahl von Host und Zeitraum
- `frontend/src/pages/Analytics/AnalyticsFilters.tsx` — Host- und Zeitraumfilter der Seitenkopfzeile
- `frontend/src/pages/Analytics/useAnalyticsData.ts` — Summary-/Zeitreihenabfrage mit Sichtbarkeits-, Online- und Backoff-Policy
- `frontend/src/pages/Analytics/useAnalyticsLiveMetrics.ts` — Live-Netzwerk- und Datenbankstatus mit Sichtbarkeits-, Online- und Backoff-Policy
- `frontend/src/pages/Analytics/AnalyticsMap.tsx` — viewport-gesteuerter Lazy-Loader für die Weltkarte
- `frontend/src/pages/Analytics/AnalyticsMapContent.tsx` — ausgelagerte Kartenvisualisierung
- `frontend/src/components/Analytics/` — Analytics-Visualisierungen

## Verhalten

- Sammelt Traffic-Daten pro Host (Requests, Status-Codes)
- Speichert aggregierte Zähler in `analytic_count`-Tabelle. Die Live-Upserts verwenden den nicht-nullbaren, versionierten Konfliktschlüssel aus `aggregation_key`, `aggregation_timestamp` und `aggregation_generation`; globale Zähler behalten dabei `proxy_host_id = NULL`, erhalten aber den Schlüssel `global`.
- Bestehende Analytics-Zeilen bleiben bei der Migration in einer eigenen `legacy:<id>`-Generation erhalten. Dadurch kollidieren sie nicht mit den fortlaufenden Live-Upserts und ihre Zähler werden nicht bei der Schemaumstellung verändert.
- `app.js` bleibt für Analytics nebenwirkungsfrei. Beide Backend-Einstiegspunkte führen zuerst die Datenbankmigrationen aus und initialisieren den Analytics-Tailer erst danach, damit Live-Flushing niemals auf ein vor-migriertes `analytic_count`-Schema schreibt. Die Initialisierung ist idempotent: ein Startup-Retry erzeugt keine weiteren Tailer oder Intervalle; nach einem tatsächlichen Initialisierungsfehler bleibt ein späterer Retry möglich.
- GoAccess für erweiterte Analyse auf Port `:91`
- Der Platzhalter der Hostauswahl verwendet die zentrale Locale-Schicht und ist in allen 13 unterstützten Sprachen übersetzt.
- Die Spaltenüberschriften der Tabelle „Letzte Anfragen“ werden ebenfalls über die zentrale Locale-Schicht in allen 13 unterstützten Sprachen ausgegeben.
- Die aktuelle Host- und Zeitraum-Auswahl steht als `host` und `range` in der Analytics-URL. Aufgerufene Links stellen damit
  denselben Untersuchungszeitraum wieder her; Änderungen der vorhandenen Filter ersetzen den URL-Eintrag, statt bei jeder
  Auswahl einen neuen Browserverlaufseintrag zu erzeugen. Nur die vier unterstützten Zeiträume (`1h`, `24h`, `7d`, `30d`)
  und in der Hostliste sichtbare Hosts werden übernommen. Fehlende oder ungültige Werte werden auf den ersten sichtbaren Host
  und 24 Stunden vereinheitlicht; die vorhandenen serverseitigen Zugriffsprüfungen der Analytics-Endpunkte bleiben maßgeblich.
- Jede neuere Analytics-Aktualisierung verdrängt noch laufende Abfragen, sodass Wechsel von Host, Zeitraum oder Sichtbarkeit keine aktuellen Kennzahlen oder Zeitreihen mit langsamen Altantworten überschreiben können.
- Die Seitenkopfzeile bietet für den aktuell ausgewählten Host und Zeitraum einen lokalisierten Download der bereits geladenen Zeitreihe als CSV. Der Browser erzeugt die Datei ohne zusätzlichen API-Aufruf; sie enthält Zeitstempel, Requests, übertragene Bytes und die 2xx- bis 5xx-Zähler. CSV-Zellen werden auch nach führenden Leerzeichen gegen formelartige Anfangszeichen geschützt, damit selbst fehlerhafte oder manipulierte Zeitstempel beim Öffnen in Tabellenprogrammen nicht als Formel ausgewertet werden. Die Funktion verwendet ausschließlich die bereits serverseitig zugriffsgeprüften Daten der aktuellen Auswahl.
- Das Dashboard zeigt für Benutzer mit `analytics:view` oder `analytics:manage` getrennt die fünf Proxy-Hosts mit den meisten Requests, übertragenen Bytes sowie 4xx- beziehungsweise 5xx-Antworten der letzten 24 Stunden. Die Bandbreitenrangliste formatiert die übertragenen Bytes lokalisiert mit passenden Einheiten. Die serverseitige Richtlinie `analytics:list` akzeptiert dieselben View-/Manage-Berechtigungen; `GET /api/analytics/top-hosts` aggregiert ausschließlich nicht gelöschte, hostgebundene Zähler und liefert bei jeder Sortierung Request-, Byte-, 4xx- sowie 5xx-Zähler. Standardmäßig ordnet der Endpunkt nach Requests; `sort=bytes`, `sort=client_errors` und `sort=server_errors` wählen ausschließlich die fest definierte Bandbreiten-, 4xx- beziehungsweise 5xx-Ordnung. Die 4xx-Rangliste macht fehlgeschlagene oder zurückgewiesene Client-Anfragen unmittelbar sichtbar; jeder Host verlinkt direkt auf seine vorhandene 24-Stunden-Analytics-Ansicht.
- `useAnalyticsData` kapselt diese Summary-/Zeitreihenabfrage einschließlich der Zeitformatierung für Charts. `useAnalyticsLiveMetrics` kapselt die unabhängigen Live-Abfragen für Netzwerkdurchsatz und Datenbankkennzahlen; die Seite behält nur Auswahl und Layout.
- Bei ausgeblendeter Browser-Registerkarte oder Offline-Status pausiert die Seite ihre Analytics- und Live-Statusabfragen. Laufende Abfragen werden dabei für veraltet erklärt, damit sie den unmittelbaren Refresh beim erneuten Sichtbarwerden oder nach einer Wiederverbindung nicht blockieren oder überschreiben können.
- Die manuelle Analytics-Abfrage nutzt dafür dieselbe zentrale Sichtbarkeits- und Online-Prüfung wie die TanStack-Query-Polling-Hooks. Dadurch bleibt die Berechtigung zum nächsten Poll in allen Pfaden konsistent. Nach einem Fehler plant die Summary-/Zeitreihenabfrage ihren nächsten Lauf mit exponentiellem Backoff über `getPollingInterval`; ein erfolgreicher Lauf setzt das Grundintervall zurück.
- Datenbank-Statistiken werden über `getDbStats` und damit den zentralen API-Client geladen. Sie folgen dadurch der gemeinsamen Cookie-/CSRF-Übergabe und der einheitlichen 401-Behandlung.
- Der Live-Netzwerkstatus wird über `getAnalyticsStatus` im zentralen API-Client geladen und bleibt in einem eigenen zweisekündlichen Takt. Datenbankstatistiken werden ebenfalls eigenständig geplant: Sie werden beim ersten zulässigen Abruf sowie nach Sichtbarwerden oder Wiederverbindung sofort geladen und anschließend nur alle 30 Sekunden aktualisiert. Beide Abfragen erhalten damit die gemeinsame Cookie-/CSRF-Übergabe sowie die einheitliche 401-Behandlung.
- Netzwerkstatus und Datenbankstatistiken haben getrennte In-Flight-Sperren, Zeitgeber und exponentielle Backoffs. Ein langsamer Datenbankabruf verzögert daher weder den Netzwerkdurchsatz noch dessen nächsten Zweitakt. Beim Ausblenden oder Offline-Gehen werden beide Zeitgeber entfernt und laufende Antworten als veraltet markiert; nach Reaktivierung starten beide Kennzahlen wieder unmittelbar.
- Die Weltkarte bleibt beim Aufruf der Analytics-Route zunächst als lokalisierter Ladezustand sichtbar und lädt ihre
  Visualisierungsabhängigkeiten erst, wenn ihr Bereich bis auf 200 Pixel an den Viewport heranreicht. Damit bleibt die
  Kartenfunktion beim Scrollen verfügbar, ohne den anfänglichen Analytics-Chunk zu belasten. Schlägt ihre Visualisierung
  fehl, begrenzt eine lokale `RouteErrorBoundary` den Fehler auf den reservierten Kartenbereich; die übrige
  Analytics-Seite bleibt bedienbar.
- Die Recharts-Zeit- und Statuscode-Charts folgen demselben viewport-gesteuerten Muster: `AnalyticsCharts.tsx` hält
  zunächst einen Ladezustand vor und lädt `AnalyticsChartContent.tsx` erst kurz vor dem Sichtbarwerden. Dadurch bleibt
  die Chart-Funktion beim Scrollen vollständig erhalten, ohne den anfänglichen Analytics-Chunk mit Recharts zu belasten.
  Schlägt der Lazy-Import fehl, begrenzt eine lokale `RouteErrorBoundary` den Fehler auf den Chart-Bereich und bietet
  einen lokalisierten Seiten-Reload als Wiederherstellungsaktion an.
- `AnalyticsTopCountries.tsx` kapselt die zuvor in `index.tsx` eingebettete Länderliste. Die Liste behält ihre auf zehn
  Einträge begrenzte Reihenfolge, die relative Balkenbreite und den lokalisierten Leerzustand bei; der Seitencontainer
  behält Auswahl, Datenabruf und Formularzustand.

## Abhängigkeiten

- `recharts` — Chart-Bibliothek im Frontend
- `react-simple-maps` — Weltkarten-Visualisierung
- GoAccess (optional, externe Binary)

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
