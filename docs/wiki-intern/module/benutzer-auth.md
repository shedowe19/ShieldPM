# Benutzer & Auth

## Zweck

Benutzerverwaltung, Authentifizierung und Autorisierung.

## Kontext

ShieldPM verwendet JWT-basierte Authentifizierung mit optionalem 2FA und OIDC.

## Wichtige Dateien

- `backend/internal/user.js` (17 KB) — Benutzer-Business-Logik
- `backend/internal/token.js` (6 KB) — JWT-Token-Verwaltung
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

- Keine

## Verwandte Seiten

- [2FA-Service](./2fa.md)
- [Secrets & Sicherheit](../konfiguration/secrets-und-sicherheit.md)
- [Modulübersicht](./README.md)
