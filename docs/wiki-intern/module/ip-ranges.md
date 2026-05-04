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

1. Holt die aktuellen IPv4-Liste (`https://www.cloudflare.com/ips-v4`) und IPv6-Liste (`https://www.cloudflare.com/ips-v6`) per HTTPS, optional über `proxy-agent`.
2. Filtert die Einträge per Regex (`^(\d+\.?){4}\/\d+`) und rendert sie via Liquid in `backend/templates/ip_ranges.conf`.
3. Schreibt das Ergebnis nach `/data/nginx/ip_ranges.conf` und triggert einen Nginx-Reload.

## Konfiguration

- **Update-Intervall**: `interval_timeout = 6h × IPRT` (Umgebungsvariable `IPRT`, ganze Zahl). Ist `IPRT` z. B. `4`, läuft die Aktualisierung alle 24 Stunden.
- **Manueller Trigger**: AI-Tool `renew_ip_ranges` (siehe `backend/internal/ai/tools.js`) ruft `internalIpRanges.fetch()` direkt auf.

## Abhängigkeiten

- `internal/nginx.js` — Reload
- `proxy-agent` — Nutzung des System-Proxies (`HTTP_PROXY`/`HTTPS_PROXY`)
- HTTP(S)-Zugriff zu `cloudflare.com` (Outbound erforderlich)

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Nginx-Engine](./nginx-engine.md)
- [Cloudflare Tunnels](./cloudflared.md)
- [Modulübersicht](./README.md)
