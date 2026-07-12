# Access-Lists

## Zweck

Zugriffskontrolle für Proxy-Hosts via Basic Auth, IP-Ranges und mTLS.

## Kontext

Access-Lists können an Proxy-Hosts gebunden werden, um den Zugriff einzuschränken.

## Wichtige Dateien

- `backend/internal/access-list.js` (17 KB) — Business-Logik
- `backend/internal/ip_ranges.js` (3 KB) — Cloudflare IP-Ranges
- `backend/models/access_list.js` (3 KB) — Objection.js-Modell
- `backend/models/access_list_auth.js` (1 KB) — Basic-Auth-Modell
- `backend/models/access_list_client.js` (1 KB) — IP-Client-Modell
- `backend/routes/nginx/access_lists.js` (3 KB) — API-Routen
- `frontend/src/modals/AccessListModal.tsx` — Dialog für Erstellung und Bearbeitung
- `frontend/src/modals/AccessListFormTabs.tsx` — gemeinsame Tab-Navigation mit Formik-gebundenem SSO-Status
- `frontend/src/modals/AccessListModalSubmission.ts` — serialisiert den Formularzustand zum API-Payload
- `frontend/src/modals/AccessListModalValidation.ts` — prüft den Formularzustand vor der Übermittlung
- `frontend/src/modals/AccessListDetailsTab.tsx` — Formik-gebundener Details- und Optionen-Tab
- `frontend/src/modals/AccessListSsoTab.tsx` — Formik-gebundene Authentik-, OAuth2-Proxy- und OIDC-Felder

## Verhalten

- Basic Auth: Benutzername + bcrypt-gehashtes Passwort
- IP-Ranges: Allow/Deny basierend auf Client-IP
- mTLS: Client-Zertifikat-Authentifizierung
- Access-Lists werden in htpasswd-Dateien unter `/data/access/` geschrieben
- Der Details-Tab bindet Name sowie die Optionen „Satisfy Any“ und „Pass Auth“ weiter direkt an denselben
  Formik-Formularzustand des Dialogs. `AccessListDetailsTab.test.tsx` sichert diese Wertebindung.
- Der SSO-Tab bindet Provider und dessen Authentik-, OAuth2-Proxy- oder OIDC-Felder direkt an denselben
  Formik-Formularzustand. `AccessListSsoTab.test.tsx` sichert Provider- und Authentik-Host-Wertebindung.
- Die gemeinsame Tab-Navigation leitet die unveränderten Basic-Auth- und Client-Regeln an die jeweiligen Untertabs
  weiter und sperrt sie bei aktivem SSO weiterhin über den aus demselben Formik-Status abgeleiteten Wert.
- Die Submission-Serialisierung übernimmt die aktive Authentifizierungsart in `meta`, entfernt ungenutzte OAuth2- bzw.
  OIDC-Felder und sendet bei deaktiviertem externen mTLS keinen Zertifikatstext. Sie reduziert Clients und Credentials
  auf die editierbaren API-Felder.
- Die ausgelagerte Formularvalidierung behält die bisherige Prüfungsreihenfolge und die bestehenden Fehlermeldungen für
  leere Listen, unvollständige SSO- und mTLS-Konfigurationen sowie doppelte Benutzernamen bei.

## Abhängigkeiten

- `internal/nginx.js` — Config-Generierung
- `internal/audit-log.js` — Protokollierung
- `bcryptjs` — Passwort-Hashing

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Zertifikate](./zertifikate.md)
- [Interne PKI](./pki.md)
- [IP-Ranges](./ip-ranges.md)
- [Benutzer & Auth](./benutzer-auth.md)
- [OAuth2-Proxy (SSO)](./oauth2-proxy.md)
- [Modulübersicht](./README.md)
