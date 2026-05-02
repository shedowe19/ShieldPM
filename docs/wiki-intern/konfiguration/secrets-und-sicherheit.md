# Secrets & Sicherheit

## Zweck

Dokumentation geheimer Werte und Sicherheitsmechanismen.

> **Niemals echte Secrets, Tokens oder Passwörter dokumentieren.**

## Geheime Variablen

| Variable | Beschreibung |
|---|---|
| `CSRF_SECRET` | CSRF-Token-Secret (min. 32 Zeichen) |
| `DB_MYSQL_PASSWORD` | MySQL-Passwort |
| `DB_POSTGRES_PASSWORD` | PostgreSQL-Passwort |
| `ACME_EAB_HMAC_KEY` | ACME HMAC-Key |
| `INITIAL_ADMIN_PASSWORD` | Initiales Admin-Passwort |

## Interne Secrets

| Datei | Beschreibung |
|---|---|
| `/data/keys.json` | JWT-Signaturschlüssel |
| `/data/tls/*` | SSL-Zertifikate und private Schlüssel |

## Sicherheitsmechanismen

- Passwort-Hashing: `bcryptjs`
- JWT: `jsonwebtoken`
- CSRF: `csrf-csrf`
- Rate-Limiting: `express-rate-limit`
- Security-Header: `helmet`
- 2FA: TOTP, WebAuthn, Duo

## Verwandte Seiten

- [Umgebungsvariablen](./umgebungsvariablen.md)
