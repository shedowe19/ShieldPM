# API-Schemas

## Zweck

Beschreibung der OpenAPI/Swagger Schema-Struktur.

## Dateien

| Datei                         | Beschreibung                         |
| ----------------------------- | ------------------------------------ |
| `backend/schema/swagger.json` | Hauptdatei                           |
| `backend/schema/common.json`  | Gemeinsame Definitionen              |
| `backend/schema/index.js`     | Schema-Loader                        |
| `backend/schema/components/`  | Wiederverwendbare Schema-Komponenten |
| `backend/schema/paths/`       | Endpunkt-Pfad-Definitionen           |

## Schema-Validierung

Die API verwendet `ajv` (Another JSON Schema Validator) zur Validierung eingehender Requests gegen die definierten Schemas.

Datei: `backend/validate-schema.js`

Parallele Aufrufe des Loaders teilen sich dieselbe laufende Kompilierung. Nach einem Lesefehler darf der nächste Aufruf erneut kompilieren; ein erfolgreiches Ergebnis wird im Speicher wiederverwendet. Die Versionsnummer stammt aus `backend/package.json`, auch bei `/docs/swagger.json`.

Die Antwortverträge beschreiben den Health-Bootstrap mit Demo- und CSRF-Feldern, Access-List-Arrays und die kompakte Benutzerzusammenfassung bei Anmeldung, Refresh und zweitem Faktor. Logout antwortet mit HTTP 204 ohne JSON-Körper. Fehler stehen unter `error`; alle dokumentierten Authentifizierungsanforderungen verweisen auf das definierte `bearerAuth`-Schema. Die Tests `schema-response-contracts.spec.js` und `schema-compilation.spec.js` prüfen diese Verträge neben der OpenAPI-Validierung.

Bei `POST /users/{userID}/login` enthält die JSON-Antwort `expires`, das Benutzerprofil und den zur übernommenen Identität passenden `csrfToken`; das JWT wird über das HttpOnly-Cookie `shieldpm_jwt` gesetzt. Der veraltete Refresh über `GET /tokens` liefert zusätzlich zu Token und Ablaufzeit die minimale Identität `user: { id }`. Das Schema erlaubt diese Identität optional und schließt weitere Benutzerfelder aus. `auth-response-contracts.spec.js` gleicht beide Verträge mit den tatsächlichen HTTP-Antworten der Express-Routen ab und prüft die ausgeschlossenen Felder.

Bei Proxy-Hosts liefert eine Anfrage ohne `page` und `limit` ein Array; mit einem dieser Parameter enthält die Antwort `items` und `pagination`. Das Schema beschreibt beide Formen sowie die Such- und Paginationparameter. Ein Update der Git-Konfiguration antwortet mit demselben kompakten Status wie der Git-Status-GET. Die Enum-Felder `adv_limit_req_unit` und `terminal_auth_type` erlauben den in der Datenbank vorgesehenen Wert `null`.

Ein einzelnes Zertifikat wird über `POST /api/nginx/certificates/retrieve` mit `id` und optionalem `expand` abgerufen. Die Antwort erlaubt die bereinigten Host-Beziehungen und ältere, nicht geheime Kontometadaten; DNS-Zugangsdaten bleiben ausgeschlossen. Bei der Zertifikatprüfung dürfen Zertifikat, Schlüssel und Zwischenzertifikat unabhängig hochgeladen werden. Zertifikatinformationen enthalten `sans`; `cn` ist bei Zertifikaten ohne Common Name optional. Beim Ersetzen eines gespeicherten Zertifikats ist die Zertifikatdatei erforderlich, während ein bereits gespeicherter passender Schlüssel wiederverwendet werden darf.

`fourth-published-contracts.spec.js` prüft diese Antwort- und Uploadverträge gegen das vollständig aufgelöste Schema. Diese Prüfungen und `validate-schema.js` ersetzen keine Zertifikatausstellung oder einen Test gegen einen externen DNS-Anbieter.

Die vier optionalen DDNS-Statuswerte (`last_ipv4`, `last_ipv6`, `last_updated_on`, `last_error`) erlauben `null`, wie es neu angelegte Anbieter und erfolgreiche Updates tatsächlich zurückgeben. `sixth-integrations-ddns-response-contract.spec.js` prüft die vollständigen Antworten des echten Express-Routers mit SQLite. Audit-Ereignisse erlauben `object_id: 0` für Ressourcen mit textuellen IDs; bei Einstellungen steht die tatsächliche ID in `meta.setting_id`. `sixth-settings-audit-contract.spec.js` prüft dazu ein durch den realen Settings-Service erzeugtes Ereignis.

CSRF-Ablehnungen vor der Routenausführung enthalten bei HTTP 403 zusätzlich `error.reason: "EBADCSRFTOKEN"`. Andere Berechtigungsfehler erhalten diesen Marker nicht. Der Browserclient darf ausschließlich diese Ablehnung nach einer frischen Health-Abfrage einmal mit unveränderter Sitzungsrevision wiederholen. Bereits durch die Route ausgeführte Aktionen werden damit nicht erneut abgesendet.

## Verwandte Seiten

- [API-Überblick](./ueberblick.md)
- [API-Routen](./routen.md)
