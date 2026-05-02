# Anubis (PoW-Gate)

## Zweck

Bot-Schutz durch Proof-of-Work (PoW) Herausforderungen.

## Kontext

Anubis agiert als Gatekeeper vor bestimmten Proxy-Routen und fordert von Clients das Lösen einer rechenintensiven Aufgabe, bevor die Anfrage an das Backend weitergeleitet wird. Dies schützt vor DDoS und automatisiertem Scraping.

## Wichtige Dateien

- `backend/internal/anubis.js` (5 KB) — Business-Logik
- `rootfs/usr/local/bin/launch.sh` — Conditional Startup von Anubis
- `backend/templates/_proxy_logic.conf` — Proxy-Konfiguration für Anubis

## Verhalten

- Wenn aktiviert (Umgebungsvariable `ANUBIS_ENABLED`), leitet Nginx (Frontend) Anfragen an den Anubis-Service weiter.
- Anubis validiert den Client. Wenn die Validierung fehlschlägt, wird eine PoW-Challenge gesendet.
- Bei erfolgreicher Lösung leitet Anubis die Anfrage an das Nginx-Backend weiter ("Sandwich"-Architektur).

## Abhängigkeiten

- Externer Anubis-Service

## Verwandte Seiten

- [Architektur-Überblick](../architektur/ueberblick.md)
- [Modulübersicht](./README.md)
