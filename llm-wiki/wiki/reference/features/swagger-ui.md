# Swagger UI

## Zweck

Interaktive API-Dokumentation unter `/docs` via Swagger UI. Ermöglicht das Entdecken und Testen aller API-Endpunkte direkt im Browser.

## Kontext

ShieldPM stellt Swagger UI unter `/docs` bereit. Das OpenAPI-Schema wird aus `backend/schema/swagger.json` und seinen referenzierten Pfad-/Komponentendateien kompiliert. Einzelne Routen und Beispiele sind gegen die tatsächlichen Express-Routen zu prüfen; die UI garantiert keine vollständige Abdeckung jeder Backend-Funktion.

## Wichtige Dateien

- `backend/app.js` — Swagger UI Middleware (montiert vor `mainRoutes`)
- `backend/schema/swagger.json` — Hauptschema (referenziert alle Pfad-Dateien)
- `backend/schema/paths/` — Einzelne Pfad-Definitionen (pro Endpunkt ein JSON)
- `backend/schema/components/` — Wiederverwendbare Schema-Komponenten
- `backend/schema/index.js` — Kompiliert das Schema einmalig mit aufgelösten `$ref`-Zeigern
- `backend/routes/schema.js` — GET `/api/schema` — liefert das kompilierte Schema mit laufender Version und Anfrage-Origin aus

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

`GET /docs/swagger.json` gibt das kompilierte rohe Schema zurück; für die UI maßgeblich ist `/api/schema` mit aktueller Server-URL und Backend-Version.

## Server-URL

Das Schema wird über `url: "/api/schema"` geladen. Das Backend injiziert beim Aufruf von `GET /api/schema` die richtige Server-URL:

```javascript
// backend/routes/schema.js
clonedSwaggerJSON.servers[0].url = `${req.protocol}://${req.get("host")}/api`;
```

Dadurch zeigt Swagger UI auf den Host der aktuellen Anfrage, egal ob lokal oder hinter einem korrekt konfigurierten Reverse Proxy. Die globale CSRF-Prüfung gilt auch für schreibende API-Aufrufe aus Swagger UI; eine gültige Sitzung bzw. ein Bearer-Token ersetzt den CSRF-Header nicht.

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
- `GET /api/schema` — Schema-Endpunkt

## Verwandte Seiten

- [API-Überblick](../api/ueberblick.md)
- [2FA-Service](../module/2fa-service.md)
- [Architektur-Entscheidungen](../architektur/entscheidungen.md)
