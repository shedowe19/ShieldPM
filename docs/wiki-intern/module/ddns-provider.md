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

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [DDNS](./ddns.md)
- [Modulübersicht](./README.md)
