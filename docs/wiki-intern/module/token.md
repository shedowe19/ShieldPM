# Token

## Zweck

Verwaltung von JWT (JSON Web Tokens) für die API-Authentifizierung.

## Kontext

Geschützte API-Anfragen benötigen Authentifizierung; öffentliche Anmelde- und Statusendpunkte sind ausgenommen. Dieses Modul handhabt die Erzeugung und Validierung von JWTs; Refresh-Sitzungen verwaltet [Auth-Session-Service](./auth-session-service.md).

## Wichtige Dateien

- `backend/internal/token.js` (6 KB) — JWT-Token-Verwaltung
- `backend/routes/tokens.js` — API-Routen für Login/Logout

## Verhalten

- `backend/lib/config.js` liest/erstellt die Signaturschlüssel unter `/data/shieldpm/keys.json`; `start.sh` verschiebt gegebenenfalls eine ältere `/data/keys.json` an diesen Pfad.
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

- [Auth-Session-Service](./auth-session-service.md)
- [Benutzer & Auth](./benutzer-auth.md)
- [Modulübersicht](./README.md)
