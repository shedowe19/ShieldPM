# System-Reports & Versionierung

## Zweck

Erfassung von System-Metriken und Prüfung auf Updates der ShieldPM-Software.

## Kontext

Das System bietet Funktionen zum Erstellen von Berichten über die Nutzung und prüft, ob neue Versionen der Software auf GitHub oder anderen Quellen verfügbar sind.

## Wichtige Dateien

- `backend/internal/report.js` (1 KB) — Generierung von Zusammenfassungen
- `backend/internal/remote-version.js` (2 KB) — Logik zur Prüfung von Updates

## Verhalten

- `report.js` aggregiert Daten wie die Anzahl der Proxy-Hosts, Zertifikate und Benutzer.
- `remote-version.js` ruft periodisch die aktuelle Versionsnummer ab (z.B. über GitHub API oder npm) und vergleicht sie mit der laufenden Instanz.

## Abhängigkeiten

- Axios oder native Fetch-API für Remote-Requests

## Verwandte Seiten

- [Verwaltungsübersicht](./README.md)
