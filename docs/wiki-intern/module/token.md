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
- Enthält Scopes und User-ID im Payload; aktuelle Rollen und Berechtigungen werden bei der API-Anfrage aus der Datenbank geladen.

## Abhängigkeiten

- `jsonwebtoken` — JWT Bibliothek

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Authentifizierung vor der Berechtigungsprüfung

`backend/lib/access.js` prüft bereits bei `Access.load()` das signierte Token, den aktuellen aktiven Benutzer und dessen zulässige Scopes. Damit ist ein Konto auch dann geprüft, wenn eine Route anschließend nur auf die Benutzer-ID zugreift. Eine ausstehende zweite Faktorprüfung gilt nicht als vollständige Anmeldung. Explizit freigegebene interne Zugriffe ohne Token bleiben für interne Abläufe verfügbar.

Regressionstest: `backend/test/lib/access-authentication.spec.js`.

Die Aktionsvalidatoren werden unabhängig von Benutzeridentitäten wiederverwendet. Benutzer-ID, Rollen und aktuelle Capabilities bleiben Eingabedaten. Die Selbstkonto-Regeln vergleichen die Ziel-ID mit der aktuellen Benutzer-ID; eine erfolgreiche Prüfung für Benutzer A berechtigt Benutzer B nicht zum Zugriff auf A. Details und Cache-Regressionen stehen bei den [Backend-Hilfsbibliotheken](../architektur/backend-lib.md#begrenzte-schema--und-berechtigungsprüfung).

## Verwandte Seiten

- [Auth-Session-Service](./auth-session-service.md)
- [Benutzer & Auth](./benutzer-auth.md)
- [Modulübersicht](./README.md)
