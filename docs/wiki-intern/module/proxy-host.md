# Proxy-Host

## Zweck

Verwaltung von Reverse-Proxy-Hosts — das Kernfeature von ShieldPM.

## Kontext

Proxy-Hosts leiten eingehende HTTP/HTTPS-Anfragen an Upstream-Server weiter. Sie sind das am häufigsten verwendete Feature.

## Wichtige Dateien

- `backend/internal/proxy-host.js` (19 KB) — Business-Logik
- `backend/models/proxy_host.js` (7 KB) — Objection.js-Modell
- `backend/templates/proxy_host.conf` (16 KB) — Nginx-Template
- `backend/templates/_proxy_logic.conf` (17 KB) — Gemeinsame Proxy-Logik
- `backend/routes/nginx/proxy_hosts.js` (6 KB) — API-Routen
- `frontend/src/modals/ProxyHostForwardingFields.tsx` — Formularbereich für Schema, Zielhost, Zielport und Index-Datei
- `frontend/src/modals/ProxyHostPhpSettings.tsx` — Formularbereich für PHP-Hosting bei `path`-Forwarding

## Verhalten

1. Benutzer erstellt Host über UI oder API
2. `internal/proxy-host.js` prüft Berechtigungen und validiert
3. Model speichert in DB (inkl. `host_domains`-Relation)
4. `nginx.js` rendert Template und schreibt `.conf`
5. Nginx wird neu geladen

## Listen-Paginierung

`GET /api/nginx/proxy-hosts` bleibt ohne Paginierungsparameter abwärtskompatibel und liefert weiterhin das bestehende
Array, etwa für die Analytics-Hostauswahl. Die Proxy-Host-Tabelle verwendet dagegen `page` (einsbasiert) und `limit`;
`limit` ist auf 1 bis 100 begrenzt und hat im paginierten Vertrag den Standard 100. Die Antwort lautet dann:

- `items`: höchstens `limit` Proxy-Hosts
- `pagination.page`, `pagination.limit`, `pagination.totalItems`, `pagination.totalPages`

Die Berechtigungs- und Owner-Einschränkung sowie die Suche werden vor Count und Seitenauswahl angewandt. `query` sucht
teilweise und mit literaler Behandlung von `%`, `_` und `!` in Domainnamen und Upstream-Host; bei einer ausschließlich
numerischen Suche wird der Upstream-Port exakt berücksichtigt. Die Tabelle verwendet `getProxyHostsPage()` und
`useProxyHostsPage()` mit einer React-Query-Cache-ID, die
Seite, Limit, Suche und Expansions enthält. Nach dem Löschen invalidiert der bestehende Präfix `proxy-hosts` alle Seiten;
ist dadurch eine spätere Seite leer, wechselt die Oberfläche zur vorherigen gültigen Seite zurück.

## Custom Locations

Das Feld `locations` (DB-Feld `custom_locations`, JSON-Array) erlaubt zusätzliche Nginx-`location`-Blöcke pro Host. Jeder Eintrag enthält `path`, `forward_scheme`, `forward_host`, `forward_port`, optional `forward_path` und `advanced_config`.

Mechanik in `nginx.js` → `renderLocations(host)`:

1. Iteration über `host.locations`.
2. Für jede Location wird eine Kopie mit den Host-Eigenschaften (`access_list_id`, `certificate_id`, `ssl_forced`, `caching_enabled`, `block_exploits`, `allow_websocket_upgrade`, `http2_support`, `hsts_enabled`, `hsts_subdomains`, `access_list`, `certificate`) gemischt.
3. Enthält `forward_host` einen Slash und beginnt nicht mit `/` oder `unix`, wird nach dem ersten Segment getrennt: erster Teil → `forward_host`, Rest → `forward_path`.
4. Das Liquid-Template `backend/templates/_proxy_host_custom_location.conf` wird pro Location gerendert.
5. Alle gerenderten Strings werden konkateniert und als String an das Haupt-Template `proxy_host.conf` übergeben.
6. Vor dem Ersetzen des Arrays durch den gerenderten String wird eine Custom-Location mit `path === "/"` erkannt. Sie deaktiviert die Standard-`/`-Location (`use_default_location = false`).
7. Custom-Locations mit abschließendem Slash erhalten den Redirect ohne Slash; statische Ziele mit abschließendem Slash verwenden `alias`.

