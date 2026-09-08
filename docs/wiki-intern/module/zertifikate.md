# Zertifikate

## Zweck

Verwaltung von SSL/TLS-Zertifikaten (Let's Encrypt, Custom).

## Kontext

ShieldPM automatisiert die Zertifikatsverwaltung über Let's Encrypt (ACME) und unterstützt eigene Zertifikate.

## Wichtige Dateien

- `backend/internal/certificate.js` (27 KB) — Business-Logik
- `backend/internal/certbot.js` (10 KB) — Let's Encrypt Automatisierung
- `backend/internal/pki.js` (7 KB) — Interne CA / ML-KEM
- `backend/models/certificate.js` (3 KB) — Objection.js-Modell
- `backend/routes/nginx/certificates.js` (10 KB) — API-Routen
- `backend/certbot/` — Certbot-Hilfsdateien

## Verhalten

- Zertifikate werden über ACME (Let's Encrypt) automatisch beantragt
- Renewal-Check alle `CRT` Stunden (Standard: 72); gültig sind ganze Werte von 1 bis 596 Stunden. Andere Werte fallen auf den Standard zurück, damit Node.js-Timer nicht überlaufen. Erneute Initialisierung ersetzt den vorhandenen Timer.
- Zertifikate werden unter `/data/tls/` gespeichert
- Unterstützt ECDSA und RSA Schlüsseltypen

## Sicherheits- und Lebenszyklusregeln

- API-Antworten enthalten vorhandene PEM-Dateien als boolesche Metadatenmarker. Private Schlüssel und DNS-Zugangsdaten werden dort und in Zertifikats-Auditdaten nicht zurückgegeben. Expandierte Proxy-Hosts werden ebenfalls von Verbindungsgeheimnissen bereinigt.
- Der berechtigte Zertifikatsdownload liefert weiterhin die erforderlichen Dateien; temporäre ZIPs werden mit Modus `0600` erstellt und nach dem Download gelöscht.
- Client-Zertifikatsausstellung verlangt `certificates:create`; jeder Auftrag nutzt ein eigenes temporäres Verzeichnis. Das öffentliche Root-CA-Zertifikat bleibt ohne Geheimnisse abrufbar.
- Private Schlüssel werden mit Node.js Crypto im Speicher geprüft. Passwortgeschützte Schlüssel scheitern sofort; ein Upload prüft außerdem die Übereinstimmung zwischen Zertifikat und Schlüssel vor der Datenbankänderung.
- Manuelle Erneuerung und erfolgreicher Upload laden Nginx neu, damit es die neuen Dateien verwendet.
- Custom-Uploads schreiben das vollständige Dateipaar zunächst in ein privates Staging-Verzeichnis. Austausch, Reload und Datenbankänderung laufen unter der gemeinsamen Nginx-Konfigurationssperre; scheitert die Aktivierung, wird das vorige Dateipaar wiederhergestellt. Die Datenbank wird erst nach erfolgreichem Reload aktualisiert. Backup-Bereinigungsfehler werden protokolliert, ohne eine bereits erfolgreiche Aktivierung rückgängig zu machen.
- Upload, manuelle Erneuerung und Löschen desselben Zertifikats schließen sich gegenseitig aus. Ein Zertifikatsprovider kann nach Erstellung nicht gewechselt werden, weil damit andere Dateipfade und ein anderer Lebenszyklus verbunden wären.
- IDs werden vollständig als positive sichere Ganzzahlen geprüft; Werte wie `1abc` werden nicht mehr als Zertifikat 1 interpretiert. Mehrere Upload-Dateien für dasselbe PEM-Feld liefern einen Validierungsfehler.
- Erstellungsanfragen verwenden ein eigenes Schema (`certificate-request.json`): Let's Encrypt/interne Zertifikate brauchen mindestens einen gültigen DNS-Namen, DNS-Challenges zusätzlich Provider und nichtleere Zugangsdaten, interne Laufzeiten liegen zwischen 1 und 10 Jahren. Interne Einzelhostnamen und internationale Domainnamen werden unterstützt. Das Antwortschema beschreibt die booleschen PEM-Präsenzmarker getrennt von Eingabedaten.
- Fehlgeschlagene interne Ausstellungen entfernen ihre Teildateien. Scheitert erst das Audit nach erfolgreicher Ausstellung, bleibt das ausgestellte Zertifikat erhalten. Alle erfolgreichen Erstellungsarten lösen den GitOps-Autopush aus.
- Downloadnamen enthalten eine zufällige UUID; fehlende Quelldateien brechen das Archiv ab, statt ein unvollständiges ZIP als erfolgreichen Download zurückzugeben. Fehlerhafte Archive werden entfernt.
- Verwaiste Zertifikatsverweise, manuelle und automatische Erneuerungs-Reloads verwenden dieselbe Nginx-Konfigurationssperre wie Host-Änderungen und Uploads. Beim Löschen werden Host-Verweise zuerst entfernt und die neue Konfiguration geladen, während die bisherigen TLS-Dateien noch existieren. Ein fehlgeschlagener Ladevorgang stellt Host-Felder und Konfigurationsdateien wieder her, behält die Schlüssel und setzt die Löschmarkierung zurück. Erst danach werden Dateien entfernt und das Audit geschrieben.
- Das Löschen von Let's-Encrypt-Zertifikaten reserviert zusätzlich die Certbot-Prozesssperre vor Löschmarkierung und Host-Änderungen. Läuft bereits eine Erneuerung oder Ausstellung, scheitert die Löschanfrage ohne diese Änderungen. Fehler beim anschließenden ACME-Widerruf werden weitergegeben; bereits erfolgreich geladene Host-Abkopplungen bleiben bestehen.
- Das Löschen interner Zertifikate räumt `/data/tls/internal/` auf. Die Bereinigung verwaister Zertifikatsverweise lädt Domains und Zugriffslisten nach, entfernt Konfigurationen deaktivierter Hosts und setzt den erfolgreichen Nginx-Status erst nach dem validierten Reload.
- Zertifikatsdaten werden als GMT interpretiert; der Common Name wird gezielt aus `CN` gelesen, auch wenn im Subject zuerst Länder- oder Organisationsfelder stehen.

## Regressionstests

- `backend/test/internal/certificate-lifecycle.spec.js`
- `backend/test/routes/certificate-issuance-permissions.spec.js`
- `backend/test/schema/certificate-validation.spec.js`

## Abhängigkeiten

- `internal/nginx.js` — Reload nach Zertifikatserneuerung
- `internal/audit-log.js` — Protokollierung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Interne PKI](./pki.md)
- [Access-Lists](./access-lists.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Modulübersicht](./README.md)
