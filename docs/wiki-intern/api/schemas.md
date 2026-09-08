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

Parallele Aufrufe des Loaders teilen sich dieselbe laufende Kompilierung. Nach einem Lesefehler darf der nächste Aufruf erneut kompilieren; ein erfolgreiches Ergebnis wird im Speicher wiederverwendet. Die Versionsnummer stammt aus `backend/package.json`, auch bei `/docs/swagger.json`.

Die Antwortverträge beschreiben den Health-Bootstrap mit Demo- und CSRF-Feldern, Access-List-Arrays und die kompakte Benutzerzusammenfassung bei Anmeldung, Refresh und zweitem Faktor. Logout antwortet mit HTTP 204 ohne JSON-Körper. Fehler stehen unter `error`; alle dokumentierten Authentifizierungsanforderungen verweisen auf das definierte `bearerAuth`-Schema. Die Tests `schema-response-contracts.spec.js` und `schema-compilation.spec.js` prüfen diese Verträge neben der OpenAPI-Validierung.

## Verwandte Seiten

- [API-Überblick](./ueberblick.md)
- [API-Routen](./routen.md)
