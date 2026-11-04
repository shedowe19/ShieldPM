# Sicherheit

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

ShieldPM wirbt mit Sicherheit als Kernprinzip. Diese Seite ordnet die
Schutzmechanismen ein: was die Anwendung selbst absichert, was Nginx absichert
und was extern bleibt.

## Schutzschichten der Anwendung

| Mechanismus        | Umsetzung                                                                            | Ort                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Sicherheits-Header | `helmet` mit eigener CSP                                                             | `backend/app.js:144-164`                                                                               |
| Rate-Limit         | 500 Anfragen/15 min je IP                                                            | `backend/app.js:116-131`                                                                               |
| CSRF               | Double-Submit-Cookie                                                                 | `backend/app.js:166-246`                                                                               |
| JWT-Auth           | Bearer oder Cookie `shieldpm_jwt`                                                    | `backend/lib/express/jwt.js`                                                                           |
| Sitzungen          | serverseitig widerrufbar                                                             | `internal/auth-session-service.js`, `internal/sessions.js`                                             |
| Passwörter         | gehasht über `bcryptjs` (Model/Reset)                                                | `backend/models/auth.js`, `backend/password-reset.js`; `lib/auth-password.js` prüft nur die Richtlinie |
| 2FA                | TOTP, Passkey (WebAuthn), Duo, Backup-Codes                                          | `internal/2fa-service.js`, `routes/2fa.js`                                                             |
| OIDC               | `openid-client`                                                                      | `routes/oidc.js`                                                                                       |
| Berechtigungen     | JSON-Schemas je Aktion                                                               | `lib/access/`                                                                                          |
| Verschlüsselung    | sensible Felder                                                                      | `lib/encryption.js`                                                                                    |
| Demo-Schutz        | sperrt ausgewählte Admin-Bereiche, prüft Host-Payloads (kein globaler Schreibschutz) | `lib/express/demo.js`                                                                                  |

## Schutz auf Nginx-Ebene

- **Access-Lists:** Basic Auth und mTLS, verwaltet in der UI, als Dateien
  materialisiert (`internal/access-list.js`, `lib/access-list-files.js`).
- **IP-Firewall je Proxy-Host:** Geo-Lookups plus Server-Filter, eigene
  403-Sperrseite (`backend/templates/_ip_firewall.conf`, `ip-blocked.html`).
- **WAF:** ModSecurity mit OWASP CRS v4 und optional OpenAppSec als Attachment.
- **IPS:** CrowdSec über Lua-Bouncer, Konfiguration im Basis-Image.
- **TLS:** ACME/Let's Encrypt, interne PKI, eigene Zertifikate.

Wichtig: ModSecurity-Regelsätze, CrowdSec-Parser und der Lua-Bouncer liegen
teilweise im Repository `shieldpm-nginx` oder in `rootfs/` — nicht in der
Anwendungslogik.

## Secrets

- Instanzschlüssel: `/data/shieldpm/keys.json` (nicht versionieren).
- Zertifikate und private Schlüssel: `/data/tls/**`.
- Datenbankzugangsdaten: Umgebung oder `/data/shieldpm/default.json`.
- Das Wiki dokumentiert ausschließlich Variablennamen und Pfade, nie Werte.

## Risiken und Stolperfallen

- **CSRF-Secret fehlt:** Tokens werden bei jedem Neustart ungültig; im Betrieb
  führt das zu sporadischen 403-Fehlern.
- **`TRUST_PROXY`:** Falsch gesetzt, greift das Rate-Limit auf die falsche IP.
- **Berechtigung vergessen:** Ein neuer interner Dienst ohne `access.can(...)`
  ist für jeden authentifizierten Benutzer erreichbar.
- **Fehlerdetails:** `public: true` leakt Meldungen nach außen. Interne Ursachen
  gehören in `previous`/Logs.
- **IP-Firewall:** Schützt nur HTTP/HTTPS-Proxy-Hosts, keine Streams und kein
  TLS-Passthrough. Bestehende Verbindungen werden nicht getrennt.
- **Backup-Dateien:** Instanzbackups sind verschlüsselt; der Schlüssel gehört
  nicht ins gleiche Backup-Ziel.

## Abhängigkeiten

- Sicherheitsrelevante transitive Abhängigkeiten werden in
  `backend/package.json` über `resolutions` auf gepatchte Versionen gepinnt.
  Stand 2026-11-04: `express/**/qs` 6.16.1; im Frontend-Lockfile `seroval`
  1.6.11.
- `backend/test/ci/dependabot-security-resolutions.spec.js` prüft die Lockfiles
  gegen festgelegte Mindestversionen, `npm-package-constraints.spec.js` die
  erlaubten Pins. Beide laufen in der CI.
- Offene Dependabot-Alarme werden zusätzlich im Repository überwacht; die
  Lockfiles sind die Quelle der Wahrheit, nicht die Anzeige im Advisory-Dashboard.

## Offene Fragen

- Unklar: Ob die globale Rate-Limit-Grenze für öffentlich erreichbare Instanzen
  ausreicht. `confidence: low`.

## Verwandte Seiten

- [Request-Lebenszyklus](../architecture/request-lifecycle.md)
- [Backend](../backend/overview.md)
- [Konfiguration](../infrastructure/configuration.md)
- [Secrets und Sicherheit (Tiefe)](../reference/konfiguration/secrets-und-sicherheit.md)
- [IP-Firewall (Tiefe)](../reference/module/ip-firewall.md)
- [Benutzer und Auth (Tiefe)](../reference/module/benutzer-auth.md)
