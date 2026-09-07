# 2FA-Service

## Zweck

Zwei-Faktor-Authentifizierung (TOTP, YubiKey OTP, Passkeys/WebAuthn, Duo Security) — zentrale Business-Logik.

## Kontext

`backend/internal/2fa-service.js` kapselt sämtliche 2FA-Operationen. Es wird direkt von `backend/routes/2fa.js` aufgerufen und ist der einzige Ort, an dem 2FA-Logik lebt.

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

- `setupDuo(userId, config)` — Konfiguriert Duo mit `clientId`, `clientSecret`, `apiHost` und `redirectUrl`
- `beginDuoAuthentication(userId, userEmail, browserToken, expiresAt)` — Speichert die vom HTTP-Controller erzeugte zufällige Browserkennung mit dessen JWT-begrenzter Frist in Millisekunden und gibt ausschließlich die Duo-Weiterleitungs-URL zurück
- `completeDuoAuthentication(browserToken, duoCode, state)` — Prüft die Browserbindung und den State, verbraucht die Challenge atomar und tauscht den Code gegen die Duo-Verifikation; gibt nur bei erfolgreicher Prüfung den weiterhin aktiven Benutzer zurück

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

Die Verifizierungs- und Passkey-Endpunkte sind im OpenAPI-Schema unter `backend/schema/paths/tokens/2fa/` dokumentiert und über Swagger UI (`/docs`) einsehbar. Der Duo-Vertrag ist im folgenden Abschnitt beschrieben.

## Gotchas & Bug-Fixes

- **Mehrere Authenticator-Apps**: Die Anmeldung prüft alle aktivierten TOTP-Datensätze des Benutzers; ein gültiger Code einer später hinzugefügten App wird ebenfalls akzeptiert.
- **Erste YubiKey-/Duo-Einrichtung**: Neu erzeugte Wiederherstellungscodes werden als `backup_codes` in der Einrichtungsantwort einmalig an die Oberfläche übergeben. Existieren noch unbenutzte Codes, bleibt dieser Satz erhalten und die Antwort enthält keinen neuen Satz. Provider-Geheimnisse bleiben aus der HTTP-Antwort ausgeschlossen.
- **Wiederherstellungscodes bei Änderungen**: Das Entfernen einer noch unbestätigten Methode erhält die Codes, solange eine aktive Methode existiert. Neue Codes werden zuerst vollständig erzeugt und gehasht; Löschung des alten Satzes und Einfügen des vollständigen neuen Satzes erfolgen anschließend in einer Transaktion. Ein Schreibfehler erhält den bisherigen Satz.
- **Nur aktivierte TOTP-Methoden beim Login**: `verifyTotp()` berücksichtigt ausschließlich `is_verified=1` und `is_deleted=0`. Ein neuer, noch unbestätigter Setup-Datensatz kann damit keine vorhandene Methode ersetzen oder die zweite Faktorprüfung bestehen. Direkte DB-Seeds müssen den Aktivierungsstatus ausdrücklich setzen.
- **TOTP-Secret im Klartext**: Das TOTP-Secret wird in `user_2fa.secret` als Klartext (Base32) gespeichert. Das Secret muss für die Prüfung verfügbar sein; die aktuelle Speicherung erfolgt unverschlüsselt und ist sensibel.
- **Passkey-Challenges sind kurzlebig**: Die bei `beginPasskeyAuthentication` erzeugten Challenges werden mit einer Frist von fünf Minuten in `meta.expiresAt` gespeichert. Abgelaufene oder ältere Datensätze ohne Frist werden abgelehnt. Die abschließende Löschung wird auf genau einen betroffenen Datensatz geprüft; parallele Verwendungen können deshalb nicht beide erfolgreich sein.
- **Schema `$ref`-Pfade**: Die 2FA-Schema-Dateien unter `paths/tokens/2fa/` liegen auf unterschiedlicher Tiefe. `verify/post.json` ist auf 4 Ebenen (`paths/tokens/2fa/verify/`), die Passkey-Dateien auf 5 Ebenen (`paths/tokens/2fa/passkey/*/`). Falsche `../`-Tiefe führt zu ENOENT-Fehlern beim Schema-Dereferenzieren in Production. Siehe [Swagger UI](../features/swagger-ui.md) für Details.

