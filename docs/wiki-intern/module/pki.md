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

- Beim ersten Start wird (auf Anforderung) eine Root-CA erzeugt. Aktueller Algorithmus laut `pki.js`: **ECDSA P-384 (secp384r1)**, Gültigkeit **10 Jahre**.
- Server-/Client-Zertifikate werden mit der Root-CA signiert (`openssl req` + `openssl x509 -CA …`).
- Root-CA kann als `.crt`/`.pem` heruntergeladen werden, um in Browsern oder Clients vertraut zu werden (Frontend-API: `frontend/src/api/backend/downloadRootCa.ts`).
- Hosts mit `certificate.provider === "internal"` bekommen in `nginx.js` das Flag `host.use_ml_kem = true` gesetzt. Die tatsächliche ML-KEM-/Hybrid-Aktivierung passiert auf Nginx-/OpenSSL-Seite (`shieldpm-nginx`-Image, OpenSSL ≥ 3.5 mit X25519MLKEM768 bzw. oqs-Provider). Die Liste der unterstützten Hybrid-Modi wird durch die Build-Variante des `shieldpm-nginx`-Images bestimmt — siehe Repository [`shieldpm-nginx`](https://github.com/shedowe19/shieldpm-nginx).

## Sicherheit

- Private Schlüssel werden niemals geloggt oder ins Wiki/Audit-Log geschrieben.
- Nur die öffentliche Root-CA wird zum Download bereitgestellt.
- Speicherort: `/data/` (Docker-Volume) — nicht in das Git-Repo committen.

## Abhängigkeiten

- Node-Crypto (`node:crypto`) für klassische Algorithmen
- Optional OpenSSL CLI im Backend-Image für ML-KEM-Hybrid (Annahme: nur in `shieldpm-nginx`-Build aktiviert)

## Offene Fragen

- Keine (Liste der unterstützten Hybrid-Modi liegt im `shieldpm-nginx`-Repo, dieses Repo signalisiert nur per `host.use_ml_kem`, dass ein Host PQC-bereit ist).

## Verwandte Seiten

- [Zertifikate](./zertifikate.md)
- [Access-Lists](./access-lists.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Modulübersicht](./README.md)
