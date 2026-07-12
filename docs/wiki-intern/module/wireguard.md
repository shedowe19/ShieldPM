# WireGuard Tunnels

## Zweck

Self-hosted VPN-Tunnels für Zugriff auf Dienste hinter CGNAT/DS-Lite.

## Kontext

WireGuard-Tunnels ermöglichen es, Heimserver über einen VPS mit öffentlicher IP erreichbar zu machen.

## Wichtige Dateien

- `backend/internal/wireguard.js` (19 KB) — Business-Logik
- `backend/models/wireguard_peer.js` (4 KB) — Peer-Modell
- `backend/routes/nginx/wireguard.js` (9 KB) — API-Routen
- `frontend/src/components/Nginx/WireguardConfigModal.tsx` — Dialog für Peer-Konfiguration und QR-Code
- `frontend/src/pages/Nginx/WireguardSettingsCard.tsx` — gekapselte Servereinstellungen mit Query-Invalidierung

## Verhalten

- Verwaltet WireGuard-Interface und Peers
- Generiert Konfigurationen für Server und Clients
- Die Servereinstellungen sind in `WireguardSettingsCard` gekapselt. Nach erfolgreichem Speichern invalidiert sie sowohl
  Einstellungen als auch Peer-Daten; die Listenansicht behält damit ihren Peer- und Dialogzustand unabhängig.
- Der Konfigurationsdialog beschreibt seinen Zweck für Screenreader und lokalisiert QR-Code-Hinweis, Alternativtext und Schließen-Aktion in allen 13 Sprachen.
- Die ausschließlich symbolische Kopier-Schaltfläche hat einen lokalisierten zugänglichen Namen in allen 13 Sprachen und bleibt damit für Screenreader eindeutig bedienbar.
- Die Icon-Aktionen der Peer-Tabelle sowie Aktualisieren und Hilfe verwenden lokalisierte zugängliche Namen. Der Start-/Stopp-Umschalter beschreibt dabei abhängig vom Peer-Status die tatsächlich ausgeführte Aktion.
- Schlägt der Abruf einer Peer-Konfiguration fehl, beendet der Dialog den Ladezustand ohne unbehandelte Promise-Rejection; der Download bleibt deaktiviert.
- Benötigt `NET_ADMIN` und `NET_RAW` Capabilities
- Benötigt `/dev/net/tun` Device-Mount
- IP-Forwarding muss aktiviert sein (`net.ipv4.ip_forward=1`)

### Firewall-Isolation

Die generierte `wg0.conf` kapselt WireGuard-Regeln in eigene `SHIELDPM_WG_*`-Chains für die Tabellen `filter`,
`nat` und `mangle`. Beim Start prüft sie Sprungregeln idempotent und leert ausschließlich diese eigenen Chains vor
dem erneuten Anlegen der benötigten Regeln. `PostDown` entfernt nur die zugehörigen Sprünge und eigenen Chains.
Direkte Regeln älterer Versionen bleiben bei einem Update bewusst unangetastet: Ohne eindeutige Markierung sind sie
nicht sicher von gleichartigen Regeln anderer Firewall-Verwaltungen zu unterscheiden. Built-in-Chains wie `FORWARD`
oder `POSTROUTING` und darin enthaltene fremde Regeln werden weder geleert noch gelöscht.

### Härtung der Servereinstellungen

`PUT /api/nginx/wireguard/settings` akzeptiert ausschließlich `endpoint`, `listen_port`, `subnet` und
`server_address`. Das OpenAPI-Schema begrenzt Port, IPv4-CIDR-Formate, Endpunktform und Zusatzfelder; ungültige
Payloads wie Zeilenumbrüche oder eingeschleuste `PostUp`-Direktiven werden mit HTTP 400 abgewiesen. Die interne
`updateSettings()`-Prüfung wiederholt diese Validierung vor dem Speichern und vor der Generierung von `wg0.conf`.
Sie akzeptiert nur Ports von 1 bis 65535, IPv4-`/24`-CIDRs und Serveradressen im konfigurierten Subnetz. Die
Beschränkung entspricht der aktuellen Peer-Adressvergabe, die die ersten drei IPv4-Oktette als Netzbasis verwendet.
Persistierte, ungültige Einstellungen fallen beim Einlesen sicher auf die Standardwerte zurück.

Beim Start wartet `init()` vor `syncConfig()` auf die Erzeugung der Server-Schlüssel. IPv6-Endpunkte werden bei der
Client-Konfiguration mit eckigen Klammern formatiert, damit der Port eindeutig bleibt.

## Abhängigkeiten

- `wireguard-tools` — WireGuard-CLI
- `iproute2` — Netzwerk-Konfiguration
- `wireguard-go` — Userspace-Implementierung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Cloudflare Tunnels](./cloudflared.md)
- [Tor Onion Services](./tor.md)
- [DDNS](./ddns.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
