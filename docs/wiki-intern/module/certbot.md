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
- Beantragung, manuelle Erneuerung, Timer-Erneuerung und Widerruf teilen sich `runCertbot()` und dieselbe Prozesssperre. Gleichzeitige Aufrufe erhalten einen nachvollziehbaren Validierungsfehler; die Sperre wird bei Erfolg und Fehler freigegeben.
- DNS-Zugangsdaten werden mit Dateimodus `0600` gespeichert. Numerische Propagationszeiten werden für CLI-Argumente in Strings umgewandelt.
- Jeder HTTP-Challenge-Test verwendet einen eindeutigen Testdateinamen, damit gleichzeitige Tests sich nicht gegenseitig löschen. Die Datei wird im `finally`-Block entfernt.
- Der externe HTTP-Test hat einen Socket-Timeout von 15 Sekunden und behandelt Fehler oder abgebrochene Antworten. Die Ziel-URL wird korrekt als Formularfeld kodiert.
- Regressionen: `backend/test/internal/certbot-processing.spec.js` (alle externen Aufrufe gemockt).

## Abhängigkeiten

- `certbot` (CLI-Tool im Docker-Container)
- `internal/nginx.js` — Temporäre Nginx-Config für HTTP-Challenges

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Zertifikate](./zertifikate.md)
- [Modulübersicht](./README.md)
