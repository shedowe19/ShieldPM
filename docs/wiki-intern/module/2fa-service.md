# 2FA-Service

## Zweck

Zwei-Faktor-Authentifizierung (TOTP, YubiKey OTP, Passkeys/WebAuthn, Duo Security) — zentrale Business-Logik.

## Kontext

`backend/internal/2fa-service.js` (676 Zeilen) kapselt sämtliche 2FA-Operationen. Es wird direkt von `backend/routes/2fa.js` aufgerufen und ist der einzige Ort, an dem 2FA-Logik lebt.

## Unterstützte 2FA-Methoden

| Methode      | Technologie                    | Modul                        |
| ------------ | ------------------------------ | ---------------------------- |
| TOTP         | Zeitbasierte Einmal-Passwörter | `otplib`                     |
| YubiKey      | OTP-Validierung (AES-basiert)  | Eigenbau                     |
| Passkeys     | FIDO2/WebAuthn                 | `@simplewebauthn/server`     |
| Duo Security | Cloud-2FA SDK                  | `@duosecurity/duo_universal` |
| Backup-Codes | Notfall-Einmalcodes            | Eigenbau                     |

## Wichtige Funktionen

### TOTP

- `setupTotp(userId, userEmail)` — Generiert geheimen Schlüssel + QR-Code (Base64 PNG)
- `verifyAndEnableTotp(userId, code)` — Verifiziert Code und aktiviert TOTP für den User
- `verifyTotp(userId, code)` — Reine Verifizierung (ohne Aktivierungslogik)

### YubiKey

- `addYubikey(userId, otp, label)` — Fügt YubiKey nach erfolgreicher OTP-Validierung hinzu
- `verifyYubikey(userId, otp)` — Verifiziert OTP gegen gespeicherten Key

### Passkeys (WebAuthn)

- `beginPasskeyRegistration(userId, userEmail, req)` — Erzeugt Registration-Options (Challenge)
- `completePasskeyRegistration(userId, challengeId, registrationResponse, req, label)` — Finalisiert Registrierung
- `beginPasskeyAuthentication(userId, req)` — Erzeugt Authentication-Options
- `completePasskeyAuthentication(userId, challengeId, authResponse, req)` — Finalisiert Authentifizierung

### Duo Security

- `setupDuo(userId, config)` — Konfiguriert Duo mit `duo_host`, `client_id`, `client_secret`
- `beginDuoAuthentication(userId, userEmail)` — Gibt Duo-Embed-URL zurück
- `completeDuoAuthentication(userId, userEmail, duoCode)` — Tauscht Code gegen Verifikation

### Backup-Codes

- `regenerateBackupCodes(userId)` — Erzeugt 8 neue Codes (10 Zeichen, alphanumerisch), löscht alte
- `verifyBackupCode(userId, code)` — Einmal-Code verifizieren und invaliden
- `getRemainingBackupCodeCount(userId)` — Zählt unbenutzte Codes

### Sonstiges

- `verifyLoginChallenge(userId, method, code)` — Dispatcher für alle Methoden (totp/yubikey/passkey/duo/backup)
- `removeTwoFaMethod(userId, methodId)` — Entfernt eine aktivierte 2FA-Methode
- `ensureBackupCodesExist(userId)` — Erstellt automatisch Backup-Codes wenn keine existieren

## Datenbank-Modelle

- `UserTwoFa` — 2FA-Konfiguration (Methode, aktiviert, Label, Geheimnisse)
- `UserTwoFaBackupCode` — Backup-Codes (user_id, codeHash, usedAt, usedIp)

## Abhängigkeiten

- `otplib` — TOTP-Generierung
- `@simplewebauthn/server` — WebAuthn
- `@duosecurity/duo_universal` — Duo SDK
- `qrcode` — QR-Code-Generierung
- `bcryptjs` — Backup-Code-Hashing

## Beziehung zu `routes/2fa.js`

`routes/2fa.js` ist der API-Layer (Express-Router). Er nimmt HTTP-Requests an und ruft die entsprechenden Service-Funktionen auf. Die Route `/api/users/:user_id/2fa` ist der Basispfad.

Wichtige Routen:

- `POST /totp/setup` → `setupTotp`
- `POST /totp/enable` → `verifyAndEnableTotp`
- `POST /yubikey/add` → `addYubikey`
- `POST /passkey/register/begin` → `beginPasskeyRegistration`
- `POST /passkey/register/complete` → `completePasskeyRegistration`
- `POST /duo/setup` → `setupDuo`
- `DELETE /:methodId` → `removeTwoFaMethod`
- `POST /backup-codes/regenerate` → `regenerateBackupCodes`

## Verwandte Seiten

- [Benutzer & Auth](./benutzer-auth.md)
- [Routes/2FA](../api/routen.md) (API-Übersicht)
- [OAuth2-Proxy](./oauth2-proxy.md)
- [Modulübersicht](./README.md)
