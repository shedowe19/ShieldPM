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

- Nutzt die beim Start registrierten ACME-Accounts; die Registrierung erfolgt im Startskript `rootfs/usr/local/bin/launch.sh`.
- Beantragt Zertifikate via HTTP-01 oder DNS-01 Challenge.
- Erneuert ablaufende Zertifikate asynchron.
- Beantragung, manuelle Erneuerung, Timer-Erneuerung und Widerruf teilen sich `runCertbot()` und dieselbe Prozesssperre. Gleichzeitige Aufrufe erhalten einen nachvollziehbaren Validierungsfehler; die Sperre wird bei Erfolg und Fehler freigegeben.
- DNS-Zugangsdaten werden mit Dateimodus `0600` gespeichert. Numerische Propagationszeiten werden für CLI-Argumente in Strings umgewandelt.
- Die gemeinsame Prozesssperre umfasst bei DNS-Ausstellungen auch die Plugin-Installation und das Schreiben der Zugangsdaten; diese Schritte können keine laufende Erneuerung mehr verändern. Auch ein Vorbereitungsfehler gibt die Sperre frei.
- CLI-Argumente für Zugangsdaten und Propagationszeit folgen dem registrierten `full_plugin_name`, einschließlich abweichender Namen wie `dns-mijn-host` und qualifizierter Plugin-Namen. Optionale `credentials_argument`-/`propagation_argument`-Felder können davon abweichen. Eine explizite Propagationszeit `0` wird weitergereicht.
- Provider müssen eigene Einträge im DNS-Register sein; geerbte JavaScript-Namen wie `constructor` sind keine gültigen Plugins. Leere Zugangsdaten werden vor dem Installieren abgewiesen.
- Jeder HTTP-Challenge-Test verwendet einen eindeutigen Testdateinamen, damit gleichzeitige Tests sich nicht gegenseitig löschen. Die Datei wird im `finally`-Block entfernt.
- Der externe HTTP-Test hat einen Socket-Timeout von 15 Sekunden und behandelt Fehler oder abgebrochene Antworten. Die Ziel-URL wird korrekt als Formularfeld kodiert.
- Regressionen: `backend/test/internal/certbot-processing.spec.js` (alle externen Aufrufe gemockt).

## Abhängigkeiten

- `certbot` (CLI-Tool im Docker-Container)
- `internal/nginx.js` — Temporäre Nginx-Config für HTTP-Challenges

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

Die CLI-Zuordnung wird durch das lokale Plugin-Register und gemockte Regressionstests geprüft. Nicht jedes externe DNS-Plugin wurde gegen einen echten Provider installiert oder ausgeführt.

## Verwandte Seiten

- [Zertifikate](./zertifikate.md)
- [Modulübersicht](./README.md)
