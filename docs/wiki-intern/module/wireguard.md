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
- Die Listen- und Status-Endpunkte begrenzen Live-Daten bei eingeschränkter `wireguard_peers:list`-Sichtbarkeit auf eigene
  Peers. Beide aktualisieren den Live-Status vor dem Datenbankabruf und erhalten dabei denselben Owner-Scope; die
  zurückgelieferte Peer-Liste enthält damit den aktuellen Handshake- und Transferzustand, ohne fremde Peer-Metadaten zu
  verändern. Nur Berechtigungen mit Sichtbarkeit `all` erhalten und aktualisieren Statusdaten fremder Peers.
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

### Peer-Eingaben

Peer-Namen, DNS-Angaben und Allowed-IPs dürfen keine Steuerzeichen oder Zeilenumbrüche enthalten. Allowed-IPs werden als kommaseparierte CIDRs geprüft; Keepalive-Werte müssen ganzzahlig zwischen 0 und 65535 liegen. Diese Prüfung erfolgt auch intern vor dem Schreiben oder der Konfigurationsgenerierung. Dadurch können Peer-Felder keine zusätzlichen `wg-quick`-Direktiven einschleusen. Bereits gespeicherte Namen werden bei der Ausgabe als Serverkommentar zusätzlich von Zeilenumbrüchen bereinigt.

Ein expliziter Keepalive-Wert `0` bleibt erhalten. Die Adressvergabe reserviert die tatsächlich konfigurierte Serveradresse zusätzlich zu den bereits belegten Peer-Adressen.

### Adressvergabe und Laufzeitzustand

Ein Backend-Neustart aktiviert zuvor deaktivierte Peers nicht. Peer-Erstellungen und Änderungen der Servereinstellungen teilen sich eine Warteschlange einschließlich Schlüsselerzeugung und IP-Auswahl. Gleichzeitige Anfragen vergeben dadurch weder identische Client-Adressen noch Adressen aus einem inzwischen ersetzten Subnetz.

Subnetz und Serveradresse verlangen kanonische IPv4-Adressen mit vier Dezimaloktetten. Eine Änderung darf bestehende Peer-Adressen weder aus dem Subnetz ausschließen noch mit der Serveradresse kollidieren. Bei einer Änderung der Interface-Adresse wird das Interface neu gestartet, weil `wg syncconf` diese Adresse nicht aktualisiert. Schlägt auch der Neustart-Fallback fehl, wird der Fehler weitergegeben. Schlüsselbefehle haben ein Zeitlimit und behandeln geschlossene Standardeingabe-Pipes.

Ändern, Löschen, Aktivieren und Deaktivieren beachten die `permission_visibility` ihrer Capability. Downloads privater Peer-Konfigurationen bleiben auf den jeweiligen Eigentümer begrenzt.

### Reihenfolge aller Konfigurationsänderungen

Auch Peer-Änderung, Löschung, Aktivierung und Deaktivierung nutzen dieselbe Warteschlange wie Peer-Erstellung und Servereinstellungen. Sie umfasst jeweils Datenbankänderung, Schreiben von `wg0.conf` und Anwendung auf dem Interface. Eine langsame ältere Änderung kann damit einen später deaktivierten oder gelöschten Peer nicht wieder in die Laufzeitkonfiguration aufnehmen.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Cloudflare Tunnels](./cloudflared.md)
- [Tor Onion Services](./tor.md)
- [DDNS](./ddns.md)
- [Umgebungsvariablen](../konfiguration/umgebungsvariablen.md)
