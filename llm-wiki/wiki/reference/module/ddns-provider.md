# DDNS-Provider

## Zweck

Schnittstelle zu verschiedenen DDNS (Dynamic DNS) Anbietern.

## Kontext

Das DDNS-Modul nutzt Provider-spezifische Logik, um IP-Adressen zu aktualisieren.

## Wichtige Dateien

- `backend/internal/ddns-provider.js` — Provider-Verwaltung
- `backend/internal/ddns.js` — Hauptlogik, die die Provider aufruft
- `backend/lib/service-credentials.js` — öffentliche Konfiguration und Erhaltung gespeicherter Zugangsdaten
- `frontend/src/modals/DdnsProviderModal.tsx` — Bearbeitung mit frischem Öffnungssnapshot

## Verhalten

- Verwaltet Einträge für Cloudflare, DuckDNS und benutzerdefinierte URLs; die HTTP-Implementierungen liegen in `internal/ddns.js`.
- Stellt CRUD, Berechtigungsprüfungen und Tests für das Haupt-DDNS-Modul bereit.

## Berechtigungen und Ownership

Die CRUD-Methoden in `backend/internal/ddns-provider.js` prüfen ihre jeweiligen Capabilities. Beim Löschen wird der
Provider nach `ddns_providers:delete` über den autorisierten Leseweg aufgelöst. Damit begrenzt die
`permission_visibility` bei eingeschränkten Rollen die Löschung auf `owner_user_id`; nur Sichtbarkeit `all` erlaubt das
Löschen fremder Provider. Erst nach erfolgreicher autorisierter Löschung werden Audit-Log und GitOps-Auto-Push ausgelöst.

## Abhängigkeiten

- `internal/ddns.js` führt die Provider-HTTP-Aufrufe aus; `internal/audit-log.js` protokolliert Änderungen, `internal/gitops.js` kann sie exportieren. Das Provider-Modul selbst verwendet das Objection-Modell und `lodash`, nicht direkt Node-HTTP für Updates.

### Änderung und Test

Auch direkte interne Aufrufe von `update()` und `test()` benötigen `ddns_providers:update`; anschließend gilt der autorisierte Leseweg mit Owner-Scope. Das ist insbesondere für AI-Tool-Aufrufe relevant, die nicht durch die REST-Routen laufen. Scheitert die DNS-Aktualisierung, liefert die Testfunktion einen Validierungsfehler statt einer Erfolgsmeldung.

### REST-Schemavertrag

Die PUT-Route lädt ihr Request-Schema unter dem im zusammengesetzten OpenAPI-Dokument definierten Pfad `/nginx/ddns-providers/{id}`. Der Dateiverzeichnisname `providerID` ist kein OpenAPI-Pfadsegment. Ein Regressionstest lädt das reale Schema und prüft, dass reguläre Änderungen akzeptiert und unbekannte Felder abgewiesen werden.

### Öffentliche Konfiguration und Zugangsdaten

Listen-, Detail-, Erstellungs- und Änderungsantworten entfernen Zugangsdaten aus `config`. Bei Cloudflare bleibt ausschließlich `zone_id` sichtbar; DuckDNS und benutzerdefinierte Provider liefern ein leeres Konfigurationsobjekt. Eine benutzerdefinierte URL wird vollständig entfernt, weil Pfad, Query oder URL-Benutzerinfo Zugangsdaten enthalten können. `has_credentials` meldet lediglich, ob ein Token beziehungsweise eine benutzerdefinierte URL hinterlegt ist. Die Bereinigung gilt unabhängig von eigener oder globaler Sichtbarkeit.

Beim Update wird der aktuelle autorisierte Datensatz innerhalb einer Transaktion mit `forUpdate()` gelesen. Für denselben Provider werden ausgelassene oder leere Zugangsdaten aus diesem aktuellen Datensatz übernommen; ein zwischenzeitlich rotierter Token wird deshalb nicht aus einem früheren Formular- oder Servicesnapshot wiederhergestellt. Nicht leere Eingaben ersetzen den gespeicherten Wert. Beim Wechsel des Providertyps werden die Zugangsdaten des bisherigen Providers nicht übernommen. Der operative Test lädt ausdrücklich die tatsächlichen Zugangsdaten; reguläre öffentliche Lesemethoden bleiben bereinigt. Das DDNS-Modul und der GitOps-Export behalten ihren internen Zugriff auf die gespeicherte Konfiguration. DDNS-Auditantworten enthalten weiterhin kein `config`.

Der Dialog wartet vor der Bearbeitung auf seine Öffnungsaktualisierung, hält danach den Entwurf stabil und zeigt für vorhandene Zugangsdaten ein leeres Feld mit Beibehalten-Hinweis. Beim Speichern eines unveränderten Secrets lässt er den Wert aus. Eine reine Namensänderung erhält den Providerstatus, statt einen deaktivierten Provider erneut zu aktivieren. `DdnsProviderModal.test.tsx` und `backend/test/routes/service-credentials.spec.js` prüfen öffentliche Antworten, Eigentümergrenzen, erhaltene Zugangsdaten und den operativen Test.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [DDNS](./ddns.md)
- [Modulübersicht](./README.md)
