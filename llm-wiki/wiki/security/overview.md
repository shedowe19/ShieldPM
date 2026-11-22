# Sicherheit

Status: active
Last verified: 2026-11-23
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
| Host-Eingaben      | zentrale Validierung aller Nginx-/Lua-Felder vor jedem Schreibpfad                   | `backend/lib/host-input.js`                                                                            |
| Admin-Gates        | `path`-Modus, `advanced_config`, interne/private Upstreams, unix-Sockets, interne CA | `lib/host-input.js`, `routes/nginx/certificates.js`                                                    |
| Setup              | Einmal-Token (`SETUP_TOKEN` oder `/data/setup-token`, 0600)                          | `backend/setup.js`, `routes/users.js`                                                                  |
| Audit-Kontext      | IP, User-Agent, Session-, Request-ID, Outcome, Actor je Request                      | `lib/request-context.js`, `internal/audit-log.js`                                                      |
| Secret-Redaktion   | Logger, Settings-API, GitOps-Export und Host-Antworten maskieren Geheimnisse         | `backend/logger.js`, `internal/setting.js`, `internal/gitops.js`, `lib/host-response.js`               |

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

## Prüfung 2026-11 und Behebung

Drei Prüfrunden mit 39 Rollen (rund 498 Rohbefunde, 463 nach Zusammenführung)
ergaben drei kritische und 69 hohe Themen. Die kritischen lagen alle an den
Trust-Grenzen: `path`-Forwarding gab `/data` frei, Host-Felder wurden als
vertrauenswürdige Nginx-/Lua-Konfiguration behandelt, und die interne CA
signierte beliebige Client-Zertifikate. Alle drei sind im Branch
`fix/security-hardening` behoben; die Behebung ist read-only geprüft und durch
Regressionstests abgesichert.

Was bewusst außerhalb des Repositories bleibt:

- Zertifizierungen (ISO 27001, SOC 2, PCI DSS, CRA), Auditor-Rolle und Access
  Reviews.
- AVV/SCC/TIA für externe Anbieter, DSAR-Verfahren und ein unterschriebener
  Retention-Plan.
- GitHub-Branch-Protection und Organisationsrichtlinien.
- Live-Restore-Drill und Penetrationstest gegen eine laufende Instanz.
- Cosign-Signatur der Release-Artefakte und SBOM-Attestierung im manuellen
  `docker-latest`-Push (der Haupt-Build attestiert Provenienz und SBOM).
- Rotation des bestehenden AES-Schlüssels (Formatwechsel und Re-Encrypt-
  Migration nötig).
- OIDC-Step-up-UI für lokale 2FA (das Backend lehnt den Login ohne zweiten
  Faktor ab; eine eigene Challenge-Oberfläche fehlt).

## Abhängigkeiten

- Sicherheitsrelevante transitive Abhängigkeiten werden in
  `backend/package.json` über `resolutions` auf gepatchte Versionen gepinnt.
  Stand 2026-11-04: `express/**/qs` 6.16.1, `archiver/**/minimatch` 11.0.4; im
  Frontend-Lockfile `seroval` 1.6.11.
- `backend/test/ci/dependabot-security-resolutions.spec.js` prüft die Lockfiles
  gegen festgelegte Mindestversionen, `npm-package-constraints.spec.js` die
  erlaubten Pins. Beide laufen in der CI.
- Offene Dependabot-Alarme werden zusätzlich im Repository überwacht; die
  Lockfiles sind die Quelle der Wahrheit, nicht die Anzeige im Advisory-Dashboard.

## Statische Analyse

- CodeQL analysiert JavaScript auf `develop`, `main`, `master` und `feature/*`.
- Der Wiki-Checker entfernt HTML-Kommentare und Tags mit Scannern statt mit
  einem einzelnen Regex; so ist die Bereinigung vollständig und die
  Zeilennummern bleiben erhalten.
- Der generierte Graph `llm-wiki/wiki/reference/wiki-graph.html` ist von CodeQL
  ausgenommen: Er bettet minifizierte Fremdbibliotheken für den Offline-Betrieb
  ein; die Quelle ist `scripts/wiki-graph.py`.

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
