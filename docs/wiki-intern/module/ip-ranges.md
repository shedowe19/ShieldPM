# IP-Ranges (Cloudflare-IPs)

## Zweck

Aktualisiert regelmäßig die offiziellen [Cloudflare-IP-Ranges](https://www.cloudflare.com/ips/) und stellt sie Nginx als `set_real_ip_from`-Liste zur Verfügung. So sieht Nginx auch hinter Cloudflare die echte Client-IP.

## Kontext

Wenn ShieldPM hinter Cloudflare betrieben wird (Proxy-Modus), kommen Anfragen aus Cloudflare-IPs. Ohne `real_ip`-Konfiguration würden alle Logs/Filter Cloudflare statt des echten Clients sehen.

## Wichtige Dateien

- `backend/internal/ip_ranges.js` (~116 Zeilen) — Lädt und cached Cloudflare-IP-Listen
- `backend/templates/ip_ranges.conf` — Generiertes Nginx-Snippet mit `set_real_ip_from`-Direktiven
- Aufruf: typischerweise im Backend-Boot-Prozess oder per Maintenance-Task

## Verhalten

1. Holt die aktuellen IPv4- und IPv6-Listen von Cloudflare per HTTP.
2. Schreibt sie in eine Nginx-Include-Datei.
3. Triggert einen Nginx-Reload, falls sich die Liste geändert hat.

## Abhängigkeiten

- `internal/nginx.js` — Reload
- HTTP-Zugriff zu `cloudflare.com` (Outbound erforderlich)

## Offene Fragen

- Unklar: Konfigurierbares Update-Intervall (statisch oder per Setting?)
- TODO: Quellen für andere CDNs (z. B. Fastly, Akamai) prüfen

## Verwandte Seiten

- [Nginx-Engine](./nginx-engine.md)
- [Cloudflare Tunnels](./cloudflared.md)
- [Modulübersicht](./README.md)
