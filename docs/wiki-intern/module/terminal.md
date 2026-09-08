# Terminal (SSH)

## Zweck

Web-basiertes SSH-Terminal im Browser.

## Kontext

Ermöglicht SSH-Verbindungen direkt über die ShieldPM Web-UI.

## Wichtige Dateien

- `backend/internal/terminal.js` (4 KB) — Business-Logik
- `rootfs/html/terminal/index.html` — Browser-Terminal mit xterm.js

## Verhalten

- WebSocket-basierte Verbindung zwischen Browser und Backend
- Backend verbindet sich via `ssh2` zum Zielhost
- Terminal-Emulation über `@xterm/xterm` im Frontend

Terminal-Hosts werden über die regulären Proxy-Host-Routen mit `forward_scheme: "terminal"` verwaltet. Ein eigenständiger REST-Bereich `terminal-hosts` und eigene `terminal_hosts`-Capabilities existieren nicht; veraltete, unreferenzierte Schemadateien dafür wurden entfernt.

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

### Abbruch und frühe Browser-Ereignisse

WebSocket-Fehler und Schließen-Ereignisse werden bereits vor der asynchronen Host-Abfrage registriert. Trennt sich der Browser während dieser Abfrage, wird danach keine verwaiste SSH-Verbindung eröffnet. Auch während SSH-Handshake und Shell-Erzeugung bleibt der Abbruchzustand maßgeblich.

Frühe gültige Resize-Ereignisse werden bis zur Shell-Erzeugung gespeichert und anschließend angewendet. Fehler der Shell-Streams und WebSocket-Protokollfehler werden behandelt, statt als unbehandelte EventEmitter-Fehler den Backend-Prozess zu beenden.

### Wiederholte Initialisierung

Der Terminal-Service registriert pro HTTP-Server nur einen Upgrade-Listener und einen WebSocket-Server. Wiederholt die Backend-Startsequenz die Initialisierung, bleibt die vorhandene Instanz erhalten; doppelte WebSocket-Upgrades werden dadurch vermieden.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