## Interne Daten und API-Antworten

- Der Objection-Hook `$afterFind()` bildet die geladenen `host_domains` auf `domain_names` ab und normalisiert Wartungszeitpunkte. Der frühere Name `$afterGet()` wurde von Objection nicht aufgerufen. Ein echter SQLite-Graph-Fetch in `tor-host-reassignment.spec.js` prüft die Domainabbildung auch bei JSON-Antworten.
- Konfigurationsgenerierung und interne Aktualisierung behalten den tatsächlichen Pfad verwalteter Websites. Öffentliche Antworten zeigen für `/data/websites/...` weiterhin `(managed)`; beim Zurücksenden dieses Platzhalters bleibt der bestehende Pfad erhalten.
- `backend/lib/host-response.js` entfernt Git-/Terminal-Zugangsdaten und Geheimnisse expandierter OAuth-/OIDC-Zugriffslisten aus Antworten und Proxy-Host-Auditdaten. Die Konfigurationsgenerierung erhält intern die erforderlichen Originaldaten.
- Leere Terminal-Passwort-/Private-Key-Felder bei Updates behalten vorhandene Zugangsdaten. Neue Git-Zugangsdaten werden bereits beim Erstellen verschlüsselt.
- Aktivieren lädt auch `access_list.clients` und `access_list.items`, damit bestehende Regeln erhalten bleiben.
- `backend/test/internal/host-update-regressions.spec.js` prüft diese Abläufe mit gemockten Datenbank- und Nginx-Aufrufen.

## Abhängigkeiten

- `internal/nginx.js` — Config-Generierung und Reload
- `internal/certificate.js` — SSL-Zertifikat-Zuordnung
- `internal/access-list.js` — Zugriffslisten
- `internal/audit-log.js` — Protokollierung
- `models/proxy_host.js` — Datenbank-Modell
- `models/host_domain.js` — Domain-Zuordnung

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Nginx-Engine](./nginx-engine.md)
- [Redirection-Host](./redirection-host.md)
- [Dead-Host](./dead-host.md)
- [Stream](./stream.md)
- [Host (gemeinsame Logik)](./host.md)
- [Zertifikate](./zertifikate.md)
- [Access-Lists](./access-lists.md)
- [Git-Deploy](./git-deploy.md)
- [Modulübersicht](./README.md)
- [Datenmodell](../daten/datenmodell.md)

## Ergänzungen der zweiten Codeprüfung

Beim Löschen und Deaktivieren von Proxy-, Redirect-, 404-Hosts und Streams laufen Datenbankflag, Config-Entfernung und Reload in der Nginx-Warteschlange. Die Datenbankänderung bleibt bis zum erfolgreichen Reload in einer Transaktion. Ein Fehler beim Schreiben, Entfernen oder Reload setzt das Flag zurück und stellt eine zuvor vorhandene Konfiguration wieder her; anschließend wird diese erneut geladen. Audit-Einträge, GitOps und das Beenden des Proxy-Pollings folgen erst nach erfolgreichem Abschluss. Eine alte Sicherung wird nicht als aktive Konfiguration wiederbelebt, wenn vor der Änderung keine Config-Datei existierte. Bereits wartende Konfigurationsgenerierungen können dadurch nicht nachträglich die gerade entfernte Datei wiederherstellen.

`backend/test/internal/host-removal-rollback.spec.js` prüft alle acht Lösch-/Deaktivierungspfade mit SQLite und temporären Konfigurationsdateien, einschließlich Schreib-, Datei- und Reloadfehlern. Nginx-Prozessaufrufe werden dabei simuliert.

DNS-Zugangsdaten verbleiben ausschließlich im Zertifikatskontext. Für verwaltete Git-Websites sperrt die generierte Nginx-Konfiguration Symlinks und für statische Hosts den Zugriff auf Git-Metadaten. Details zu mTLS, OIDC und Limits stehen unter [Nginx-Templates](./nginx-templates.md).
