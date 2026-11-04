# API: Schemas und Validierung

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite erklärt, wie Requests validiert und wie die OpenAPI-Dokumentation aus
dem Repository erzeugt wird. Sie zeigt, wo ein neues Schema hingehört.

## Was existiert

| Datei                         | Rolle                                                               |
| ----------------------------- | ------------------------------------------------------------------- |
| `backend/schema/index.js`     | lädt und dereferenziert das OpenAPI-Schema, cached die Kompilierung |
| `backend/schema/swagger.json` | OpenAPI-Beschreibung                                                |
| `backend/schema/common.json`  | gemeinsame Schema-Bausteine                                         |
| `backend/lib/access/*.json`   | Berechtigungsschemas je Aktion                                      |

## Wie es funktioniert

1. Eine Route lädt ihr JSON-Schema (über AJV) und validiert `req.body`/`req.params`.
2. `getCompiledSchema()` dereferenziert `$ref`s einmalig und liefert die
   OpenAPI-Spezifikation (`backend/app.js:294`).
3. Swagger UI wird unter `/docs` ausgeliefert und lädt die Spezifikation über
   `/api/schema` (`backend/app.js:302-322`).
4. Die rohe Spezifikation ist zusätzlich unter `/docs/swagger.json` abrufbar
   (`backend/app.js:297-300`).

## Regeln

- Neue Eingaben werden per JSON Schema validiert, nicht per Hand im Dienst
  (`.cursorrules:187`).
- AJV läuft mit `allErrors` und `coerceTypes` im Permission-Pfad
  (`backend/lib/access.js:25-39`); dadurch werden Zahlen aus Strings übernommen.
- Berechtigungsschemas sind reine Felddefinitionen; die einschränkende
  `additionalProperties: false` sitzt nur am äußeren Wrapper in
  `backend/lib/access.js:48`. Ein neues Feld in einer Aktion muss deshalb im
  zugehörigen JSON ergänzt werden, sonst sieht es die Prüfung nicht.
- Die Spezifikation ist nicht automatisch vollständig: Endpunkte können existieren,
  ohne in `swagger.json` zu stehen.

## Risiken und Stolperfallen

- **Schema-Drift:** Swagger und echte Routen können auseinanderlaufen. Die
  CI-Vertragstests unter `backend/test/schema/` prüfen veröffentlichte Verträge,
  aber nicht jede Route.
- **`coerceTypes`:** `"1"` wird zu `1`; das ist gewollt, kann aber stille
  Typänderungen erzeugen.
- **Dereferenzierung:** Ein Zyklus in `$ref` bricht `getCompiledSchema()` beim Start.

## Offene Fragen

- TODO: Analytics-, OIDC-, GitOps- und Upload-Relay-Routen in `swagger.json`
  nachziehen. Aufgabe: **T-004**.

## Verwandte Seiten

- [API-Überblick](./overview.md)
- [Endpunkte](./endpoints.md)
- [Backend](../backend/overview.md)
- [Schemas (Tiefe)](../reference/api/schemas.md)
