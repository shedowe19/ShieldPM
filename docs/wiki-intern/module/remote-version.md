# Remote-Version

## Zweck

Prüft auf neue Releases von ShieldPM auf GitHub.

## Kontext

Um Administratoren auf neue Versionen hinzuweisen, ruft das Backend regelmäßig die GitHub API auf, um die aktuelle Version mit dem neuesten Release-Tag zu vergleichen.

## Wichtige Dateien

- `backend/internal/remote-version.js` (2 KB) — Business-Logik und Caching
- `backend/routes/version.js` — API-Endpunkt `/api/version/check`

## Verhalten

- Ruft `https://api.github.com/repos/shedowe19/ShieldPM/releases/latest` auf.
- Speichert nur erfolgreiche Antworten mit gültigem Release-Tag für 24 Stunden im RAM (`cache_timeout`). Fehler bleiben erneut abrufbar; parallele Aufrufe teilen sich dieselbe Anfrage.
- HTTP-Fehler, unterbrochene Antworten, mehr als 1 MiB Daten und eine Gesamtdauer über zehn Sekunden führen zum Fehler. Proxy-Verbindungen und Zeitgeber werden beim Schließen aufgeräumt.
- Der Versionsvergleich berücksichtigt numerische Hauptversionen, Vorabversionen und Build-Metadaten.
- Gibt `current`, `latest` und `update_available` (Boolean) zurück.
- Nutzt `proxy-agent`, falls ein Corporate Proxy konfiguriert ist.

## Abhängigkeiten

- `proxy-agent` — HTTP/HTTPS Proxy Unterstützung
- `../package.json` — Auslesen der aktuellen Version

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
