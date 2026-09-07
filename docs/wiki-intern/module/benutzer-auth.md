# Benutzer & Auth

## Zweck

Benutzerverwaltung, Authentifizierung und Autorisierung.

## Kontext

ShieldPM verwendet JWT-basierte Authentifizierung mit optionalem 2FA und OIDC.

## Wichtige Dateien

- `backend/internal/user.js` (17 KB) — Benutzer-Business-Logik
- `backend/internal/token.js` (6 KB) — JWT-Token-Verwaltung
- `backend/internal/oauth2-proxy.js` (7 KB) — SSO-Integration (OAuth2 Proxy)
- `backend/internal/auth-session-service.js` (6 KB) — Session-Verwaltung
- `backend/models/user.js` (2 KB) — Benutzer-Modell
- `backend/models/auth.js` (2 KB) — Auth-Modell
- `backend/models/auth-session.js` (3 KB) — Session-Modell
- `backend/models/user_permission.js` (1 KB) — Berechtigungen
- `backend/routes/tokens.js` (22 KB) — Login/Token-API
- `backend/routes/users.js` (10 KB) — Benutzer-API
- `backend/routes/oidc.js` (7 KB) — OIDC-API
- `backend/password-reset.js` (2 KB) — Passwort-Reset-Script

## Verhalten

- Login über E-Mail + Passwort → JWT-Token
- OIDC-Login über OpenID Connect Provider
- Session-Verwaltung mit Geräte-Tracking
- Berechtigungssystem (Permissions pro Benutzer)
- Passwort-Hashing mit `bcryptjs`
- JWT-Signierung mit `/data/keys.json`

## Abhängigkeiten

- `jsonwebtoken` — JWT
- `bcryptjs` — Hashing
- `openid-client` — OIDC
- `internal/audit-log.js` — Protokollierung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Profiländerungen und Avatare

- Eigene Profilfelder bleiben über `users:update` bearbeitbar. Änderungen an `roles` oder `is_disabled` benötigen zusätzlich `users:permissions`; unveränderte Werte dürfen im Profilformular mitgesendet werden.
- Neue Benutzer unterstützen Gravatar und benutzerdefinierte Avatar-URLs. Ein Datei-Upload erfolgt nach dem Anlegen über den Upload-Endpunkt.
- Dateibasierte Avatare müssen einen reinen Dateinamen mit dem Präfix der Benutzer-ID besitzen. Lesezugriffe und das Entfernen eines bisherigen Avatars prüfen dieselbe Grenze; Pfadwechsel sowie Dateien anderer Benutzer werden zurückgewiesen.

## OIDC-Anmeldung

- Der temporäre OIDC-Cookie für Nonce und State ist HTTP-only, fünf Minuten gültig und verwendet `SameSite=Lax`, damit er bei der Navigation vom Identity Provider zurück ankommt.
- Der Callback verlangt beide Werte aus dem Cookie und übergibt sie als erwartete Werte an `openid-client`. Ohne gültigen State wird kein Autorisierungscode eingelöst.
- `/api/oidc/claim` verifiziert das entschlüsselte JWT einschließlich Signatur und Ablauf sowie den aktiven Benutzer. Anschließend erzeugt es das reguläre Access-/Refresh-Token-Paar und entfernt den temporären Cookie.
- Die öffentlichen OIDC-Routen setzen kein bestehendes gültiges API-Token voraus; auch eine Anmeldung nach Ablauf eines bisherigen Cookies ist möglich.

Regressionstests: `backend/test/internal/user-security.spec.js` und `backend/test/routes/oidc-security.spec.js`.

## Verwandte Seiten

- [2FA-Service](./2fa.md)
- [OAuth2-Proxy (SSO)](./oauth2-proxy.md)
- [Access-Lists](./access-lists.md)
- [Audit-Log](../verwaltung/audit-log.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Modulübersicht](./README.md)
