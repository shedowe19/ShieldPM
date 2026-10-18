# Host (gemeinsame Host-Logik)

## Zweck

Gemeinsame Hilfslogik, die von Proxy-, Redirection- und Dead-Hosts geteilt wird (Domain-Validierung, Konfliktprüfung, gemeinsame Datenoperationen).

## Kontext

Mehrere Host-Typen (Proxy-, Redirection-, Dead-Host) teilen Verhalten wie:

- Validierung der `domain_names` (Konflikt-Erkennung über alle Host-Typen hinweg)
- Verwaltung der `host_domains`-Relation für Proxy-Hosts; Redirect- und Dead-Hosts speichern ihre Domains als JSON-Liste
- Helper für die Auflösung verknüpfter Modelle

Dieses Modul bündelt die wiederverwendbare Logik, sodass die einzelnen Host-Module konsistent bleiben.

## Wichtige Dateien

- `backend/internal/host.js` — Hilfsfunktionen, Domain-Konflikt-Prüfung
- `backend/models/host_domain.js` — Modell für die Verknüpfungs-Tabelle `host_domain`
- `backend/lib/utils.js` — `castJsonIfNeed`, allgemeine Helfer

## Verhalten

- `isHostnameTaken(domain)` prüft lesend, ob eine Domain in irgendeinem Host-Typ bereits genutzt wird. Verbindliche Schreibkonflikte verhindert die transaktionale Domainregistrierung.
- `getHostsWithDomains()` löst aktive Host-Datensätze über ihre Domainlisten auf. Proxy-Hosts laden dazu `host_domains`; Redirect- und Dead-Hosts speichern Domains im JSON-Feld `domain_names`.
- Wird typischerweise von `internal/proxy-host.js`, `internal/redirection-host.js`, `internal/dead-host.js` aufgerufen.

## Abhängigkeiten

- `models/proxy_host.js`, `models/redirection_host.js`, `models/dead_host.js`, `models/host_domain.js`
- `lib/helpers.js`, `lib/utils.js`

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Korrekturen der Domain-Auflösung

`isHostnameTaken()` und `getHostsWithDomains()` laden für Proxy-Hosts die normalisierte `host_domains`-Relation. Redirect- und Dead-Hosts verwenden weiterhin ihr JSON-Feld `domain_names`. Die PostgreSQL-Vorfilter suchen ohne Unterscheidung von Groß-/Kleinschreibung; anschließend wird der vollständige Domainname exakt, aber ebenfalls ohne Beachtung der Groß-/Kleinschreibung, verglichen. Die Auswahl mehrerer Domains verwendet ein Set und liefert jeden Host nur einmal.

## Eingaben und Zertifikatsmetadaten

`validateDomainNames()` prüft ein bis 99 nichtleere Nginx-Servernamen und verhindert Whitespace, Steuerzeichen und Direktiventrenner in Domain-Tokens. Bestehende Wildcard-, IDN- und als einzelnes Token zulässige Regex-Namen bleiben möglich.

DNS-Provider-Credentials aus einer Zertifikatsanforderung werden für die Beantragung verwendet, aber nicht erneut in Host-Metadaten gespeichert. API-Antworten und Auditdaten bereinigen außerdem eventuell vorhandene Altwerte. Das gilt für Proxy-, Redirection-, Dead-Hosts und Streams.

## Berechtigung neu zugewiesener Ressourcen

Beim Erstellen und Aktualisieren prüfen Proxy-, Redirect-, Dead-Hosts und Streams neue Zertifikatszuordnungen über `internalCertificate.get()`. Proxy-Hosts prüfen neue Zugriffslisten über `internalAccessList.get()`. Die Ressourcen benötigen ihre eigene Leseberechtigung und müssen im Eigentümer-Sichtbereich liegen; gelöschte oder fehlende IDs werden vor einer Hoständerung abgewiesen. Unveränderte, bereits bestehende Zuordnungen können weiter bearbeitet und mit `0` entfernt werden. `"new"` bleibt der eigene Ausstellungsablauf.

Regressionen: `third-proxy-references.spec.js` prüft sämtliche Create-/Update-Aufrufer; `third-proxy-reference-ownership.spec.js` prüft die tatsächlichen Services mit SQLite für eigene, fremde, gelöschte und global sichtbare Ressourcen.

