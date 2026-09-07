# DDNS-Provider

## Zweck

Schnittstelle zu verschiedenen DDNS (Dynamic DNS) Anbietern.

## Kontext

Das DDNS-Modul nutzt Provider-spezifische Logik, um IP-Adressen zu aktualisieren.

## Wichtige Dateien

- `backend/internal/ddns-provider.js` (4 KB) — Provider-Implementierungen
- `backend/internal/ddns.js` — Hauptlogik, die die Provider aufruft

## Verhalten

- Enthält Logik für Anbieter wie Cloudflare, DuckDNS, Namecheap etc.
- Standardisiert die Aktualisierungsanfragen für das Haupt-DDNS-Modul.

## Berechtigungen und Ownership

Die CRUD-Methoden in `backend/internal/ddns-provider.js` prüfen ihre jeweiligen Capabilities. Beim Löschen wird der
Provider nach `ddns_providers:delete` über den autorisierten Leseweg aufgelöst. Damit begrenzt die
`permission_visibility` bei eingeschränkten Rollen die Löschung auf `owner_user_id`; nur Sichtbarkeit `all` erlaubt das
Löschen fremder Provider. Erst nach erfolgreicher autorisierter Löschung werden Audit-Log und GitOps-Auto-Push ausgelöst.

## Abhängigkeiten

- Keine direkten (nutzt Node.js interne Module für Requests)

### Änderung und Test

Auch direkte interne Aufrufe von `update()` und `test()` benötigen `ddns_providers:update`; anschließend gilt der autorisierte Leseweg mit Owner-Scope. Das ist insbesondere für AI-Tool-Aufrufe relevant, die nicht durch die REST-Routen laufen. Scheitert die DNS-Aktualisierung, liefert die Testfunktion einen Validierungsfehler statt einer Erfolgsmeldung.

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [DDNS](./ddns.md)
- [Modulübersicht](./README.md)
