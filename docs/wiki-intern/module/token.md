# Token

## Zweck

Verwaltung von JWT (JSON Web Tokens) für die API-Authentifizierung.

## Kontext

Authentifizierte API-Aufrufe verwenden JWTs. Bootstrap, Login, OIDC und Dokumentation enthalten bewusst öffentliche
Teilflüsse; die Access-Schicht entscheidet pro fachlicher Operation über die vollständige Anmeldung und Berechtigung.
Dieses Modul handhabt Erzeugung, Validierung und Verwaltung der JWT-Tokens.

## Wichtige Dateien

- `backend/internal/token.js` (6 KB) — JWT-Token-Verwaltung
- `backend/routes/tokens.js` — API-Routen für Login/Logout

## Verhalten

- Liest/erstellt Schlüssel unter `/data/shieldpm/keys.json` zur Signierung.
- Verifiziert eingehende Tokens (Middlewares).
- Enthält Berechtigungen und User-ID im Payload.

## Abhängigkeiten

- `jsonwebtoken` — JWT Bibliothek

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Authentifizierung vor der Berechtigungsprüfung

`backend/lib/access.js` prüft bereits bei `Access.load()` das signierte Token, den aktuellen aktiven Benutzer und dessen zulässige Scopes. Damit ist ein Konto auch dann geprüft, wenn eine Route anschließend nur auf die Benutzer-ID zugreift. Eine ausstehende zweite Faktorprüfung gilt nicht als vollständige Anmeldung. Explizit freigegebene interne Zugriffe ohne Token bleiben für interne Abläufe verfügbar.

Regressionstest: `backend/test/lib/access-authentication.spec.js`.

## Verwandte Seiten

- [Benutzer & Auth](./benutzer-auth.md)
- [Modulübersicht](./README.md)
