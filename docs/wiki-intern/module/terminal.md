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

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
