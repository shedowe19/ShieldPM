# ADR: Architektur- und Performance-Optimierungen (Mai 2026)

## Titel

Refactoring von Frontend-State-Hooks und Einführung eines Tor TCP Connection Pools.

## Status

`Akzeptiert`

## Kontext

Im Verlauf der Weiterentwicklung wurden Performance-Engpässe an zwei Stellen identifiziert:

1. **Frontend (React):** Die dynamischen Tabellen (`TableWrapper`-Komponenten) wiesen unnötige Re-Renders auf, da Callbacks (`handleDeleteConfirm`) bei jedem Render-Zyklus neu erstellt wurden. Zudem war die strikte Hook-Reihenfolge (Hooks vor Early-Returns) teilweise nicht eingehalten.
2. **Backend (Tor-Integration):** Die Verwaltung von Tor Onion Services öffnete für jede Abfrage und Konfigurationsänderung (`sendCommand`) eine neue Socket-Verbindung zum Tor Control Port (`TCP 9051`), inklusive Authentifizierungs-Overhead. Bei Startprozessen mit vielen Onion-Services führte dies zu Timeouts und Ressourcenverschwendung.

## Entscheidung

### 1. Frontend: Strikte Memoization

In allen `TableWrapper.tsx`-Dateien wurden `useCallback` für Event-Handler und `useMemo` (wo anwendbar) flächendeckend eingeführt. Alle Hooks wurden vor `if (isLoading)` / `if (isError)` verschoben, um die React-Hook-Regeln (`Rules of Hooks`) strikt einzuhalten.

### 2. Backend: TorClient Connection Pool

Die Datei `backend/internal/tor.js` wurde refactored, um eine neue `TorClient`-Klasse zu nutzen:

- **Persistent Socket:** Eine TCP-Verbindung bleibt offen und wird wiederverwendet.
- **Asynchrone Queue:** Da das Tor-Protokoll asynchron antwortet, werden alle eingehenden Befehle in eine `commandQueue` eingereiht und streng sequenziell abgearbeitet.
- **Race Condition Handling:** Authentifizierungs-Handshakes werden über ein `connectPromise` synchronisiert, sodass parallele Anfragen sicher warten.
- **Timeouts:** Falls ein Befehl ins Timeout läuft, wird der Socket zerstört und das System zwingt den Client beim nächsten Aufruf zu einem sauberen Lazy-Reconnect.

### 3. Backend: Array.map Anti-Pattern

Asynchrone `Array.map`-Aufrufe ohne korrekte `Promise.all()`-Synchronisation in `proxy-host.js` und `nginx.js` wurden durch performante asynchrone Schleifen ersetzt, um Race-Conditions in der Nginx-Config-Generierung zu verhindern.

## Begründung

- **Performance & Stabilität:** Die Wiederverwendung der Tor-Verbindung reduziert drastisch Latenzen und CPU-Last beim Booten. Die React-Memoization verhindert UI-Stottern bei vielen Tabelleneinträgen.
- **Fehlerprävention:** Die Reparatur der Hook-Reihenfolge und der async-Maps verhindert schwer reproduzierbare Runtime-Errors (z.B. Nginx-Config-Inkonsistenzen).

## Konsequenzen

### Positiv

- Signifikant schnellerer Bootvorgang des Backends, wenn Tor Onion Services involviert sind.
- Fließendere Frontend-Interaktion, besonders bei der Nutzung von Suchfeldern in Tabellen.

### Negativ

- Die TorClient-Logik ist komplexer als einfache Sockets. Edge-Cases wie Daemon-Neustarts müssen durch die Queue-Abbruch-Logik sicher abgefangen werden (wurde implementiert).

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
- [Tor Onion Services](../module/tor.md)
