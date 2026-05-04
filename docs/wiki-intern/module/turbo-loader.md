# Turbo-Loader

## Zweck

Turbo-Loader ist ein Download-Beschleuniger, der HTTP Range-Requests nutzt, um Dateien in **8 gleich großen Chunks parallel** herunterzuladen — ohne Zwischenproxys, direkt vom Backend-Server.

## Kontext

Standard-Browser-Downloads sind Single-Connection, serielle Prozesse. Turbo-Loader teilt die Datei in 8 Segmente auf und lädt jedes Segment gleichzeitig, was bei großen Dateien zu **dramatisch höheren Durchsätzen** führt.

### Voraussetzungen

- Backend-Server muss **HTTP Range-Requests** (`Accept-Ranges: bytes`) unterstützen
- Dateien, für die Turbo aktiviert werden soll, müssen einen der bekannten Dateityp-Suffixe haben
- `turbo_loader`-Flag im Proxy-Host muss aktiv sein

## Wichtige Dateien

| Datei                                                   | Beschreibung                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `rootfs/html/turbo_loader.html`                         | Frontend-UI — Single-HTML-Datei, komplett eigenständig              |
| `backend/models/proxy_host.js`                          | `turbo_loader`-Feld im Objection.js-Modell (bool-Int-Konvertierung) |
| `backend/migrations/20260409000000_add_turbo_loader.js` | Datenbank-Migration — fügt `turbo_loader INTEGER DEFAULT 0` hinzu   |
| `backend/templates/_proxy_logic.conf`                   | Nginx-Interception-Logik (Rewrites, interne Location)               |

## Verhalten

### 1. Nginx-Interception

Wenn `turbo_loader` im Proxy-Host aktiv ist, fügt Nginx folgende Logik ein:

```nginx
# Nur aktiv für bekannte große Dateitypen
set $do_turbo 0;
if ($uri ~* \.(mp4|mkv|zip|iso|bin|rar|tar|gz|7z)$) {
    set $do_turbo 1;
}
# Explicit ?turbo=0 deaktiviert Turbo für diese Anfrage
if ($arg_turbo = "0") {
    set $do_turbo 0;
}
if ($do_turbo = 1) {
    rewrite ^ /_turbo_loader last;
}
```

Die Rewrite-Checkpoints:

- Nur Dateien mit Endungen `.mp4`, `.mkv`, `.zip`, `.iso`, `.bin`, `.rar`, `.tar`, `.gz`, `.7z`
- Query-Parameter `?turbo=0` erzwingt Standard-Download
- Die `/_turbo_loader`-Location ist `internal` — von außen nicht erreichbar

### 2. Frontend — Chunk-Download

Das Frontend `turbo_loader.html` läuft vollständig im Browser:

1. **Initialisierung** — `HEAD`-Request ermittelt Dateigröße und prüft `Accept-Ranges`
2. **Fallback-Erkennung** — File System Access API verfügbar (Chrome/Edge → Direct-to-Disk) oder Blob-RAM-Fallback (Firefox, Brave Shields etc.)
3. **8 parallele Chunk-Downloads** — Jeder Chunk wird als `bytes=START-END` Range-Request geladen
4. **Fehlerresilienz** — Chunk-Downloads werden unbegrenzt wiederholt mit exponentieller Backoff (1s → 2s → 4s → max 30s)
5. **Direktes Schreiben** — Bei File System Access API wird jeder Chunk sofort auf Disk geschrieben (Stream Write)
6. **Zusammenführung** — Im Blob-Fallback werden alle Chunks im RAM zusammengeführt, danach erscheint ein "Save"-Button

### 3. Speichermodi

| Modus          | Browser                                  | Limit                             | Verhalten                                                      |
| -------------- | ---------------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| Direct-to-Disk | Chrome/Edge (mit File System Access API) | Keins                             | Jeder Chunk wird sofort auf Disk geschrieben                   |
| Blob-RAM       | Firefox, Brave Shields, Safari           | ~512 MB warnt, >1.2 GB hard block | Datei wird komplett im RAM gepuffert, dann "Save"-Button       |
| Iframe-Schutz  | Alle                                     | —                                 | Erkennt Einbettung in Hidden-Iframe → sofort Standard-Download |

### 4. Edge Cases

- **Brave Shields** — Blockieren `showSaveFilePicker`, Trigger für RAM-Fallback
- **Dateien >1.2 GB im Blob-Modus** — Hard Block, Standard-Download vorgeschlagen
- **Server gibt 404** — Erkannt in der `init()`-Phase, zeigt "Standard Download"-Button
- **Server gibt 200 statt 206** — Range-Request wird verworfen, Download ab `chunkGot` fortgesetzt
- **Stream bricht ab** — Unbegrenzte Retries mit Byte-Range-Resume innerhalb des Chunks

## Konfiguration

### Pro Proxy-Host aktivieren

```js
// backend/models/proxy_host.js
const boolFields = [
  // ...
  "turbo_loader", // ← Boolean im JS, INTEGER(0/1) in DB
];
```

In der Admin-UI: Proxy-Host bearbeiten → `turbo_loader`-Toggle.

### Nginx-Template-Integration

`backend/templates/_proxy_logic.conf` erzeugt bei aktiviertem `turbo_loader`:

```nginx
location = /_turbo_loader {
    internal;
    root /html;
    try_files /turbo_loader.html =404;
    add_header Cache-Control "no-store, no-cache, must-revalidate";
}
```

Diese Location liefert das UI und fungiert als Proxy für den eigentlichen Download.

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Nginx-Engine](./nginx-engine.md)
- [Host-Hilfslogik](./host.md)
- [Modulübersicht](./README.md)
