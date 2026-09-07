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

## Abhängigkeiten

- `otplib` — TOTP-Generierung
- `@simplewebauthn/server` — WebAuthn Server-Logik
- `@duosecurity/duo_universal` — Duo SDK
- `qrcode` — QR-Code-Generierung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Sicherheitsgrenzen

Verwaltungszugriffe werden über die Benutzerberechtigungen geprüft. Tokens mit ausstehender zweiter Faktorprüfung erhalten keinen Zugriff auf diese Verwaltung. TOTP-Anmeldungen benötigen eine bestätigte Methode; Passkey- und Duo-Challenges laufen nach fünf Minuten ab und sind nur einmal verwendbar. Backup-Codes werden atomar verbraucht.

Die detaillierten Abläufe und der Duo-State-Vertrag stehen im [2FA-Servicedetail](./2fa-service.md).

## Verwandte Seiten

- [Benutzer & Auth](./benutzer-auth.md)
- [OAuth2-Proxy (SSO)](./oauth2-proxy.md)
- [Audit-Log](../verwaltung/audit-log.md)
- [Modulübersicht](./README.md)
