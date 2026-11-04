# Zwei-Faktor-Authentifizierung – Überblick

## Zweck

Kurzer Überblick über Zwei-Faktor-Authentifizierung (TOTP, YubiKey OTP, WebAuthn/Passkeys und Duo Security). Technische Details, Endpunkte, Sicherheitsgrenzen und Regressionstests stehen im [2FA-Service](./2fa-service.md).

## Kontext

Bietet zusätzliche Sicherheit für ShieldPM-Benutzerkonten mit vier konfigurierbaren Methoden und einmalig nutzbaren Wiederherstellungscodes.

## Wichtige Dateien

- `backend/internal/2fa-service.js` (21 KB) — Business-Logik
- `backend/models/user-2fa.js` (2 KB) — 2FA-Konfigurationsmodell
- `backend/models/user-2fa-backup-codes.js` (1 KB) — Backup-Codes-Modell
- `backend/routes/2fa.js` (9 KB) — API-Routen

## Verhalten

- **TOTP**: Zeitbasierte Einmal-Passwörter via `otplib` + QR-Code
- **YubiKey OTP**: Validierung des Yubico-Einmalcodes (auch mit eigenem HTTPS-Validierungsdienst möglich)
- **WebAuthn/Passkeys**: Hardwaregeräte und Plattformauthentifikatoren via `@simplewebauthn/server`
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

Verwaltungszugriffe werden über die Benutzerberechtigungen geprüft. Tokens mit ausstehender zweiter Faktorprüfung erhalten keinen Zugriff auf diese Verwaltung. TOTP-Anmeldungen benötigen eine bestätigte Methode; Passkey- und Duo-Challenges laufen nach spätestens fünf Minuten ab und sind nur einmal verwendbar. Duo bindet den Redirect über ein kurzlebiges HttpOnly-Cookie an den Browser; beide Duo-Endpunkte prüfen CSRF. State und Pending-Token benötigen keinen dauerhaften JavaScript-Speicher. Backup-Codes werden atomar verbraucht.

Die detaillierten Abläufe und der Duo-State-Vertrag stehen im [2FA-Servicedetail](./2fa-service.md).

## Verwandte Seiten

- [2FA-Service – technische Details](./2fa-service.md)
- [Benutzer & Auth](./benutzer-auth.md)
- [OAuth2-Proxy (SSO)](./oauth2-proxy.md)
- [Audit-Log](../verwaltung/audit-log.md)
- [Modulübersicht](./README.md)
