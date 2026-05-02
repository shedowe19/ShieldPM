# WireGuard Tunnels

## Zweck

Self-hosted VPN-Tunnels für Zugriff auf Dienste hinter CGNAT/DS-Lite.

## Kontext

WireGuard-Tunnels ermöglichen es, Heimserver über einen VPS mit öffentlicher IP erreichbar zu machen.

## Wichtige Dateien

- `backend/internal/wireguard.js` (19 KB) — Business-Logik
- `backend/models/wireguard_peer.js` (4 KB) — Peer-Modell
- `backend/routes/nginx/wireguard.js` (9 KB) — API-Routen

## Verhalten

- Verwaltet WireGuard-Interface und Peers
- Generiert Konfigurationen für Server und Clients
- Benötigt `NET_ADMIN` und `NET_RAW` Capabilities
- Benötigt `/dev/net/tun` Device-Mount
- IP-Forwarding muss aktiviert sein (`net.ipv4.ip_forward=1`)

## Abhängigkeiten

- `wireguard-tools` — WireGuard-CLI
- `iproute2` — Netzwerk-Konfiguration
- `wireguard-go` — Userspace-Implementierung

## Offene Fragen

- Keine

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
