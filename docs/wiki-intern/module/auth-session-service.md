# Auth-Session-Service

## Zweck

Verwaltet Access- und Refresh-Token-Paare sowie HTTP-only Session-Cookies. Deckt den kompletten Token-Lifecycle ab: Erstellung, Refresh, Revokation.

## Kontext

`backend/internal/auth-session-service.js` ist das Gegenstück zu `backend/internal/token.js`. Während `token.js` primär JWT-Erstellung und -Verifizierung übernimmt, kümmert sich `auth-session-service.js` um:

- Token-Paar-Erstellung (Access + Refresh)
- Refresh-Sessions in der DB
- Session-Familien (zusammengehörige Rotationen einer Anmeldung)
- Revokation (einzeln, familienbasiert)

## Wichtige Funktionen

### Token-Erstellung

- `buildAccessToken(user, scope)` — Erstellt ein JWT-Access-Token mit `iss: "api"`, user-attrs und `scope`
- `buildRefreshToken()` — Erzeugt einen kryptografisch sicheren 48-Byte-String (Base64url)
- `buildTokenResponse(...)` — Aggregiert Access-Token, Refresh-Token, Session und User in ein Response-Objekt

### Session-Management

- `createRefreshSession({ userId, familyId, meta })` — Erstellt einen Refresh-Token-Eintrag in der DB
- `revokeSession(sessionId, reason, trx)` — Widerruft eine einzelne Session
- `revokeFamily(familyId, reason, trx)` — Widerruft alle Sessions einer Family (die betreffende Anmeldekette)

### Token-Lifecycle

- `issueTokenPair(user, scope, meta)` — Erstellt ein komplettes Token-Paar mit neuer Refresh-Session
- `refreshTokenPair(rawRefreshToken, meta)` — Tauscht einen Refresh-Token gegen ein neues Access-Token

## Token-TTL

| Token         | TTL        | Konstante                   |
| ------------- | ---------- | --------------------------- |
| Access Token  | 15 Minuten | `ACCESS_TOKEN_TTL = "15m"`  |
| Refresh Token | 30 Tage    | `REFRESH_TOKEN_TTL = "30d"` |

## Datenbank-Modell

- `AuthSession` — Refresh-Sessions (user_id, family_id, tokenHash, expiresAt, createdIp, createdUserAgent, revokedAt)

## Metadaten-Sanitisierung

`sanitizeMeta(meta)` extrahiert IP und User-Agent aus verschiedenen Feldnamen (`ip`/`created_ip`, `userAgent`/`user_agent`/`created_user_agent`) und normalisiert sie.

## Fehlermeldungen

- `TOKEN_NOT_FOUND_MESSAGE` — "Invalid refresh token"
- `TOKEN_REVOKED_MESSAGE` — "Refresh token has been revoked"
- `TOKEN_EXPIRED_MESSAGE` — "Refresh token has expired"
- `TOKEN_REPLAY_MESSAGE` — "Refresh token replay detected"

## Beziehung zu `token.js`

- `auth-session-service.js` **erstellt** Token-Paare und verwaltet Refresh-Sessions
- `token.js` **verifiziert** JWTs und parst Access-Token
- Beide nutzen `TokenModel` für die JWT-Erstellung

## Beziehung zu `benutzer-auth.md`

Die Authentifizierung nutzt `issueTokenPair()` für den Login und `refreshTokenPair()` für Session-Verlängerung. `revokeFamily()` widerruft die zusammengehörige Anmeldekette. Andere Geräte oder unabhängige Anmeldungen können eigene Familien besitzen und werden dadurch nicht automatisch abgemeldet.

## Fehler- und Nebenläufigkeitsverhalten

- Bei abgelaufenen Tokens, erkannter Wiederverwendung oder verlorenen Rotationsrennen werden notwendige Widerrufe zuerst in der Transaktion gespeichert. Der Authentifizierungsfehler wird erst nach deren Commit ausgelöst; sonst würde ein Rollback die Sperre aufheben.
- Eine Passwortänderung widerruft alle noch aktiven Refresh-Sitzungen des betroffenen Benutzers mit `password_changed`, gemeinsam mit der Passwortänderung in einer Transaktion. Andere Benutzer und bereits widerrufene Sitzungen bleiben unverändert. Ausgestellte Access-JWTs werden dadurch nicht vorzeitig ungültig.
- Die Rotation prüft zusätzlich, dass der bisherige Datensatz noch nicht widerrufen wurde.
- Fehlende, deaktivierte oder gelöschte Benutzer erhalten kein neues Token-Paar; ihre betreffende Session-Familie wird widerrufen.
- Der Refresh-Endpunkt entfernt Cookies bei dauerhaften Authentifizierungsfehlern (`401`). Bei vorübergehenden internen Fehlern (`500`) bleiben sie für einen späteren Versuch erhalten; interne Fehlerdetails werden nicht an den Client ausgegeben.

Regressionstests: `backend/test/internal/auth-session-security.spec.js` und `backend/test/routes/two-fa-authorization.spec.js`.

## Verwandte Seiten

- [Benutzer & Auth](./benutzer-auth.md)
- [Token-Service](./token.md)
- [Modulübersicht](./README.md)
