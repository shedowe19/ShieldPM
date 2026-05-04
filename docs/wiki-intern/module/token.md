# Token

## Zweck

Verwaltung von JWT (JSON Web Tokens) für die API-Authentifizierung.

## Kontext

Jede API-Anfrage an das Backend erfordert eine Authentifizierung. Dieses Modul handhabt die Erzeugung, Validierung und Verwaltung dieser JWT-Tokens.

## Wichtige Dateien

- `backend/internal/token.js` (6 KB) — JWT-Token-Verwaltung
- `backend/routes/tokens.js` — API-Routen für Login/Logout

## Verhalten

- Liest/Erstellt Schlüssel unter `/data/keys.json` zur Signierung.
- Verifiziert eingehende Tokens (Middlewares).
- Enthält Berechtigungen und User-ID im Payload.

## Abhängigkeiten

- `jsonwebtoken` — JWT Bibliothek

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Benutzer & Auth](./benutzer-auth.md)
- [Modulübersicht](./README.md)
