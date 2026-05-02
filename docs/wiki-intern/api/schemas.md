# API-Schemas

## Zweck

Beschreibung der OpenAPI/Swagger Schema-Struktur.

## Dateien

| Datei                         | Beschreibung                         |
| ----------------------------- | ------------------------------------ |
| `backend/schema/swagger.json` | Hauptdatei (11 KB)                   |
| `backend/schema/common.json`  | Gemeinsame Definitionen (5 KB)       |
| `backend/schema/index.js`     | Schema-Loader                        |
| `backend/schema/components/`  | Wiederverwendbare Schema-Komponenten |
| `backend/schema/paths/`       | Endpunkt-Pfad-Definitionen           |

## Schema-Validierung

Die API verwendet `ajv` (Another JSON Schema Validator) zur Validierung eingehender Requests gegen die definierten Schemas.

Datei: `backend/validate-schema.js`

## Verwandte Seiten

- [API-Überblick](./ueberblick.md)
- [API-Routen](./routen.md)