## Atomare Domainregistrierung

`backend/lib/host-domain-claims.js` stellt `withHostDomainClaims({hostType, hostId?, domainNames, retainedDomainNames?}, write)` bereit. Der Callback muss seine Hoständerung mit der übergebenen Transaktion ausführen. `hostType` ist `proxy`, `redirection` oder `dead`; neue Hosts liefern ihre neue ID zurück. Eine leere Domainliste gibt die Namen eines gelöschten Hosts frei.

Die Migration `20261017190200_add_host_domain_claims.js` erzeugt eine eindeutige Registrierung kleingeschriebener Namen, zugehörige Besitzerzeilen und eine einzelne Sperrzeile. Eine Sperrzeilenänderung erfolgt vor jedem Claim-Read und bleibt bis zum Commit von Host und Registry gesperrt. PostgreSQL verwendet dabei ausdrücklich `READ COMMITTED`; SQLite beginnt vor seinen Reads mit einer Schreiboperation. Somit kann ein zweiter Prozess keinen konkurrierenden Create oder Rename mit demselben Namen bestätigen. Proxy-, Redirect-, Dead-Host-Services, Docker Discovery und GitOps teilen diesen Vertrag.

Die Primär- und Fremdschlüssel verwenden einen SHA-256-Schlüssel des vollständigen kleingeschriebenen Namens. Der Name selbst bleibt ungekürzt in Textfeldern erhalten. Dadurch verhindern lange Altwerte in JSON-Feldern nicht den PostgreSQL-Start; außerdem bestimmt keine akzentunabhängige MySQL-Textsortierung, welche unterschiedlichen Namen als identisch gelten. Groß-/Kleinschreibungs-Konflikte behalten weiterhin alle bisherigen Besitzer.

Vorhandene Konflikte werden beim Upgrade weder gelöscht noch einem zufälligen Gewinner zugewiesen: Die Registrierung bewahrt alle Besitzer und protokolliert die Zahl kollidierender Namen. Unveränderte bestehende Ansprüche bleiben bearbeitbar; zusätzliche Besitzer werden zurückgewiesen. Umbenennen oder Löschen löst den jeweiligen Altanspruch. Deaktivierte Hosts behalten ihre Namen wie bisher; Softdelete gibt sie atomar frei.

Ein nach längerer Zertifikatsanforderung fortgesetztes Host-Update prüft den gesperrten aktuellen Datensatz erneut. Ein inzwischen gelöschter oder einem fremden Besitzer zugewiesener Host darf weder verändert werden noch freigegebene Namen erneut reservieren.

`retainedDomainNames` reserviert zusätzlich die vorherigen Namen während einer außerhalb der Datenbank stattfindenden Aktivierungsprüfung. Ein erfolgreicher Abschluss gibt sie explizit frei; eine fehlgeschlagene Aktivierung kann sie weiterhin sicher zurücknehmen. Bei Prozessabbruch bleiben zusätzliche Namen konservativ reserviert, bis die betreffende Hoständerung oder Wiederherstellung sie bereinigt. Die Registry verhindert exakte Namenkonflikte ohne Beachtung der Groß-/Kleinschreibung; die fachliche Überschneidung verschiedener Wildcard- oder Regex-Regeln ist weiterhin keine Eindeutigkeitsprüfung.

`host-domain-claims.spec.js` verwendet echte SQLite- und PostgreSQL/PGlite-Datenbanken sowie die Host-Services für konkurrierende Anlagen, Typwechselkonflikte, Rename/Create, Fehlerrollback, Softdelete-Wiederverwendung, Altduplikate, lange Unicode-Namen, Löschung beziehungsweise Besitzerwechsel während einer Zertifikatsanforderung und während einer Aktivierung gehaltene Rückfallnamen. Die MySQL-Prüfung kontrolliert die erzeugten Primär-/Fremdschlüssel und Langtext-Spalten. PGlite verwendet eine Verbindung und ersetzt keinen Mehrverbindungs-Lasttest auf einem produktiven PostgreSQL-/MySQL-Server.

## Verwandte Seiten

- [Proxy-Host](./proxy-host.md)
- [Redirection-Host](./redirection-host.md)
- [Dead-Host](./dead-host.md)
- [Modulübersicht](./README.md)
- [Datenmodell](../daten/datenmodell.md)
