# Projektziele

## Zweck

Dokumentation der übergeordneten Ziele und Designprinzipien von ShieldPM.

## Kontext

Abgeleitet aus README.md, GEMINI.md und der Projektstruktur.

## Hauptziele

1. **Sicherheit als Kernprinzip**: WAF (ModSecurity + OpenAppSec), IPS (CrowdSec), mTLS, 2FA, Anubis-PoW-Gate, OAuth2-Proxy — Sicherheit ist kein Addon, sondern tief integriert.

2. **Moderne Protokolle**: HTTP/3 (QUIC) nativ, Brotli + Zstd Kompression, aktuelle TLS-Standards.

3. **Benutzerfreundlichkeit**: Alles über eine einzige Web-UI steuerbar — von Proxy-Hosts über Tunnels bis hin zu AI-Assistenten.

4. **Multi-Deployment**: Sowohl Docker als auch Native/LXC (Proxmox) gleichermaßen unterstützt.

5. **Erweiterbarkeit**: Plugin-ähnliche Integration neuer Dienste (Cloudflare, WireGuard, Tor, DDNS) ohne Kern-Refactoring.

6. **Internationalisierung**: UI in 13+ Sprachen (bg, de, en, es, it, ja, ko, nl, pl, ru, sk, vi, zh).

7. **Automatisierung**: Docker Auto-Discovery, GitOps-Sync, ChatOps via Telegram, DDNS-Updates.

## Designprinzipien

- **Code ist ESM**: Das gesamte Projekt verwendet ES-Module. Kein `require()`.
- **Daten unter `/data/`**: Alle dynamischen Daten müssen unter `/data/` liegen (Docker-Volume-Vertrag).
- **Objection.js statt Raw SQL**: Datenbankzugriffe nur über den Query-Builder.
- **Debounced Reload**: Nginx wird mit 2s Verzögerung neu geladen, um CPU-Spitzen zu vermeiden.

## Verwandte Seiten

- [Projekt-Überblick](./ueberblick.md)
- [Architektur-Entscheidungen](../architektur/entscheidungen.md)
