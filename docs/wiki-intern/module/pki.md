# Interne PKI

## Zweck

Aufbau und Verwaltung einer **internen Certificate Authority (CA)** für ShieldPM. Stellt eine private Root-CA bereit, die zur Ausstellung interner Server-Zertifikate, mTLS-Client-Zertifikate und Tool-Zertifikate genutzt werden kann.

## Kontext

Die interne PKI dient u. a.:

- Internen Diensten ohne Public-DNS (Lab-/Homelab-Hosts)
- mTLS-Authentifizierung (Access-Lists)
- Self-Signed-Zertifikaten für interne Aufrufe (z. B. Cloudflared, Backend-zu-Backend)
- Optional: Post-Quantum-fähigen Schlüsseln (ML-KEM / Kyber Hybrid Mode)

Die Root-CA und ihre Schlüssel werden im persistenten `/data/`-Volume gespeichert.

## Wichtige Dateien

- `backend/internal/pki.js` (~321 Zeilen) — Business-Logik (Erzeugung Root-CA, Server-Cert, Client-Cert)
- `backend/lib/encryption.js` — kryptografische Helfer
- `backend/internal/certificate.js` — bindet PKI-Zertifikate ans Zertifikatsmodell
- `frontend/src/api/backend/downloadRootCa.ts` — UI-Download der Root-CA

## Verhalten

- Beim ersten Start wird (auf Anforderung) eine Root-CA mit konfigurierbarem Algorithmus erzeugt.
- Server-/Client-Zertifikate werden mit der Root-CA signiert.
- Root-CA kann als `.crt`/`.pem` heruntergeladen werden, um in Browsern oder Clients vertraut zu werden.
- Für ML-KEM/Hybrid-Schlüssel ist eine kompatible OpenSSL-Version (mit oqs-Provider) im `shieldpm-nginx`-Image notwendig.

## Sicherheit

- Private Schlüssel werden niemals geloggt oder ins Wiki/Audit-Log geschrieben.
- Nur die öffentliche Root-CA wird zum Download bereitgestellt.
- Speicherort: `/data/` (Docker-Volume) — nicht in das Git-Repo committen.

## Abhängigkeiten

- Node-Crypto (`node:crypto`) für klassische Algorithmen
- Optional OpenSSL CLI im Backend-Image für ML-KEM-Hybrid (Annahme: nur in `shieldpm-nginx`-Build aktiviert)

## Offene Fragen

- TODO: Genaue Liste unterstützter ML-KEM-Modi je Build-Variante dokumentieren

## Verwandte Seiten

- [Zertifikate](./zertifikate.md)
- [Access-Lists](./access-lists.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Modulübersicht](./README.md)
