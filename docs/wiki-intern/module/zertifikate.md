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
- Renewal-Check alle `CRT` Stunden (Standard: 23)
- Zertifikate werden unter `/data/tls/` gespeichert
- Unterstützt ECDSA und RSA Schlüsseltypen

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
