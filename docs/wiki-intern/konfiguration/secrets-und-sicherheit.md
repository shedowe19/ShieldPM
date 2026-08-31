# Secrets & Sicherheit

## Zweck

Dokumentation geheimer Werte und Sicherheitsmechanismen.

> **Niemals echte Secrets, Tokens oder Passwörter dokumentieren.**

## Geheime Variablen

| Variable                           | Beschreibung                                       |
| ---------------------------------- | -------------------------------------------------- |
| `CSRF_SECRET`                      | CSRF-Token-Secret (min. 32 Zeichen)                |
| `DB_MYSQL_PASSWORD`                | MySQL-Passwort                                     |
| `DB_POSTGRES_PASSWORD`             | PostgreSQL-Passwort                                |
| `ACME_EAB_HMAC_KEY`                | ACME HMAC-Key                                      |
| `INITIAL_ADMIN_SETUP_TOKEN(_FILE)` | Einmaliger Ownership-Claim; Secret-File bevorzugen |

Jede Umgebungsvariable kann alternativ über `<NAME>_FILE` aus einer Datei geladen werden. Direkter Wert und `_FILE`
dürfen nicht gleichzeitig gesetzt sein. Der Loader verlangt absolute Pfade, reguläre Dateien ohne Symlinks,
Dateirechte `0600` oder strenger, nicht gruppen-/weltbeschreibbare Elternverzeichnisse sowie standardmäßig höchstens 64 KiB
(`SECRET_FILE_MAX_BYTES`, hart begrenzt auf 1 MiB). Er vergleicht den geöffneten Deskriptor erneut mit dem geprüften
Inode und lehnt NUL-Bytes ab.

## Interne Secrets

| Datei                                      | Beschreibung                                 |
| ------------------------------------------ | -------------------------------------------- |
| `/data/shieldpm/keys.json`                 | JWT-Signatur- und Anwendungsschlüssel        |
| `/data/shieldpm/initial-admin-setup-token` | One-Time-Token bis zum atomaren ersten Claim |
| `/data/tls/*`                              | SSL-Zertifikate und private Schlüssel        |

## Sicherheitsmechanismen

- Passwort-Hashing: `bcryptjs`
- JWT: `jsonwebtoken`
- CSRF: `csrf-csrf`
- Rate-Limiting: `express-rate-limit`
- Security-Header: `helmet`
- 2FA: TOTP, WebAuthn, Duo
- Secrets aus Dateien: nur reguläre Nicht-Symlink-Dateien mit restriktiven Rechten
- GitOps snapshot v2: Secret-bearing Inhalte werden abgelehnt, nicht exportiert
- Terminal: HMAC-One-Time-Ticket plus gepinnter SSH-Host-Key
- Forwarded-Header werden nur bei `TRUST_PROXY=1` für die offizielle Single-Proxy-Topologie akzeptiert; breitere
  Vertrauenswerte werden abgelehnt.

## Verwandte Seiten

- [Umgebungsvariablen](./umgebungsvariablen.md)
