# Benutzer & Auth

## Zweck

Benutzerverwaltung, Authentifizierung und Autorisierung.

## Kontext

ShieldPM verwendet JWT-basierte Authentifizierung mit optionalem 2FA und OIDC.

## Wichtige Dateien

- `backend/internal/user.js` — Benutzer-Business-Logik und atomarer erster Administrator
- `backend/internal/initial-setup.js` — One-Time-Ownership-Claim
- `backend/internal/token.js` und `backend/internal/auth-session-service.js` — Access-/Refresh-Lifecycle
- `backend/internal/auth-challenge-service.js` — zweckgebundene One-Time-Challenges
- `backend/models/user.js`, `auth.js`, `auth-session.js` — persistente Auth-Daten
- `backend/models/oidc-identity.js`, `oidc-flow.js` — eindeutige IdP-Bindung und Flow-State
- `backend/routes/tokens.js`, `users.js`, `oidc.js` — API-Grenzen
- `backend/password-reset.js` — SQLite-only Recovery-CLI

## Verhalten

- Login über E-Mail + Passwort → JWT-Token
- OIDC-Login über OpenID Connect Provider
- Session-Verwaltung mit Geräte-Tracking
- Berechtigungssystem (Permissions pro Benutzer)
- Passwort-Hashing mit `bcryptjs`
- JWT-Signierung und Anwendungsschlüssel unter `/data/shieldpm/keys.json`
- Erster Admin nur mit 256-Bit-Ownership-Token aus `X-ShieldPM-Setup-Token`; Claim/User/Berechtigungen transaktional
- Refresh-Rotation mit Replay-Family-Revoke und kurzem Parallel-Request-Retry-Fenster
- Impersonation bindet Target an eine gültige Actor-Session; Restore benötigt beide Seiten und recent auth
- Passwort-/Identity-Änderungen verlangen recent authentication/Step-up und widerrufen betroffene Sessions
- OIDC bindet `(issuer, subject)` eindeutig; E-Mail allein darf keine bestehende Identity übernehmen

## Abhängigkeiten

- `jsonwebtoken` — JWT
- `bcryptjs` — Hashing
- `openid-client` — OIDC
- `internal/audit-log.js` — Protokollierung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [2FA-Service](./2fa.md)
- [OAuth2-Proxy (SSO)](./oauth2-proxy.md)
- [Access-Lists](./access-lists.md)
- [Audit-Log](../verwaltung/audit-log.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Modulübersicht](./README.md)
