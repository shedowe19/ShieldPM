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
- Beide Logout-Endpunkte widerrufen die gesamte Familie des vorgelegten Refresh-Tokens, auch wenn der Browser noch dessen bereits rotierten oder widerrufenen Vorgänger sendet. Ein vor dem Logout ausgestellter Nachfolger kann dadurch die Anmeldung nicht wiederherstellen. Unabhängige Anmeldungen desselben Benutzers bleiben erhalten.
- Fehlende, deaktivierte oder gelöschte Benutzer erhalten kein neues Token-Paar; ihre betreffende Session-Familie wird widerrufen.
- Fehlerhafte Refresh-Antworten (`401`/`500`) verändern weder Auth- noch CSRF-Cookies: Eine verspätete Antwort einer älteren Sitzung darf eine zwischenzeitlich erfolgreiche Anmeldung nicht löschen oder deren erste schreibende Anfrage durch einen alten CSRF-Cookie blockieren. Bei Refresh wird der CSRF-Cookie daher erst nach erfolgreicher Token-Ausstellung erzeugt. `401` meldet weiterhin den ungültigen Refresh; die expliziten Logout-Endpunkte löschen die Auth-Cookies und setzen den anonymen CSRF-Token. Interne Fehlerdetails werden nicht an den Client ausgegeben.

Regressionstests: `backend/test/internal/auth-session-security.spec.js`, `backend/test/routes/two-fa-authorization.spec.js` und `backend/test/routes/third-auth-logout.spec.js` (echte Refresh-Rotation und Logout mit SQLite). `third-auth-refresh.spec.js` prüft über HTTP eine erfolgreiche neue Anmeldung vor einer verspäteten Refresh-Fehlerantwort und die dabei ausgegebenen Cookies. `csrf-session-transitions.spec.js` prüft denselben Ablauf durch die vollständige App einschließlich CSRF-Middleware und anschließender geschützter Schreibanfrage.

## Geräte- und Sitzungsverwaltung

Die Profilseite enthält einen Reiter für Geräte und Sitzungen. `backend/internal/sessions.js` gruppiert die aktive Refresh-Kette einer Anmeldung als Gerät und liefert ausschließlich Familien-ID, aktuelle Browsermarkierung, erste noch gespeicherte Anmeldung, letzte Aktivität, Ablauf, IP und User-Agent. Rotationen erscheinen nicht als zusätzliche Geräte. Angezeigt werden höchstens 100 zuletzt aktive Familien einschließlich des aktuellen Browsers; die Antwort meldet eine darüber hinausgehende Menge ausdrücklich.

Die Route `backend/routes/sessions.js` wird unter `/tokens/sessions` eingebunden:

| Methode | Pfad                              | Verhalten                                               |
| ------- | --------------------------------- | ------------------------------------------------------- |
| GET     | `/api/tokens/sessions`            | Eigene aktive Gerätefamilien auflisten                  |
| DELETE  | `/api/tokens/sessions/:family_id` | Eine andere eigene Gerätefamilie vollständig widerrufen |
| DELETE  | `/api/tokens/sessions/others`     | Alle anderen eigenen Gerätefamilien widerrufen          |

Der Pfad ist bewusst unter `/api/tokens`: Nur dorthin sendet der Browser den vorhandenen HTTP-only-Refresh-Cookie. Aktuelles Access-JWT und Refresh-Cookie müssen demselben aktiven Konto gehören. Eine ausstehende 2FA-Anmeldung, ein fremder Cookie oder eine gesperrte Benutzeridentität berechtigen nicht zur Verwaltung. Fremde Familien erhalten `404`; Hashes, Tokens, JTI und interne Rotationsreferenzen verlassen den Service nicht. Schreibzugriffe benötigen den normalen CSRF-Schutz und werden begrenzt sowie auditiert. Das aktuelle Gerät wird über den vorhandenen Logout abgemeldet; „alle anderen“ erhält seine gesamte Familie. Bereits ausgestellte zustandslose Access-JWTs können weiterhin bis zu 15 Minuten gültig bleiben; die Oberfläche benennt diese Grenze.

`browser-sessions.spec.js` verbindet echte HTTP-Anfragen, App, RSA-JWTs, Cookies, CSRF und SQLite. Es prüft Gruppierung, Markierung, Redaction, Familienwiderruf nach Rotation, Kontentrennung, fehlende beziehungsweise fremde Cookies und deaktivierte Konten. `frontend/src/pages/Profile/Sessions.test.tsx` prüft den tatsächlichen Query-Hook, API-Wrapper und Bestätigungsdialog mit kontrolliertem Fetch, einschließlich Fehler und Abbruch beim Verlassen.

## Begrenzte Aufbewahrung

`backend/internal/auth-session-cleanup.js` startet nach den Migrationen und läuft anschließend stündlich. Pro Lauf werden höchstens zehn Batches mit je 1000 Zeilen entfernt, deren `expires_at` bereits mehr als sieben Tage zurückliegt. Es entfernt weder gültige aktuelle Tokens noch unablaufene rotierte Vorgänger; die Wiederverwendungserkennung bleibt für deren gesamte Gültigkeit erhalten. Die Referenzen auf entfernte Vorgänger werden in derselben Batchtransaktion auf `NULL` gesetzt, auch wenn SQLite ohne aktivierte Fremdschlüsselprüfung läuft. Die Migration `20261017190201_index_session_references.js` ergänzt dafür Indizes unter SQLite/PostgreSQL; InnoDB besitzt diese bereits durch die Fremdschlüssel.

Die Oberfläche verlängert standardmäßig alle fünf Minuten. Ohne Bereinigung wächst deshalb auch eine einzige dauerhaft offene Browseranmeldung um ungefähr 288 Zeilen pro Tag. Mit der Bereinigung bleiben abgelaufene Daten nur während der zusätzlichen siebentägigen Frist erhalten; aktuelle Familien besitzen weiterhin ihre für Replay-Prüfungen benötigten Vorgänger. Die Anzeige „Erstmals gesehen“ verwendet den ältesten noch aufbewahrten Familieneintrag und ist kein dauerhaftes Geräteinventar.

`auth-session-cleanup.spec.js` prüft echte SQLite-/PostgreSQL-Operationen, Batchgrenzen, Ablaufgrenze, erhaltene Replay-Erkennung und den Erhalt eines aktuellen Nachfolgers nach Entfernen seines längst abgelaufenen Vorgängers.

## Verwandte Seiten

- [Benutzer & Auth](./benutzer-auth.md)
- [Token-Service](./token.md)
- [Modulübersicht](./README.md)
