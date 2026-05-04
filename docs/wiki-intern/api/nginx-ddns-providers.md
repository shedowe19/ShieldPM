# Nginx DDNS-Provider Routes

## Zweck

API-Routen für DDNS-Provider-Verwaltung.

## Wichtige Dateien

- `backend/routes/nginx/ddns_providers.js` — REST-API-Routen unter `/api/nginx/ddns-providers`
- `backend/internal/ddns-provider.js` — Business-Logik
- `backend/models/ddns_provider.js` — Objection.js-Modell

## Endpunkte

| Methode | Pfad                            | Beschreibung               |
| ------- | ------------------------------- | -------------------------- |
| GET     | `/api/nginx/ddns-providers`     | Alle DDNS-Provider listen  |
| POST    | `/api/nginx/ddns-providers`     | Neuen Provider erstellen   |
| GET     | `/api/nginx/ddns-providers/:id` | Einzelnen Provider abrufen |
| PUT     | `/api/nginx/ddns-providers/:id` | Provider aktualisieren     |
| DELETE  | `/api/nginx/ddns-providers/:id` | Provider löschen           |

## Verwandte Seiten

- [DDNS-Provider](../module/ddns-provider.md)
- [DDNS](../module/ddns.md)
- [API-Überblick](./ueberblick.md)
- [Routen](./routen.md)
