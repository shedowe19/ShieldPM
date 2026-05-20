# Performance & Code Optimierungen

## Zweck

Dokumentation der Performance-Optimierungen im Frontend und Backend vom 20. Mai 2026.

## Kontext

Im Rahmen eines Audits wurden mehrere Bereiche identifiziert, die sich negativ auf die Ladezeiten, Bundle-Größen und API-Response-Zeiten ausgewirkt haben.

## Wichtige Entscheidungen

1. **React Query Caching:** Standardmäßige `staleTime` auf 30 Sekunden gesetzt und `refetchOnWindowFocus` deaktiviert, um Backend-Requests zu verringern (`App.tsx`).
2. **Vite Bundle Splitting:** Schwere Bibliotheken (wie `recharts`, `react-simple-maps`, `d3`) wurden in den separaten Chunk `vendor-charts` ausgelagert, um den initialen Seitenaufbau zu beschleunigen (`vite.config.ts`).
3. **Backend Compression:** Express nutzt nun die `compression` Middleware, um große API-Responses (JSON, Logs) mittels GZIP/Brotli zu verkleinern (`app.js`).
4. **Nginx Reload Optimierung:** Wie in den `.cursorrules` gefordert, wurde der blockierende `nginx -tq` Test vor jedem Config-Reload entfernt. Dadurch wird das Speichern von Proxy-Hosts nicht mehr blockiert und ist signifikant schneller (`internal/nginx.js`).

## Verwandte Seiten

- [Architektur-Entscheidungen](./README.md)
