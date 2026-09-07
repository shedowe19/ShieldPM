# Secrets & Sicherheit

## Zweck

Dokumentation geheimer Werte und Sicherheitsmechanismen.

> **Niemals echte Secrets, Tokens oder Passwörter dokumentieren.**

## Geheime Variablen

| Variable                 | Beschreibung                        |
| ------------------------ | ----------------------------------- |
| `CSRF_SECRET`            | CSRF-Token-Secret (min. 32 Zeichen) |
| `DB_MYSQL_PASSWORD`      | MySQL-Passwort                      |
| `DB_POSTGRES_PASSWORD`   | PostgreSQL-Passwort                 |
| `ACME_EAB_HMAC_KEY`      | ACME HMAC-Key                       |
| `INITIAL_ADMIN_PASSWORD` | Initiales Admin-Passwort            |

## Interne Secrets

| Datei                      | Beschreibung                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `/data/shieldpm/keys.json` | JWT-Signaturschlüssel und persistenter `encryptionKey` für AES-GCM und serverseitige HMAC-Tags |
| `/data/tls/*`              | SSL-Zertifikate und private Schlüssel                                                          |

## Sicherheitsmechanismen

- Passwort-Hashing: `bcryptjs`
- JWT: `jsonwebtoken`
- CSRF: `csrf-csrf`
- Rate-Limiting: `express-rate-limit`
- Security-Header: `helmet`
- 2FA: TOTP, WebAuthn, Duo

## Autorisierung und Authentifizierungszustand

- Signaturprüfung allein genügt nicht: Der Access-Layer prüft den aktuellen Kontostatus und die Token-Scopes bereits beim Laden.
- Rollenänderungen sind von gewöhnlichen Profiländerungen getrennt berechtigt. Eine ausstehende zweite Faktorprüfung kann ihre eigene 2FA-Verwaltung nicht aufrufen.
- Refresh-Replay-Sperren müssen vor dem ausgehenden Fehler dauerhaft gespeichert sein. Passkey-/Duo-Challenges und Backup-Codes sind nur einmal verwendbar.
- Access-List-Audit-Einträge entfernen die dort bekannten SSO-Secrets; Passwort-Hinweise verraten keine Passwortbestandteile.

Details: [Benutzer & Auth](../module/benutzer-auth.md), [2FA-Service](../module/2fa-service.md), [Session-Verwaltung](../module/auth-session-service.md), [Access-Lists](../module/access-lists.md).

## Verwandte Seiten

- [Umgebungsvariablen](./umgebungsvariablen.md)

## API-Limits und Demo-Modus

Das globale Limit von 500 Anfragen je IP in 15 Minuten gilt für die tatsächlichen Backendpfade wie `/users` und `/tokens`; der vorgeschaltete Nginx entfernt den äußeren `/api`-Präfix. Die engeren Limits für Authentifizierungsrouten gelten zusätzlich.

Der Demo-Modus sperrt Änderungen an Benutzern einschließlich des Alias `me` sowie `PUT`-Änderungen globaler Einstellungen. Bei gesperrten internen Weiterleitungszielen werden auch Groß-/Kleinschreibung, abschließender DNS-Punkt und geklammerte IPv6-Adressen berücksichtigt. Diese Prüfung ersetzt keine Netzwerktrennung des Demo-Systems und keine DNS-Auflösungskontrolle.

Regressionstests: `backend/test/routes/api-rate-limit.spec.js` prüft das echte Express-Limit über 501 Anfragen an einen unpräfigierten Backendpfad; `backend/test/lib/demo-mode.spec.js` prüft die tatsächlich verwendeten Methoden und Pfadvarianten.
