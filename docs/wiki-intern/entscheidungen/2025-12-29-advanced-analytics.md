# ADR: Advanced Analytics v2

## Titel

Einführung eines neuen, datenbankgestützten Analytics-Systems zur Visualisierung von Nginx-Traffic.

## Status

`Akzeptiert` (Implementiert am 29.12.2025 in PR #166)

## Kontext

Die bisherigen Analytics-Funktionen von ShieldPM waren stark limitiert und stützten sich primär auf rohe Nginx-Access-Logs oder unübersichtliche GoAccess-Exporte. Administratoren wünschten sich jedoch aggregierte Metriken (Top-IPs, geblockte WAF-Requests, Bandbreiten-Nutzung pro Host) direkt im Dashboard.

## Entscheidung

Das Analytics-System wurde von Grund auf neu geschrieben (Advanced Analytics v2).

- Nginx wurde so konfiguriert (in vorherigen PRs), dass es strukturiertes JSON-Logging nutzt.
- Ein neues Backend-Modul (`backend/internal/analytics.js`) liest diese Logs asynchron ein und persistiert aggregierte Metriken (Zeitreihen) in der Datenbank (`analytics_logs` Tabelle).
- Das Frontend nutzt diese Daten, um interaktive Graphen (mittels Recharts / Chart.js) und detaillierte Traffic-Tabellen darzustellen.

## Begründung

- **Performance:** Durch die Vorab-Aggregation in der SQLite/MySQL-Datenbank wird vermieden, dass bei jedem Aufruf des Dashboards Gigabytes an rohen Log-Dateien vom Backend geparst werden müssen.
- **Benutzererfahrung:** Visuelle Traffic-Analyse ohne externe Tools (wie Grafana oder Kibana).

## Konsequenzen

### Positiv

- Gewaltiger Mehrwert für das Monitoring von Web-Traffic und DDoS-Angriffen.

### Negativ

- Signifikant erhöhte Schreiblast auf die Datenbank (I/O), da Log-Einträge kontinuierlich in DB-Updates übersetzt werden.
- Die Datenbankgröße wächst deutlich schneller (was später durch automatische Bereinigungs-Jobs adressiert werden musste).

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
