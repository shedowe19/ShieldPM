# Remote-Version

## Zweck

Prüft auf neue Releases von ShieldPM auf GitHub.

## Kontext

Um Administratoren auf neue Versionen hinzuweisen, ruft das Backend regelmäßig die GitHub API auf, um die aktuelle Version mit dem neuesten Release-Tag zu vergleichen.

## Wichtige Dateien

- `backend/internal/remote-version.js` (2 KB) — Business-Logik und Caching
- `backend/routes/settings.js` — API-Endpunkt `/api/settings/version`

## Verhalten

- Ruft `https://api.github.com/repos/shedowe19/ShieldPM/releases/latest` auf.
- Cached das Ergebnis im RAM für 24 Stunden (`cache_timeout`).
- Gibt `current`, `latest` und `update_available` (Boolean) zurück.
- Nutzt `proxy-agent`, falls ein Corporate Proxy konfiguriert ist.

## Abhängigkeiten

- `proxy-agent` — HTTP/HTTPS Proxy Unterstützung
- `../package.json` — Auslesen der aktuellen Version

## Verwandte Seiten

- [Modulübersicht](./README.md)
