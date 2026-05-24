# ADR: Integration von Cloudflare Tunnels (cloudflared)

## Titel

Native Unterstützung für Cloudflare Tunnels zur Bereitstellung von Proxy-Hosts ohne offene eingehende Ports.

## Status

`Akzeptiert` (Implementiert am 01.01.2026 in PR #195)

## Kontext

Viele Nutzer von ShieldPM betreiben Server in Heimnetzwerken (CGNAT) oder hinter strikten Firewalls, bei denen Port-Forwarding (Port 80/443) nicht möglich oder aus Sicherheitsgründen unerwünscht ist. Bisherige Lösungen erforderten das manuelle Betreiben von separaten `cloudflared`-Containern, was die Konfiguration fragmentierte.

## Entscheidung

Cloudflare Tunnels (`cloudflared`) wurden nativ in das ShieldPM-Ökosystem integriert.

- Administratoren können im Dashboard einen Cloudflare Tunnel-Token hinterlegen.
- Das Backend verwaltet den Lebenszyklus des `cloudflared`-Prozesses.
- Proxy-Hosts können als "Cloudflare Tunnel" markiert werden, wodurch der Nginx-Traffic nahtlos durch den ausgehenden Tunnel zu Cloudflare geroutet wird.

## Begründung

- **Sicherheit & Erreichbarkeit:** Ermöglicht das Bereitstellen von Diensten ins Internet, ohne offene Ports in der Firewall des Servers. Schützt direkt vor direkten IP-Scans und DDoS-Attacken.
- **Benutzererlebnis:** Das Zusammenführen des Zertifikats- und Routingmanagements von ShieldPM mit der Tunnel-Technologie von Cloudflare bietet eine "Ein-Klick"-Lösung für CGNAT-Szenarien.

## Konsequenzen

### Positiv

- ShieldPM kann in restriktiven Netzwerken betrieben werden.
- Geringere Hürde für Einsteiger, die kein NAT-Port-Forwarding konfigurieren wollen/können.

### Negativ

- Bindung an einen proprietären Drittanbieter-Dienst (Cloudflare).
- Erhöhte Komplexität im Prozess-Management des Backends (muss nun den Status des `cloudflared`-Daemons überwachen).

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
