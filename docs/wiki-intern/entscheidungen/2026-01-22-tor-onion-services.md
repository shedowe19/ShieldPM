# ADR: Integration von Tor Onion Services

## Titel

Native Unterstützung für die Bereitstellung von Proxy-Hosts als Tor Onion Services (Darknet / Hidden Services).

## Status

`Akzeptiert` (Implementiert am 22.01.2026 in PR #256)

## Kontext

Ähnlich wie bei Cloudflare Tunnels suchen Administratoren nach Wegen, Dienste zu betreiben, ohne IPs zu exponieren oder DNS/Ports konfigurieren zu müssen. Das Tor-Netzwerk bietet mit "Onion Services" eine dezentrale, kryptografisch gesicherte und komplett anonyme Methode, um TCP-Verbindungen (HTTP/HTTPS) zu routen. Die manuelle Konfiguration von `torrc` und das Auslesen der generierten `.onion` Adressen ist jedoch mühsam.

## Entscheidung

Ein Tor-Daemon wurde tief in ShieldPM integriert.

- Ein `TorClient` im Backend (siehe auch Optimierungen vom Mai 2026) kommuniziert über den Tor Control Port (`TCP 9051`), um Onion-Services dynamisch über `ADD_ONION` zu erstellen.
- Proxy-Hosts können in der UI mit einem Schalter als "Tor Onion Service" aktiviert werden.
- Das Backend generiert automatisch den Onion-Hostnamen (v3) und fügt ihn der Nginx-Konfiguration (`server_name`) hinzu, sodass der Proxy-Host parallel über Clearnet und Darknet erreichbar ist.

## Begründung

- **Anonymität & Zensurresistenz:** Erlaubt Nutzern in restriktiven Umgebungen die Bereitstellung von Inhalten, die nicht durch Firewalls (wie die Great Firewall) blockiert werden können.
- **Dezentralität:** Im Gegensatz zu Cloudflare Tunnels gibt es keinen zentralen Anbieter (SPOF), der den Traffic entschlüsseln oder blockieren kann.

## Konsequenzen

### Positiv

- Vollautomatische Generierung kryptografischer `.onion`-Adressen.

### Negativ

- Tor ist signifikant langsamer als Clearnet-Verbindungen.
- Erhöhter Ressourcenverbrauch durch den parallel laufenden Tor-Daemon.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
- [Tor Onion Services](../module/tor.md)
