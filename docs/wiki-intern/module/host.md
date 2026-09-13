# Host (gemeinsame Host-Logik)

## Zweck

Gemeinsame Hilfslogik, die von Proxy-, Redirection- und Dead-Hosts geteilt wird (Domain-Validierung, Konfliktprüfung, gemeinsame Datenoperationen).

## Kontext

Mehrere Host-Typen (Proxy-, Redirection-, Dead-Host) teilen Verhalten wie:

- Validierung der `domain_names` (Konflikt-Erkennung über alle Host-Typen hinweg)
- Verwaltung der `host_domains`-Relation
- Helper für die Auflösung verknüpfter Modelle

Dieses Modul bündelt die wiederverwendbare Logik, sodass die einzelnen Host-Module konsistent bleiben.

## Wichtige Dateien

- `backend/internal/host.js` (~232 Zeilen) — Hilfsfunktionen, Domain-Konflikt-Prüfung
- `backend/models/host_domain.js` — Modell für die Verknüpfungs-Tabelle `host_domain`
- `backend/lib/utils.js` — `castJsonIfNeed`, allgemeine Helfer

## Verhalten

- `isHostnameTaken(domain)` prüft, ob eine Domain in irgendeinem Host-Typ bereits genutzt wird (verhindert Konflikte beim Anlegen).
- `getHostsWithDomains()` löst aktive Host-Datensätze über ihre Domainlisten auf. Proxy-Hosts laden dazu `host_domains`; Redirect- und Dead-Hosts speichern Domains im JSON-Feld `domain_names`.
- Wird typischerweise von `internal/proxy-host.js`, `internal/redirection-host.js`, `internal/dead-host.js` aufgerufen.

## Abhängigkeiten

- `models/proxy_host.js`, `models/redirection_host.js`, `models/dead_host.js`, `models/host_domain.js`
- `lib/helpers.js`, `lib/utils.js`

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Korrekturen der Domain-Auflösung

`isHostnameTaken()` und `getHostsWithDomains()` laden die normalisierte `host_domains`-Relation. Das alte JSON-Feld ist nach Änderungen nicht mehr zuverlässig. Auch PostgreSQL-Vorfilter suchen ohne Unterscheidung von Groß-/Kleinschreibung; anschließend wird exakt verglichen. Die Auswahl mehrerer Domains verwendet ein Set und liefert jeden Host nur einmal.

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Redirection-Host](./redirection-host.md)
- [Dead-Host](./dead-host.md)
- [Modulübersicht](./README.md)
- [Datenmodell](../daten/datenmodell.md)

## Eingaben und Zertifikatsmetadaten

`validateDomainNames()` prüft ein bis 99 nichtleere Nginx-Servernamen und verhindert Whitespace, Steuerzeichen und Direktiventrenner in Domain-Tokens. Bestehende Wildcard-, IDN- und als einzelnes Token zulässige Regex-Namen bleiben möglich.

DNS-Provider-Credentials aus einer Zertifikatsanforderung werden für die Beantragung verwendet, aber nicht erneut in Host-Metadaten gespeichert. API-Antworten und Auditdaten bereinigen außerdem eventuell vorhandene Altwerte. Das gilt für Proxy-, Redirection-, Dead-Hosts und Streams.

## Berechtigung neu zugewiesener Ressourcen

Beim Erstellen und Aktualisieren prüfen Proxy-, Redirect-, Dead-Hosts und Streams neue Zertifikatszuordnungen über `internalCertificate.get()`. Proxy-Hosts prüfen neue Zugriffslisten über `internalAccessList.get()`. Die Ressourcen benötigen ihre eigene Leseberechtigung und müssen im Eigentümer-Sichtbereich liegen; gelöschte oder fehlende IDs werden vor einer Hoständerung abgewiesen. Unveränderte, bereits bestehende Zuordnungen können weiter bearbeitet und mit `0` entfernt werden. `"new"` bleibt der eigene Ausstellungsablauf.

Regressionen: `third-proxy-references.spec.js` prüft sämtliche Create-/Update-Aufrufer; `third-proxy-reference-ownership.spec.js` prüft die tatsächlichen Services mit SQLite für eigene, fremde, gelöschte und global sichtbare Ressourcen.
