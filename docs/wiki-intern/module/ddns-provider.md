# DDNS-Provider

## Zweck

Schnittstelle zu verschiedenen DDNS (Dynamic DNS) Anbietern.

## Kontext

Das DDNS-Modul nutzt Provider-spezifische Logik, um IP-Adressen zu aktualisieren.

## Wichtige Dateien

- `backend/internal/ddns-provider.js` (4 KB) — Provider-Implementierungen
- `backend/internal/ddns.js` — Hauptlogik, die die Provider aufruft

## Verhalten

- Enthält Logik für Anbieter wie Cloudflare, DuckDNS, Namecheap etc.
- Standardisiert die Aktualisierungsanfragen für das Haupt-DDNS-Modul.

## Abhängigkeiten

- Keine direkten (nutzt Node.js interne Module für Requests)

## Verwandte Seiten

- [DDNS](./ddns.md)
- [Modulübersicht](./README.md)
