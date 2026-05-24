# ADR: Dynamic DNS (DDNS) Client Integration

## Titel

Integration eines systemweiten Dynamic DNS (DDNS) Clients mit IPv6 Dual-Stack Support.

## Status

`Akzeptiert` (Implementiert am 22.01.2026 in PR #252)

## Kontext

Viele Nutzer betreiben ShieldPM an Internetanschlüssen mit dynamischen IP-Adressen (z.B. Heimnetzwerke). Um Domains auf ShieldPM leiten zu können, musste bisher ein externer DDNS-Client (wie ddclient oder ein Router-Script) betrieben werden. Dies stand im Widerspruch zum "All-in-One"-Gedanken von ShieldPM.

## Entscheidung

Ein nativer DDNS-Client wurde in das ShieldPM-Backend integriert.
- Unterstützung für eine Vielzahl von Providern (Cloudflare, DuckDNS, Namecheap, etc.).
- Voller **IPv6 Dual-Stack Support** (gleichzeitiges Update von A und AAAA Records).
- Das System überprüft in konfigurierbaren Intervallen (z.B. 60 Sekunden) die öffentliche IP und pusht Änderungen über die API des jeweiligen Providers.
- Volle Integration in die UI und die GitOps-Sync-Engine.

## Begründung

- **Zentralisierung:** Reduzierung externer Abhängigkeiten für Self-Hoster.
- **Zuverlässigkeit:** Native Integration in ShieldPM stellt sicher, dass SSL-Zertifikate (die oft an funktionierendes DNS gebunden sind) reibungsloser aktualisiert werden können.

## Konsequenzen

### Positiv
- "Out-of-the-box" Lösung für dynamische IPs.

### Negativ
- Wartungsaufwand für die APIs der verschiedenen DDNS-Provider, die sich gelegentlich ändern können.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
