# Stream

## Zweck

Verwaltung von TCP- und UDP-Streams (Layer-4-Forwarding). Ermöglicht das Weiterleiten beliebiger Ports unabhängig vom HTTP-Protokoll.

## Kontext

Streams werden für Dienste verwendet, die nicht über HTTP laufen, z. B. SSH, MQTT, SMTP, DNS, Game-Server, oder beliebige TCP/UDP-Anwendungen. Nginx wird hierfür im Stream-Modus betrieben (siehe `nginx -V` mit `--with-stream`).

## Wichtige Dateien

- `backend/internal/stream.js` (~451 Zeilen) — Business-Logik
- `backend/models/stream.js` — Objection.js-Modell
- `backend/templates/stream.conf` — EJS-Template für `stream { server { ... } }`
- `backend/routes/nginx/streams.js` — REST-API-Routen unter `/api/nginx/streams`
- `backend/lib/access/streams-*.json` — RBAC-Regeln
- `frontend/src/pages/Nginx/Streams/` — UI-Tabelle
- `frontend/src/modals/StreamModal.tsx` — Bearbeitungs-Modal
- `frontend/src/api/backend/createStream.ts`, `deleteStream.ts` — API-Hooks

## Verhalten

1. Benutzer definiert einen Stream mit eingehendem Port (TCP/UDP), Forward-Host, Forward-Port und Protokoll.
2. Optional: TLS-Termination mit Zertifikat, Proxy-Protocol, Bandwidth-Limit.
3. `internal/stream.js` schreibt eine `.conf`-Datei unter `/data/nginx/stream/`, die Nginx im Stream-Kontext lädt.
4. Nginx reload erfolgt debounced.

## Felder (relevant)

- `incoming_port`, `forwarding_host`, `forwarding_port`
- `tcp_forwarding`, `udp_forwarding` — Protokoll-Flags
- `enabled`, `meta` (Custom-Optionen)
- Optional: `certificate_id` für TLS-Termination

## Abhängigkeiten

- `internal/nginx.js` — Config-Generierung und Reload
- `internal/certificate.js` — optionales TLS-Zertifikat
- `internal/audit-log.js` — Protokollierung
- `internal/gitops.js` — automatische Synchronisierung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Nginx-Engine](./nginx-engine.md)
- [Proxy-Host](./proxy-host.md)
- [Modulübersicht](./README.md)
- [Datenmodell](../daten/datenmodell.md)
