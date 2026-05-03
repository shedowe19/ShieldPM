# Tor Onion Services

## Zweck

Bereitstellung von Diensten über das Tor-Netzwerk als Hidden Services.

## Kontext

Ermöglicht Zugriff auf Proxy-Hosts über `.onion`-Adressen. Nützlich für Privatsphäre und CGNAT-Bypass.

## Wichtige Dateien

- `backend/internal/tor.js` (11 KB) — Business-Logik
- `backend/models/tor_onion.js` (3 KB) — Objection.js-Modell
- `backend/routes/nginx/tor_onion.js` (8 KB) — API-Routen

## Verhalten

- Steuert den Tor-Prozess über `tor-control-port`
- Schreibt Hidden-Service-Konfiguration nach `/data/tor/`
- Liest `hostname`-Datei, um die Onion-Adresse anzuzeigen
- Aktivierung über Umgebungsvariable `TOR_ENABLED`

## Abhängigkeiten

- Tor-Daemon (muss installiert sein)
- `internal/nginx.js` — Config-Generierung

## Offene Fragen

- Keine

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Proxy-Host](./proxy-host.md)
- [Cloudflare Tunnels](./cloudflared.md)
- [WireGuard](./wireguard.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
