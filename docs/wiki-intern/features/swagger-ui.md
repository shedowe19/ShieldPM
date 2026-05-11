# Swagger UI

## Zweck

Interaktive API-Dokumentation unter `/docs` via Swagger UI. Ermöglicht das Entdecken und Testen aller API-Endpunkte direkt im Browser.

## Kontext

ShieldPM exponiert seit Version 4.3.2 (Feature-Branch) eine Swagger-UI-Instanz unter dem Pfad `/docs`. Die Dokumentation wird aus dem OpenAPI 3.1-Schema generiert, das alle Endpunkte inklusive Schemas, Request/Response-Modelle und Fehlerstrukturen beschreibt.

## Wichtige Dateien

- `backend/app.js` — Swagger UI Middleware (montiert vor `mainRoutes`)
- `backend/schema/swagger.json` — Hauptschema (referenziert alle Pfad-Dateien)
- `backend/schema/paths/` — Einzelne Pfad-Definitionen (pro Endpunkt ein JSON)
- `backend/schema/components/` — Wiederverwendbare Schema-Komponenten
- `backend/schema/index.js` — Kompiliert das Schema einmalig mit aufgelösten `$ref`-Zeigern
- `backend/routes/schema.js` — GET `/api/schema` — liefert das kompilierte Schema aus

## Setup

```javascript
// backend/app.js
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    swaggerOptions: {
      url: "/api/schema",
      requestInterceptor: (req) => {
        /* CSRF-Header durchreichen */
      },
    },
    customCss: `
        .swagger-ui .topbar { display: none; }
        .swagger-ui .swagger-ui { max-width: 100%; }
    `,
    customSiteTitle: "ShieldPM API Documentation",
  }),
);
```

**Wichtig**: Der Swagger-UI-Mountpoint muss **vor** `app.use("/", mainRoutes)` stehen, da `mainRoutes` alle Pfade abfängt.

## Server-URL

Das Schema wird über `url: "/api/schema"` geladen. Das Backend injiziert beim Aufruf von `GET /api/schema` die richtige Server-URL:

```javascript
// backend/routes/schema.js
clonedSwaggerJSON.servers[0].url = `${req.protocol}://${req.get("host")}/api`;
```

Dadurch zeigt Swagger UI automatisch auf den richtigen Host (`https://shieldpm.clawsucht.eu/api`), egal ob lokal oder in Production.

## Schema-Pflege

Das Schema ist in drei Teile gegliedert:

| Verzeichnis           | Inhalt                                                 |
| --------------------- | ------------------------------------------------------ |
| `schema/paths/`       | Ein JSON pro Endpunkt (GET, POST, etc.)                |
| `schema/components/`  | Wiederverwendbare Objekte (Error, Token, User, etc.)   |
| `schema/swagger.json` | Hauptdokument — referenziert alle Pfade und Components |

### $ref-Pfade

`$ref`-Zeiger werden relativ zur Datei aufgelöst. Die Tiefe ist entscheidend:

| Dateiposition                              | ../-Ebenen zu `components/`  |
| ------------------------------------------ | ---------------------------- |
| `paths/*.json` (1 Level)                   | `../../components/`          |
| `paths/subdir/*.json` (2 Level)            | `../../../components/`       |
| `paths/subdir/nested/*.json` (3 Level)     | `../../../../components/`    |
| `paths/subdir/nested/sub/*.json` (4 Level) | `../../../../../components/` |

**Häufiger Fehler**: Nach dem Verschieben einer Datei werden die `../` nicht angepasst → `$RefParser` kann die Datei nicht finden → ENOENT-Fehler in Production.

## 2FA-Endpunkte im Schema

Folgende Endpunkte sind im Schema dokumentiert:

- `POST /api/tokens/2fa/verify` — TOTP/YubiKey/Backup-Code Verifizierung
- `POST /api/tokens/2fa/passkey/begin` — Passkey-Authentifizierung starten
- `POST /api/tokens/2fa/passkey/complete` — Passkey-Authentifizierung abschließen
- `GET /api/schema` — Öffentlicher Schema-Endpunkt

## Verwandte Seiten

- [API-Überblick](../api/ueberblick.md)
- [2FA-Service](../module/2fa-service.md)
- [Architektur-Entscheidungen](../architektur/entscheidungen.md)
