# Request-Lebenszyklus (Backend)

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite beschreibt den Weg eines API-Aufrufs durch Express, inklusive der
Reihenfolge der Middleware. Sie ist wichtig, weil die Reihenfolge das
Sicherheitsverhalten bestimmt: Wer Middleware umsortiert, ändert CSRF-, Auth- und
Rate-Limit-Verhalten.

## Was existiert

`backend/app.js` baut die App in dieser Reihenfolge (`backend/app.js:136-324`):

1. `helmet` mit eigener Content-Security-Policy
2. `express-rate-limit` als globaler API-Limiter: 500 Anfragen je IP und 15 Minuten
3. `cookie-parser`
4. `jwt()` aus `backend/lib/express/jwt.js`
5. CSRF-Middleware (Double-Submit-Cookie, siehe unten)
6. CSRF-Token-Erzeugung und `res.locals.csrfToken`
7. `jsonBody` (eigener JSON-Parser mit Größen-/Formbegrenzung)
8. `express.urlencoded`
9. `checkDemoMode` aus `backend/lib/express/demo.js`
10. Swagger UI unter `/docs` und rohe Spezifikation unter `/docs/swagger.json`
11. `mainRoutes` unter `/`
12. Zentrale Fehlermiddleware

## Wie es funktioniert

- **Trust Proxy:** Standard ist `1`; `TRUST_PROXY` akzeptiert `true`/`false`,
  Zahlen oder einen Ausdruck (`backend/app.js:19-38`).
- **CSRF:** Cookie `XSRF-TOKEN`, Header `x-xsrf-token`, Secret aus
  `CSRF_SECRET`. Fehlt das Secret, wird pro Start ein Zufallswert erzeugt und
  gewarnt — CSRF-Tokens werden dann bei jedem Neustart ungültig
  (`backend/app.js:39-44`).
- **CSRF-Ausnahmen:** Login, Token-Refresh, Logout, 2FA-Verifikation (ohne Duo),
  Docs-Endpunkte und die allererste Benutzeranlage während des Setup-Wizards.
  Duo `begin`/`complete` sind **nicht** ausgenommen und brauchen das anonyme Token
  aus dem Health-Bootstrap. Für alle `POST /tokens…` gilt zusätzlich die
  Content-Type-Prüfung: nur JSON oder ein bodyloser Request wird akzeptiert,
  sonst `415` (`backend/app.js:205-221`).
- **CSRF-Identität:** Die Sitzungskennung für das Token ist die stabile
  Benutzer-ID, nicht die JWT-`jti`; damit überlebt das Token einen Refresh.
  Anonyme Requests nutzen einen Hash aus IP und User-Agent (`backend/app.js:84-101`).
- **Rate-Limit:** Die Prüfung auf `trustProxy`/`X-Forwarded-For` ist im Limiter
  abgeschaltet, weil Nginx davor sitzt (`backend/app.js:127-130`).
- **Fehlerformat:** `{ "error": { "code": <status>, "message": <text> } }`. Nur
  Fehler mit `public === true` geben ihre Meldung weiter, sonst `Internal Error`.
  CSRF-Fehler tragen zusätzlich `reason: "EBADCSRFTOKEN"`
  (`backend/app.js:328-360`).

## Interfaces und Daten

- Health/Status: `GET /` liefert `status`, `setup`, `version`, `demo` und ein
  frisches `csrfToken` (`backend/routes/main.js:48-59`).
- Der Unix-Socket liegt unter `/run/shieldpm/shieldpm.sock` (`backend/index.js:79`);
  der Installer nutzt denselben Pfad (`scripts/install.sh:1065`).
- Nginx entfernt den `/api`-Präfix; Routen und CSRF-Ausnahmen behandeln beide
  Varianten (`backend/app.js:167`, `backend/app.js:203-232`).

## Risiken und Stolperfallen

- Middleware, die vor `jwt()` eingefügt wird, sieht keinen Benutzerkontext.
- Ein eigener `express.json()`-Aufruf umgeht die Grenzen von `jsonBody`.
- Neue öffentliche Endpunkte ohne CSRF-Ausnahme brauchen ein gültiges Token; das
  ist gewollt und sollte nicht aufgeweicht werden.
- `app.enable("strict routing")` und `Router({ strict: true })` bedeuten: `/api/foo/`
  ist nicht `/api/foo`.

## Offene Fragen

- Ob die 500/15-min-Grenze für alle Deployments passt, ist eine Bewertungsfrage:
  sie ist fest kodiert und nicht über eine Umgebungsvariable konfigurierbar.
  Prüfstelle: [Offene Fragen](../questions/open-questions.md).

## Verwandte Seiten

- [Architektur](./overview.md)
- [Backend](../backend/overview.md)
- [API-Überblick](../api/overview.md)
- [Sicherheit](../security/overview.md)
- [Express-Middleware (Tiefe)](../reference/architektur/express-middleware.md)
