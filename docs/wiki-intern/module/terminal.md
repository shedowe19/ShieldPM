# Terminal (SSH)

## Zweck

Web-basiertes SSH-Terminal im Browser.

## Kontext

Ermöglicht SSH-Verbindungen direkt über die ShieldPM Web-UI.

## Wichtige Dateien

- `backend/internal/terminal.js` (4 KB) — Business-Logik
- `frontend/src/components/` — xterm.js Integration

## Verhalten

- WebSocket-basierte Verbindung zwischen Browser und Backend
- Backend verbindet sich via `ssh2` zum Zielhost
- Terminal-Emulation über `@xterm/xterm` im Frontend

## Abhängigkeiten

- `ssh2` — SSH-Client
- `ws` — WebSocket-Server
- `@xterm/xterm` — Terminal-Emulator
- `@xterm/addon-fit` — Terminal-Größenanpassung
- `@xterm/addon-web-links` — Klickbare Links

### Zugriff und Verbindungsgrenzen

Nginx setzt für den Terminal-WebSocket einen hostgebundenen HMAC-Token im internen Header `X-ShieldPM-Terminal-Token`. `backend/lib/terminal-access.js` leitet ihn mit Kontexttrennung aus dem vorhandenen persistenten Verschlüsselungsschlüssel ab; der Schlüssel selbst wird nicht übertragen. Nginx überschreibt einen gleichnamigen Client-Header. Der Backend-WebSocket akzeptiert nur gültige Tokens und aktivierte, nicht gelöschte Terminal-Hosts, bevor er SSH-Zugangsdaten liest. Direkte WebSocket-Verbindungen zur Verwaltungs-API umgehen dadurch nicht mehr die Zugriffskontrolle des veröffentlichten Hosts.

Die `/ws`-Location erbt die Basic-Auth- und OIDC-Zugriffskontrolle des Hosts; eine Sonderausnahme für WebSockets ist nicht vorgesehen. Ein Terminal ohne konfigurierte Zugriffskontrolle bleibt entsprechend seiner Host-Konfiguration öffentlich erreichbar.

WebSocket-Nachrichten sind auf 64 KiB begrenzt. Resize-Nachrichten erlauben nur ganzzahlige Dimensionen zwischen 1 und 1000; `ssh2.setWindow()` erhält zuerst Zeilen, dann Spalten. Fehler beim Entschlüsseln der SSH-Zugangsdaten werden innerhalb der Verbindungsfehlerbehandlung abgefangen.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