## YubiKey-Antwortprüfung

Der HTTPS-Aufruf akzeptiert nur HTTP 200, den Status `OK` und genau zur Anfrage passende OTP- und Nonce-Werte. Doppelte Antwortfelder, Antworten über 16 KiB und ausbleibende Netzwerkaktivität von zehn Sekunden werden zurückgewiesen. Ist `YUBICO_SECRET_KEY` gesetzt, werden außerdem die Anfrage signiert und die Antwortsignatur mit dem Base64-dekodierten API-Schlüssel geprüft. Das hierfür verwendete HMAC-SHA1 ist durch das [Yubico-Validierungsprotokoll](https://developers.yubico.com/OTP/Specifications/OTP_validation_protocol.html) vorgegeben. Ohne konfigurierten Schlüssel bleibt die bisherige HTTPS-Variante erhalten; eine zusätzliche HMAC-Prüfung findet dann nicht statt.

Regressionstests: `backend/test/internal/yubikey-response.spec.js` simuliert passende, fremde, manipulierte, übergroße und ausbleibende Providerantworten. `backend/test/internal/two-fa-recovery.spec.js` verwendet SQLite, echte TOTP-Prüfung und bcrypt für mehrere Methoden, atomaren Codeersatz und Einmalverwendung. Diese Prüfungen ersetzen keinen Test mit physischem YubiKey und produktivem Validierungsdienst.

## Autorisierung und Einmalverwendung

- Verwaltungsrouten prüfen `access.can("users:update", userId)`. Damit gelten die aktuellen Rollen und der Kontostatus aus der Datenbank. Ein `2fa_pending`-Token darf weder Methoden löschen noch neue Backup-Codes erzeugen.
- TOTP, Passkey und der Start einer Duo-Anmeldung prüfen den Scope `2fa_pending` sowie eine gültige Benutzer-ID vor der zweiten Faktorprüfung. Der Duo-Abschluss verwendet die beim Start serverseitig gespeicherte Benutzerbindung.
- Backup-Codes werden mit einer bedingten Aktualisierung auf `used_at IS NULL` verbraucht. Nur der Aufruf, der tatsächlich einen Datensatz aktualisiert, ist erfolgreich.
- `POST /api/tokens/2fa/duo/begin` erwartet `pending_token` und gibt ausschließlich `{auth_url}` zurück. Der HTTP-Controller erzeugt die unabhängige Browserkennung aus 32 kryptografisch zufälligen Bytes und begrenzt ihre Lebensdauer auf höchstens fünf Minuten beziehungsweise die frühere Ablaufzeit des geprüften Pending-JWT. Die Kennung wird zusammen mit Frist und dem Zweck `shieldpm:duo-cookie:v1` über den bestehenden AES-256-GCM-Helfer verschlüsselt und als hostgebundenes `shieldpm_duo`-Cookie mit `HttpOnly`, `SameSite=Lax` und Pfad `/api/tokens/2fa/duo` gesetzt; `Secure` folgt dem über die konfigurierte Proxy-Vertrauensstellung ermittelten HTTPS-Status.
- Die Cookie-Prüfung verlangt das vollständige Format mit 96-Bit-IV und 128-Bit-GCM-Tag, eine authentifizierte Entschlüsselung sowie den korrekten Zweck, die gültige Browserkennung und eine zukünftige Ablaufzeit. Klartext-Cookies und manipulierte oder zweckfremde Payloads werden abgelehnt. Verschlüsselung und HMAC verwenden den vorhandenen persistenten `encryptionKey` aus `${DATA_PATH || "/data"}/shieldpm/keys.json`; alle Prozesse benötigen dieselbe Schlüsseldatei. Ein Schlüsselwechsel macht laufende Duo-Anmeldungen ungültig.
- Die Datenbank speichert in `duo_auth_challenge` nur HMAC-SHA-256-Tags der Browserkennung und des ebenfalls aus 32 zufälligen Bytes erzeugten States sowie Benutzer-ID und Ablaufzeit. Die Präfixe `shieldpm:duo:binding:v1:` und `shieldpm:duo:state:v1:` trennen beide Verwendungszwecke; Kennungen sind keine Benutzerpasswörter. `POST /api/tokens/2fa/duo/complete` erwartet ausschließlich `duo_code` und `state` im JSON-Body; die Browserkennung stammt ausschließlich aus dem entschlüsselten Cookie. Der State-Tag wird zeitkonstant mit dem gespeicherten Tag verglichen. Ein Pending-JWT oder eine Browserkennung im JSON-Body ersetzt das Cookie nicht.
- Beide Duo-Endpunkte benötigen den CSRF-Header und das dazugehörige Cookie. Bei einem vollständigen Neustart auf `/duo-callback` wartet der Router zuerst auf die Health-Antwort mit dem CSRF-Token. Der AuthProvider überspringt dort die automatische Sitzungswiederherstellung, damit eine verspätete Refresh-Antwort keine gerade ausgestellten Auth-Cookies löschen kann. Regelmäßiger Refresh beginnt erst nach erfolgreicher Anmeldung.
- Duo-Zustand und Pending-Token werden nicht in `sessionStorage` oder `localStorage` gespeichert. Der Callback übernimmt Code und State einmalig aus der URL, entfernt die Query-Parameter sofort aus dem aktuellen History-Eintrag und übergibt die Werte über den zentralen API-Client mit Cookies und CSRF-Header an den Server.
- Der Server prüft den aktiven Benutzer und die konfigurierte Duo-Methode und löscht anschließend die Challenge mit einer bedingten, auf genau einen Datensatz geprüften Operation, bevor er den Code bei Duo einlöst. Der SDK-Aufruf prüft die signierte Antwort gegen die serverseitig ermittelte E-Mail-Adresse; zusätzlich müssen `auth_result.result` und `auth_result.status` jeweils `allow` sein. Ablaufzeit und aktiver Kontostatus werden nach dem Austausch erneut geprüft. Fehlgeschlagene oder parallele Rückrufe können die verbrauchte Challenge nicht erneut verwenden.
- Die Duo-Antworten setzen `Cache-Control: no-store`. Ein neuer Start verwirft ein vorhandenes Duo-Cookie; jeder vom Abschluss-Handler bearbeitete Erfolg oder Fehler löscht es ebenfalls. Eine vom vorgeschalteten CSRF-Schutz abgelehnte Anfrage verändert das Cookie und die Challenge nicht.
- Nach einer Aktualisierung müssen bereits laufende Duo-Anmeldungen mit dem alten State-/Pending-Token-Vertrag oder unverschlüsselten Cookies beziehungsweise ungekeyten SHA-256-Datensätzen neu begonnen werden. Das gilt ebenso für ältere Passkey-Challenges ohne gespeicherte Ablaufdaten. Eine Datenbankmigration ist hierfür nicht erforderlich.

Regressionstests: `backend/test/internal/2fa-service.spec.js`, `backend/test/internal/backup-code-consumption.spec.js` und `backend/test/routes/two-fa-authorization.spec.js`. `backend/test/routes/duo-login.spec.js` verbindet die echte Express-/CSRF-Verarbeitung, AES-GCM und HMAC mit einem isolierten Testschlüssel und einer SQLite-Datenbank. Geprüft werden Cookie-Manipulation, Schlüssel-/Zweckbindung, Ablauf, CSRF, Kontosperren, Replay und parallele Rückrufe. `frontend/src/Router.duo.test.tsx` prüft den Neustart mit zunächst leerem CSRF-Arbeitsspeicher einschließlich React StrictMode. Duo-Netzwerkantworten werden in diesen Tests simuliert; ein Login gegen einen echten Duo-Mandanten ist damit nicht abgedeckt.

## Verwandte Seiten

- [Benutzer & Auth](./benutzer-auth.md)
- [Routes/2FA](../api/routen.md) (API-Übersicht)
- [OAuth2-Proxy](./oauth2-proxy.md)
- [Swagger UI](../features/swagger-ui.md)
- [Modulübersicht](./README.md)
