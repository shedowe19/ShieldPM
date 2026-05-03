# Cloudflare Tunnels

## Zweck

Integration von Cloudflare Tunnels (cloudflared) für Zero-Trust-Zugriff ohne offene Ports.

## Kontext

Ermöglicht das Exponieren von Diensten über Cloudflare ohne eingehende Portfreigaben im Router.

## Wichtige Dateien

- `backend/internal/cloudflared.js` (4 KB) — Business-Logik
- `backend/models/cloudflared_tunnel.js` (2 KB) — Objection.js-Modell
- `backend/routes/nginx/cloudflared.js` (5 KB) — API-Routen

## Verhalten

- Verwaltet Cloudflare-Tunnel-Konfigurationen in der Datenbank
- Erstellt und verwaltet Tunnel über die Cloudflare API
- Kein offener Port auf dem Host nötig

## Abhängigkeiten

- Cloudflared-Binary (muss verfügbar sein)
- `internal/audit-log.js` — Protokollierung

## Offene Fragen

- Keine

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Proxy-Host](./proxy-host.md)
- [IP-Ranges (Cloudflare-IPs)](./ip-ranges.md)
- [Tor Onion Services](./tor.md)
- [WireGuard](./wireguard.md)
