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

Die OpenAPI-Spezifikation bildet nicht jede implementierte Route ab. Insbesondere fehlen die Analytics-Routen unter `/api/analytics` und `/api/nginx/analytics` sowie einzelne Integrationsrouten in `swagger.json`; die realen Express-Routen in `backend/routes/` bleiben hierfür maßgeblich. Eine vollständige Endpunktabdeckung der interaktiven Dokumentation darf deshalb nicht angenommen werden.

Datei: `backend/validate-schema.js`

Parallele Aufrufe des Loaders teilen sich dieselbe laufende Kompilierung. Nach einem Lesefehler darf der nächste Aufruf erneut kompilieren; ein erfolgreiches Ergebnis wird im Speicher wiederverwendet. Die Versionsnummer stammt aus `backend/package.json`, auch bei `/docs/swagger.json`.

Die Antwortverträge beschreiben den Health-Bootstrap mit Demo- und CSRF-Feldern, Access-List-Arrays und die kompakte Benutzerzusammenfassung bei Anmeldung, Refresh und zweitem Faktor. Logout antwortet mit HTTP 204 ohne JSON-Körper. Fehler stehen unter `error`; alle dokumentierten Authentifizierungsanforderungen verweisen auf das definierte `bearerAuth`-Schema. Die Tests `schema-response-contracts.spec.js` und `schema-compilation.spec.js` prüfen diese Verträge neben der OpenAPI-Validierung.

Bei `POST /users/{userID}/login` enthält die JSON-Antwort `expires`, das Benutzerprofil und den zur übernommenen Identität passenden `csrfToken`; das JWT wird über das HttpOnly-Cookie `shieldpm_jwt` gesetzt. Der veraltete Refresh über `GET /tokens` liefert zusätzlich zu Token und Ablaufzeit die minimale Identität `user: { id }`. Das Schema erlaubt diese Identität optional und schließt weitere Benutzerfelder aus. `auth-response-contracts.spec.js` gleicht beide Verträge mit den tatsächlichen HTTP-Antworten der Express-Routen ab und prüft die ausgeschlossenen Felder.

Bei Proxy-Hosts liefert eine Anfrage ohne `page` und `limit` ein Array; mit einem dieser Parameter enthält die Antwort `items` und `pagination`. Das Schema beschreibt beide Formen sowie die Such- und Paginationparameter. Ein Update der Git-Konfiguration antwortet mit demselben kompakten Status wie der Git-Status-GET. Die Enum-Felder `adv_limit_req_unit` und `terminal_auth_type` erlauben den in der Datenbank vorgesehenen Wert `null`.

Ein einzelnes Zertifikat wird über `POST /api/nginx/certificates/retrieve` mit `id` und optionalem `expand` abgerufen. Die Antwort erlaubt die bereinigten Host-Beziehungen und ältere, nicht geheime Kontometadaten; DNS-Zugangsdaten bleiben ausgeschlossen. Bei der Zertifikatprüfung dürfen Zertifikat, Schlüssel und Zwischenzertifikat unabhängig hochgeladen werden. Zertifikatinformationen enthalten `sans`; `cn` ist bei Zertifikaten ohne Common Name optional. Beim Ersetzen eines gespeicherten Zertifikats ist die Zertifikatdatei erforderlich, während ein bereits gespeicherter passender Schlüssel wiederverwendet werden darf.

`fourth-published-contracts.spec.js` prüft diese Antwort- und Uploadverträge gegen das vollständig aufgelöste Schema. Diese Prüfungen und `validate-schema.js` ersetzen keine Zertifikatausstellung oder einen Test gegen einen externen DNS-Anbieter.

`certificate-request.json` und `certificate-object.json` beschreiben `meta.letsencrypt_profile` mit der Enum `standard | shortlived`. Ein fehlender Wert in einer neuen Anfrage wird auf die aktuell wirksame globale Vorgabe aufgelöst. Das Feld ist in Antworten sichtbar und enthält kein Secret. Erstellungsanfragen begrenzen Short-lived-Zertifikate auf 25 Domainnamen und erlauben die Profilauswahl nur für `provider: "letsencrypt"`. Host-Schemas erlauben denselben Wert in `meta` für die Inline-Ausstellung mit `certificate_id: "new"`; ungültige Profilwerte werden abgewiesen. Die zusätzliche Service-Prüfung begrenzt auch geerbte Short-lived-Anfragen auf 25 Namen vor Datenbankänderungen. Der Profilwechsel eines bestehenden Zertifikats ist kein unterstützter Update-Vorgang. Details zur Weitergabe und Erneuerung stehen unter [Zertifikate](../module/zertifikate.md) und [Certbot](../module/certbot.md).

