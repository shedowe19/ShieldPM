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

## 2FA-Token-Flow (Anmeldung)

Neben den klassischen `/api/users/:user_id/2fa/...`-Routen gibt es seit v4.3.2 einen separaten 2FA-Token-Flow für die Anmeldung. Die Endpunkte liegen unter `/api/tokens/2fa/...`:

| Endpunkt                                | Funktion                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST /api/tokens`                      | Login mit Credentials → gibt `pending_token` + `2fa_token_required` zurück wenn 2FA nötig |
| `POST /api/tokens/2fa/verify`           | TOTP/YubiKey/Backup-Code Verifizierung nach Login                                         |
| `POST /api/tokens/2fa/passkey/begin`    | Passkey-Authentifizierung starten                                                         |
| `POST /api/tokens/2fa/passkey/complete` | Passkey-Authentifizierung abschließen                                                     |

Der Flow: User loggt sich ein → Server erkennt dass 2FA nötig → gibt `pending_token` → Client ruft 2FA-Endpunkt auf → bei Erfolg werden volle Tokens ausgestellt.

Diese Endpunkte sind im OpenAPI-Schema unter `backend/schema/paths/tokens/2fa/` dokumentiert und über Swagger UI (`/docs`) einsehbar.

## Gotchas & Bug-Fixes

- **`verifyTotp()` akzeptiert `is_verified=0`**: Vor dem Fix in Commit `c3cf536c` verlangte `verifyTotp()` dass `is_verified=1` im Datenbank-Record des Benutzers gesetzt ist. Das verhinderte die Verifizierung für Benutzer die 2FA über DB-Seeding eingerichtet haben (kein Setup durchlaufen). Der Fix entfernt diese Prüfung — TOTP-Codes werden akzeptiert solange die Methode aktiviert ist, unabhängig vom `is_verified`-Flag.
- **TOTP-Secret im Klartext**: Das TOTP-Secret wird in `user_2fa.secret` als Klartext (Base32) gespeichert. Das ist technisch erforderlich für die TOTP-Generierung, sollte aber als sensibel behandelt werden.
- **Passkey-Challenges sind kurzlebig**: Die bei `beginPasskeyAuthentication` erzeugten Challenges werden in der DB gespeichert und müssen schnell abgeschlossen werden. Ablaufzeit ist Teil des Challenge-Records.
- **Schema `$ref`-Pfade**: Die 2FA-Schema-Dateien unter `paths/tokens/2fa/` liegen auf unterschiedlicher Tiefe. `verify/post.json` ist auf 4 Ebenen (`paths/tokens/2fa/verify/`), die Passkey-Dateien auf 5 Ebenen (`paths/tokens/2fa/passkey/*/`). Falsche `../`-Tiefe führt zu ENOENT-Fehlern beim Schema-Dereferenzieren in Production. Siehe [Swagger UI](../features/swagger-ui.md) für Details.

## Verwandte Seiten

- [Benutzer & Auth](./benutzer-auth.md)
- [Routes/2FA](../api/routen.md) (API-Übersicht)
- [OAuth2-Proxy](./oauth2-proxy.md)
- [Swagger UI](../features/swagger-ui.md)
- [Modulübersicht](./README.md)
