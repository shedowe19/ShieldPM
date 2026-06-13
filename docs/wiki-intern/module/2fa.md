# 2FA-Service

## Zweck

Zwei-Faktor-Authentifizierung (TOTP, WebAuthn/Passkeys, Duo Security).

## Kontext

Bietet zusätzliche Sicherheitsebene für Benutzerkonten mit drei verschiedenen 2FA-Methoden.

## Wichtige Dateien

- `backend/internal/2fa-service.js` (21 KB) — Business-Logik
- `backend/models/user-2fa.js` (2 KB) — 2FA-Konfigurationsmodell
- `backend/models/user-2fa-backup-codes.js` (1 KB) — Backup-Codes-Modell
- `backend/routes/2fa.js` (9 KB) — API-Routen

## Verhalten

- **TOTP**: Zeitbasierte Einmal-Passwörter via `otplib` + QR-Code
- **WebAuthn/Passkeys**: Hardwaregeräte (YubiKey, FIDO2) via `@simplewebauthn/server`
- **Duo Security**: Cloud-basierte 2FA via `@duosecurity/duo_universal`
- Backup-Codes als Fallback
- Der Frontend-Callback `frontend/src/pages/DuoCallback/` ist eine öffentliche Route (`/duo-callback`) und darf nicht hinter dem Auth-Gate liegen. Duo Hosted 2FA leitet mit `duo_code` zurück, während noch keine normale SPA-Session als authentifiziert gilt.

## Abhängigkeiten

- `otplib` — TOTP-Generierung
- `@simplewebauthn/server` — WebAuthn Server-Logik
- `@duosecurity/duo_universal` — Duo SDK
- `qrcode` — QR-Code-Generierung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Benutzer & Auth](./benutzer-auth.md)
- [OAuth2-Proxy (SSO)](./oauth2-proxy.md)
- [Audit-Log](../verwaltung/audit-log.md)
- [Modulübersicht](./README.md)