`acme-profile-object.json` beschreibt die Antwort von `GET` und `PUT /api/nginx/certificates/acme-profile`: ausschließlich `profile: "standard" | "shortlived"`. Der PUT-Body verlangt ebenfalls ausschließlich `profile`; Standard ist die anfängliche Datenbankvorgabe. GET verlangt Zertifikats-Listenberechtigung, PUT administrative Settings-Berechtigung. Erst nach erfolgreicher Prüfung von Certbot und bei Short-lived des ACME-Verzeichnisses wird gespeichert. Der generische Settings-PUT akzeptiert diese Einstellung nicht.

`acme-options-object.json` beschreibt die öffentliche Antwort von `GET/PUT /api/settings/acme-options`: `server`, `email`, `account_id`, `eab_kid`, `agree_tos`, `must_staple`, `ocsp_stapling`, `server_tls_verify`, `custom_ocsp_stapling`, `default_certificate_id` und der reine Vorhandenseinsmarker `eab_hmac_key_set`. `acme-options-request.json` verlangt dieselben gewöhnlichen Felder ohne den Marker und erlaubt zusätzlich ausschließlich das Schreibfeld `eab_hmac_key` (ausgelassen: erhalten, nichtleer: ersetzen, `null`: löschen). Geheimnis und Ciphertext sind keine Antwortfelder. Die GET-Strings lassen ungültige Altwerte zur UI-Reparatur sichtbar, während neue Schreibwerte zusätzlich durch Schema und Service geprüft werden. EAB-Paar-/Identitätsregeln, CA-/Profilprüfung und TLS-Aktivierung stehen unter [ACME-Einstellungen](../verwaltung/einstellungen.md#acme-konto-und-tls-optionen).

`certificate-options-object.json` verlangt ausschließlich `key_type` (`ecdsa`/`rsa`) und `renewal_interval_hours` (ganze Zahl 1–12). `ip-ranges-options-object.json` verlangt ausschließlich `enabled` (Boolean) und `refresh_interval_hours` (ganze Zahl 6–594, `multipleOf: 6`). Beide vollständigen Objekte gelten für GET-/PUT-Antworten und PUT-Requests der dedizierten `/api/settings/…-options`-Routen; zusätzliche Eigenschaften sind ausgeschlossen. Details zur Anwendung stehen unter [Einstellungen](../verwaltung/einstellungen.md#zertifikats--und-netzwerkoptionen).

`analytics-options-object.json` verlangt ausschließlich `detailed_retention_hours` und `aggregation_retention_days`; beide sind Ganzzahlen von 1 bis `9007199254740991`. `nginx-options-object.json` verlangt ausschließlich `beautifier_enabled` als Boolean. Vollständige Objekte gelten für PUT-Requests und GET-/PUT-Antworten der gleichnamigen `/api/settings/…-options`-Routen. Zusätzliche Eigenschaften sind ausgeschlossen; es gibt keine feldübergreifende Retention-Bedingung. Siehe [Einstellungen](../verwaltung/einstellungen.md#analytics--und-nginx-optionen).

Die vier optionalen DDNS-Statuswerte (`last_ipv4`, `last_ipv6`, `last_updated_on`, `last_error`) erlauben `null`, wie es neu angelegte Anbieter und erfolgreiche Updates tatsächlich zurückgeben. `sixth-integrations-ddns-response-contract.spec.js` prüft die vollständigen Antworten des echten Express-Routers mit SQLite. Audit-Ereignisse erlauben `object_id: 0` für Ressourcen mit textuellen IDs; bei Einstellungen steht die tatsächliche ID in `meta.setting_id`. `sixth-settings-audit-contract.spec.js` prüft dazu ein durch den realen Settings-Service erzeugtes Ereignis.

CSRF-Ablehnungen vor der Routenausführung enthalten bei HTTP 403 zusätzlich `error.reason: "EBADCSRFTOKEN"`. Andere Berechtigungsfehler erhalten diesen Marker nicht. Der Browserclient darf ausschließlich diese Ablehnung nach einer frischen Health-Abfrage einmal mit unveränderter Sitzungsrevision wiederholen. Bereits durch die Route ausgeführte Aktionen werden damit nicht erneut abgesendet.

## Verwandte Seiten

- [API-Überblick](./ueberblick.md)
- [API-Routen](./routen.md)
