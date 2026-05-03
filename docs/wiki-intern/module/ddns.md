# DDNS

## Zweck

Dynamic DNS Client für automatische DNS-Aktualisierung bei IP-Wechsel.

## Kontext

Unterstützt Cloudflare, DuckDNS und benutzerdefinierte URLs als DDNS-Provider.

## Wichtige Dateien

- `backend/internal/ddns.js` (8 KB) — DDNS-Update-Logik
- `backend/internal/ddns-provider.js` (4 KB) — Provider-Verwaltung
- `backend/models/ddns_provider.js` (2 KB) — Objection.js-Modell
- `backend/routes/nginx/ddns_providers.js` (3 KB) — API-Routen

## Verhalten

- Periodische Prüfung der öffentlichen IP
- Aktualisiert DNS-Einträge bei Änderung
- Unterstützt IPv4 und IPv6

## Abhängigkeiten

- HTTP-Client für DNS-API-Aufrufe

## Offene Fragen

- Keine

## Verwandte Seiten

- [Cloudflare Tunnels](./cloudflared.md)
- [IP-Ranges](./ip-ranges.md)
- [Proxy-Host](./proxy-host.md)
- [Modulübersicht](./README.md)
