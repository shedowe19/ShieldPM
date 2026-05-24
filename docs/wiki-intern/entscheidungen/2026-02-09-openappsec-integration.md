# ADR: OpenAppSec AI WAF Integration

## Titel

Nutzung von OpenAppSec als primäre Web Application Firewall (WAF).

## Status

`Akzeptiert` (Implementiert am 09.02.2026)

## Kontext

Die traditionelle ModSecurity Core Rule Set (CRS) Firewall generierte bei modernen Webapplikationen (wie Nextcloud, Outline) unzählige False Positives. Um eine enterprise-taugliche Sicherheit ohne immensen Konfigurationsaufwand zu bieten, wurde eine moderne Alternative evaluiert.

## Entscheidung

OpenAppSec (eine Machine-Learning basierte WAF) wurde tief in ShieldPM integriert.
- Nginx lädt das OpenAppSec Attachment Module dynamisch via `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE=true`.
- OpenAppSec analysiert Traffic kontextbezogen und blockiert Angriffe proaktiv ohne statische Regex-Signaturen.
- Die native LXC/Bare-Metal Installer-Logik wurde so erweitert, dass der OpenAppSec-Agent systemweit provisioniert wird.

## Begründung

- **Zero-Day Protection:** Die Machine-Learning-Engine erkennt Mutations-Angriffe (z.B. Log4j), die herkömmlichen Signatur-basierten Firewalls entgehen.
- **Reduzierter Wartungsaufwand:** Fast vollständige Eliminierung von False Positives im Vergleich zu ModSecurity CRS v4.

## Konsequenzen

### Positiv
- "Install & Forget"-WAF, die ohne manuelles Exception-Tuning funktioniert.

### Negativ
- Extreme Abhängigkeit vom externen OpenAppSec-Agenten und Cloud-Konnektivität (für Modell-Updates).
- Hoher RAM/CPU Overhead durch die Machine-Learning-Analyse.
- *(Anmerkung: Dies führte später zur parallelen Entwicklung und Integration der "Anubis AI Firewall" als leichtgewichtigere Alternative).*

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
