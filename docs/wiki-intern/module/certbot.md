# Certbot

## Zweck

Automatisierte Beantragung und Erneuerung von Let's Encrypt Zertifikaten.

## Kontext

ShieldPM abstrahiert Let's Encrypt via Certbot. Dieses Modul kümmert sich um die Ausführung von Certbot-Befehlen, DNS-Challenges und die Verwaltung der Account-Registrierung.

## Wichtige Dateien

- `backend/internal/certbot.js` (10 KB) — Certbot-Ausführung und Management
- `backend/internal/certificate.js` — Nutzt `certbot.js` für Zertifikate
- `backend/certbot/` — Certbot-Hilfsdateien (z. B. DNS-Plugins)

## Verhalten

- Generiert Let's Encrypt Account-Keys.
- Beantragt Zertifikate via HTTP-01 oder DNS-01 Challenge.
- Erneuert ablaufende Zertifikate asynchron.

## Abhängigkeiten

- `certbot` (CLI-Tool im Docker-Container)
- `internal/nginx.js` — Temporäre Nginx-Config für HTTP-Challenges

## Verwandte Seiten

- [Zertifikate](./zertifikate.md)
- [Modulübersicht](./README.md)
