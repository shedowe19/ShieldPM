# ADR: Browser Turbo-Loader (Multi-Part Download Injection)

## Titel

Einführung eines clientseitigen Download-Beschleunigers (Turbo-Loader) für große Dateien.

## Status

`Akzeptiert` (Implementiert am 09.04.2026 in PR #39)

## Kontext

Beim Herunterladen extrem großer Dateien (z.B. ISO-Images oder große Backups) über ShieldPM-vermittelte Proxy-Hosts kam es bei instabilen Netzwerkverbindungen häufig zu Abbrüchen oder ineffizienten Single-Thread-Bandbreitenauslastungen. Standard-Browser unterstützen nativ kein aggressives paralleles Herunterladen (Multi-Part).

## Entscheidung

Ein nativer "Browser Turbo-Loader" wurde in Nginx und das Frontend integriert.
- Das Backend injiziert bei bestimmten Datei-Downloads ein spezielles HTML/JS-Snippet (`turbo_loader.html`) in die Antwort.
- Dieses Script nutzt die File System Access API (FSFA) im Browser, um die Datei direkt auf die Festplatte des Nutzers zu schreiben, während es den Download über parallele HTTP Range-Requests (Byte-Chunks) in mehrere Threads aufteilt.
- Das System beinhaltet Fallback-Mechanismen für RAM-Blobs (bei fehlenden FSFA-Rechten) und automatisches Chunk-Retrying bei HTTP/2-Fehlern.

## Begründung

- **Zuverlässigkeit:** Downloads brechen nicht mehr vollständig ab, wenn die Verbindung kurzzeitig ausfällt, sondern nur der aktuelle Chunk wird wiederholt.
- **Performance:** Parallele Range-Requests maximieren die Netzwerkauslastung, insbesondere bei hohen Latenzen.

## Konsequenzen

### Positiv
- ShieldPM wird zu einem hochgradig robusten Gateway für große Dateitransfers (z.B. für private Cloud-Speicher wie Nextcloud).

### Negativ
- Komplexe Interaktion mit Browser-Sicherheitsmechanismen (CORS, Brave Shields, iFrames).
- Risiko von Out-Of-Memory (OOM) Crashes auf Client-Seite, wenn der RAM-Fallback bei extrem großen Dateien (> 1.2 GB) ausgelöst wird.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
