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
- Das Löschen interner Zertifikate räumt `/data/tls/internal/` auf. Die Bereinigung verwaister Zertifikatsverweise lädt Domains und Zugriffslisten nach, entfernt Konfigurationen deaktivierter Hosts und setzt den erfolgreichen Nginx-Status erst nach dem validierten Reload.
- Zertifikatsdaten werden als GMT interpretiert; der Common Name wird gezielt aus `CN` gelesen, auch wenn im Subject zuerst Länder- oder Organisationsfelder stehen.

## Regressionstests

- `backend/test/internal/certificate-lifecycle.spec.js`
- `backend/test/routes/certificate-issuance-permissions.spec.js`

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
