# Auth-Session-Service

## Zweck

`backend/internal/auth-session-service.js` verwaltet serverseitige Refresh-Sessions, Rotation, Replay-Erkennung,
Step-up-Zustand und Administrator-Impersonation. Access-JWTs sind kurzlebige Ableitungen einer aktiven Session.

## Session-Lifecycle

- Refresh-Tokens werden nur gehasht gespeichert und bei jeder Nutzung in einer Transaktion rotiert.
- Eine erfolgreiche Rotation verknüpft Parent, Family, Ablauf, Auth-Zeit und Authentifizierungsmethoden.
- Parallele Nutzung eines gerade rotierten Tokens innerhalb von 15 Sekunden ergibt einen Konflikt/Retry-Pfad und
  löscht nicht die inzwischen gültigen Browser-Cookies.
- Eine Wiederverwendung außerhalb dieses Grace-Fensters gilt als Replay und widerruft die gesamte Familie.
- Deaktivierte/gelöschte Benutzer, abgelaufene oder widerrufene Sessions scheitern geschlossen.

## Cookie- und CSRF-Grenze

`backend/lib/auth-cookies.js` leitet `Secure` aus dem effektiv vertrauten Request-Schema ab. `X-Forwarded-Proto` zählt
nur, wenn Express den sendenden Proxy laut validiertem `TRUST_PROXY` tatsächlich vertraut. Access-, Refresh-, Actor-
und CSRF-Cookies haben getrennte Pfade/Attribute; Logout entfernt alle Varianten.

CSRF-Zustand ist an die stabile Refresh-Familie gebunden und wechselt bei neuem Login/Impersonation, nicht bei jeder
normalen Access-Token-Rotation.

## Step-up und MFA

Sensible Aktionen können frische Authentifizierung verlangen. Ein kurzlebiger serverseitiger Challenge-Datensatz
bindet Zweck, Benutzer, Ablauf und Einmalverbrauch. TOTP, YubiKey, Passkey, Duo oder Backup-Code erfüllen nur die dafür
ausgegebene Challenge; Ergebnisse aus einem Login-Flow sind nicht beliebig wiederverwendbar. Step-up ist während einer
Impersonation gesperrt.

## Impersonation

Der Start verlangt eine aktive Actor-Refresh-Session und recent authentication. Die Actor-Session wird rotiert und
browserseitig verborgen; die Target-Session speichert `actor_user_id`, `actor_session_id` und Zeitpunkt. Verschachtelte
Impersonation ist verboten.

Restore prüft Target- und Actor-Token, beide Sessionzustände, Userstatus, exakte gegenseitige Bindung und Family-Status.
Danach rotiert es den Actor, widerruft die Target-Familie und entfernt Actor-/Target-Cookies konsistent. Ein Target-
Cookie allein kann die Administratorrolle nicht wiederherstellen.

## Wichtige Dateien

- `backend/internal/auth-session-service.js`
- `backend/models/auth-session.js`
- `backend/internal/auth-challenge-service.js`
- `backend/routes/tokens.js`
- `backend/lib/auth-cookies.js`
- `frontend/src/modules/SessionMutationQueue.ts`
- `frontend/src/context/AuthContext.tsx`

## Verwandte Seiten

- [Benutzer & Auth](./benutzer-auth.md)
- [Token](./token.md)
- [2FA-Service](./2fa-service.md)
- [Security-Modernisierung](../entscheidungen/2026-08-31-security-modernisierung.md)
