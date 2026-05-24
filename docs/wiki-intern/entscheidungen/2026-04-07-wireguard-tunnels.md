# ADR: Self-Hosted WireGuard Tunnels (ShieldTunnel)

## Titel

Integration eines nativen WireGuard-VPN-Servers zur sicheren Bereitstellung von Backend-Ressourcen.

## Status

`Akzeptiert` (Implementiert am 07.04.2026 in PR #36)

## Kontext

Oftmals befinden sich die von ShieldPM proxifizierten Dienste in abgeschotteten Netzwerken oder Containern, die nicht direkt über das Internet erreichbar sein sollen (oder dürfen). Externe VPN-Lösungen erforderten ein separates Management. Der Bedarf nach einem integrierten, hochperformanten VPN war groß, um "Zero-Trust" Zugänge für Administratoren oder spezifische Clients direkt aus ShieldPM heraus zu verwalten.

## Entscheidung

Ein natives WireGuard-Modul ("ShieldTunnel") wurde entwickelt (`backend/internal/wireguard.js`).
- ShieldPM generiert und verwaltet asymmetrische Schlüssel (Public/Private Keys) für den Server und beliebig viele Peers.
- Die Netzwerk-Interfaces (`wg0`) und iptables/nftables-Routingregeln (Masquerading, MSS-Clamping für MTU 1300/1420) werden direkt vom Backend über Shell-Befehle gesteuert.
- Das Frontend bietet eine UI zur Generierung von Client-Konfigurationen inkl. QR-Code-Scans für mobile Geräte.

## Begründung

- **Performance:** WireGuard operiert direkt im Kernel-Space (bzw. via `wireguard-go` im Userspace für LXC) und ist extrem schnell und ressourcenschonend.
- **Konsolidierung:** Netzwerk-Sicherheit (WAF) und Netzwerk-Zugang (VPN) werden in einer einzigen Kontroll-Ebene (ShieldPM) vereint.

## Konsequenzen

### Positiv
- Administratoren können per Klick VPN-Zugänge für externe Mitarbeiter oder eigene Geräte bereitstellen.

### Negativ
- Kritische Abhängigkeiten auf Host-Ebene (Kernel-Module, `iproute2`, iptables, root-Rechte).
- Schwieriges Fehlerhandling in virtualisierten Umgebungen (Proxmox LXC ohne TUN/TAP-Support), was den Fallback auf `wireguard-go` erforderte.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
