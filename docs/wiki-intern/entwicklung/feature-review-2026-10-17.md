# Gesamtprüfung und neue Features vom 17. Oktober 2026

## Zweck und Prüfstand

Erneute Prüfung von ShieldPM auf Fehler, weitere Optimierungen und neue Funktionen, besonders Wasm.
`develop` wurde frisch abgerufen und stand auf `32a3a9d5dde3182dfc10d3700366d531a7462fa3`.
Geprüft wurde zusätzlich der offene [PR #155](https://github.com/shedowe19/ShieldPM/pull/155),
Commit `e3641526f0378caf1b2ff9b88384f524e5d850a6`. Er enthält die drei bereits gemessenen Optimierungen.
Die folgende Prüfung verändert keinen produktiven Code und implementiert die vorgeschlagenen Features noch nicht.

Sechs getrennte Quellprüfungen untersuchten Backend/Auth/Datenbank, Integrationen, Frontend,
Nginx/Analytics/Monitoring, Betrieb/Installer/CI und die tatsächliche Wasm-Runtime. Grundlage war der erneut
gelesene deepen-prompt-Skill: Primärquellen, konkrete Reproduktionen und ausführbare Gegenprüfungen.
Das Repository hatte zu Beginn 1.828 versionierte Dateien. Das ist eine bereichsübergreifende Prüfung mit
vollständigen lokalen Tests und Scans; nicht jede Datei und jede Assertion wurde manuell gelesen.

## Ergebnis

Wasm ist bereits im veröffentlichten Nginx vorhanden und ausführbar. Es fehlen die Anbindung an ShieldPM,
die Auswahl pro Host und der Aktivierungsablauf. Ein erster gebündelter Header-/API-Policy-Filter benötigt
keinen zusätzlichen Nginx-Build. Ein allgemeiner Plugin-Katalog benötigt weitere Runtime-Begrenzungen.

Neue Funktionsfehler und Optimierungsmöglichkeiten bestehen trotz erfolgreicher vorhandener Tests.
Die neuen Reproduktionen prüfen bislang ungesicherte Fälle; ihre positiven Assertions bestätigen den
jeweiligen Fehlerzustand. Sie bedeuten nicht, dass der Fehler bereits behoben wurde.

## Reproduzierte Funktionsfehler

B01 ist P1, weil die fehlgeschlagene Änderung weitere globale Reloads und den nächsten Start beeinträchtigen
kann. B02–B12 sind P2: konkrete Funktions-, Verfügbarkeits- oder Bedienbarkeitsfehler mit einem begrenzten
Auslöser. Die Reihenfolge innerhalb dieser Gruppe hängt vom Einsatz der jeweiligen Integration ab.

| ID  | Befund und Quellstelle                                                                                                                                                               | Nachweis und Auswirkung                                                                                                                                                                                                                                                                                                 | Korrekturrichtung                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B01 | Access-List-Rollback erfasst CA-/Passwortdateien nicht. `backend/internal/access-list.js:265–365,616–650`; `backend/internal/nginx.js:171–179,609–618`                               | Tatsächliches Update, temporäre Dateien und echtes `nginx -tq`: Eine vom Schema akzeptierte ungültige mTLS-CA ersetzt die bisherige `.crt`. Die alte `.conf` wird restauriert, referenziert aber die neue kaputte CA; die erneute Syntaxprüfung schlägt fehl. Die Passwortdatei und DB sind ebenfalls bereits geändert. | CA vorab parsen; DB, CA, htpasswd, abhängige Konfiguration und Aktivierung als zusammengehörigen Wechsel behandeln. Alle Dateien innerhalb derselben Konfigurationssperre sichern und restaurieren.              |
| B02 | Request-Validator behält neu erzeugte Schemas dauerhaft. `backend/lib/validator/index.js:28`; z. B. `backend/routes/users.js:162–174`, `backend/routes/nginx/proxy_hosts.js:56–64`   | 100 echte HTTP-Aufrufe des gemounteten Users-Routers: AJV-Cache 10 → 110, nach GC belegter Heap 25.578.488 → 28.398.392 Bytes. Nur die Businessmethode war kontrolliert ersetzt. Frische Objektliterale werden jeweils neu kompiliert und behalten.                                                                     | Statische Route-Schemas einmal erzeugen/kompilieren; Wiederholungstests auf begrenzte Cachegröße einschließlich Coercion und Fehlerfällen. Der separate `apiValidator` mit stabilen Schemas ist nicht betroffen. |
| B03 | Gleichzeitige Host-Anlage kann dieselbe Domain doppelt beanspruchen. `backend/internal/proxy-host.js:128–141,171–175`; `backend/migrations/20260222000000_normalize_domain_names.js` | Tatsächlicher Create-Service und SQLite: Beide echten Vorabprüfungen melden frei, danach entstehen zwei Hosts mit `race.example.test`. Auch Docker Discovery reproduziert den Konflikt. Echtes Nginx akzeptiert doppelte Servernamen mit Exit 0 und ignoriert einen Listener.                                           | Normalisierte Domain innerhalb des Writes atomar beanspruchen, gemeinsam für Proxy/Redirect/Dead Hosts und Umbenennungen; eindeutiges Domainregister für mehrere Prozesse.                                       |
| B04 | Docker Discovery verbindet den Eventstream nicht neu. `backend/internal/docker.js:47,100,181–225`                                                                                    | Tatsächliche Serviceklasse mit kontrolliertem Stream: Nach `end`/`close` und erneutem `init()` bleibt es bei einem `getEvents()`-Aufruf. `initialized` bleibt gesetzt; weitere Events gehen verloren.                                                                                                                   | Reconnect mit Backoff, genau einem Stream pro Client und vollständigem Abgleich nach Wiederverbindung; Stop muss Timer und Stream entfernen.                                                                     |
| B05 | Direkter GitOps-Import aktiviert neue/geänderte Cloudflared-Tunnel nicht. `backend/internal/gitops.js:1192–1238,1290,1388`                                                           | Echte SQLite-Modelle und Migrationen, kontrollierte Prozesse: Neuer Tunnel meldet Importerfolg ohne gestarteten Prozess; geänderter Token liegt in der DB, während der alte Prozess weiterläuft.                                                                                                                        | Importierte Zustände über die serialisierte Tunnel-Lifecycle-Logik abgleichen; Aktivierungsfehler berichten und unveränderte Tunnel erhalten.                                                                    |
| B06 | Manueller DDNS-Test umgeht die Update-Queue. `backend/internal/ddns-provider.js:141–145`; `backend/internal/ddns.js:360–377`                                                         | Produktionsfunktionen mit kontrollierten HTTP-/DB-Grenzen: verzögerter Test schreibt alte IP `.1` nach dem erfolgreichen Scheduler-Write `.2`; externer Schreibverlauf `.2, .1`, gespeicherter Endstand `.1`, beide Antworten erfolgreich.                                                                              | Gemeinsame Queue je Provider für Test und Scheduler, Konfiguration innerhalb der Queue erneut lesen.                                                                                                             |
| B07 | ACME-Registrierung blockiert den Erststart vor der Oberfläche. `rootfs/usr/local/bin/launch.sh:16–44,147–151`                                                                        | Tatsächlicher Startskript-Präfix mit leerem temporären Accountverzeichnis und kontrolliertem Certbot-Fehler erreicht `sleep inf`, bevor Dienste starten. Kontrollfall mit vorhandenem Account erreicht den Dienststart. Betrifft auch Installationen mit eigenen Zertifikaten.                                          | Registrierung bei der ersten ACME-Anforderung oder begrenzter, nicht blockierender Bootstrap mit sichtbarem Status.                                                                                              |
| B08 | Datenbankauswahl im Installer wird durch Legacy-Konfiguration überstimmt. `scripts/install.sh:704–754`; `backend/lib/config.js:18–40`                                                | Originale Installer-Hilfen schreiben PostgreSQL in `.env` und melden Erfolg. Das tatsächliche Konfigurationsmodul wählt weiterhin MySQL aus dem bestehenden `default.json`. Keine DB wurde dabei geöffnet.                                                                                                              | Effektiven Provider und Quelle anzeigen; Legacy-Konfiguration vor einer Erfolgsmeldung ausdrücklich auflösen. Ein Providerwechsel braucht einen gesonderten Datenmigrationsweg.                                  |
| B09 | Mehrere Proxy-Host-Tabs haben keinen zugänglichen Namen. `frontend/src/modals/ProxyHostFormTabs.tsx:38–55`                                                                           | Tatsächliche Radix-Tabs: fünf namenlose Tabs bei Pfad-Hosts, vier bei HTTP. Screenreader können Security, Advanced, Maintenance, Notes und Git Sync nicht zuordnen.                                                                                                                                                     | Übersetzte `aria-label`- oder `sr-only`-Beschriftungen; Regression mit echten Komponenten.                                                                                                                       |
| B10 | Domainfeld-Label verweist nicht auf den Eingabeknoten. `frontend/src/components/Form/DomainNamesField.tsx:57–64`                                                                     | Tatsächliches React Select: Combobox hat keinen zugänglichen Namen; `getByLabelText` findet sie nicht. Gemeinsames Feld mehrerer Host-/Zertifikatsdialoge.                                                                                                                                                              | `inputId` mit dem Label verbinden; Label-Fokus und Name mit echtem React Select testen.                                                                                                                          |
| B11 | „Cache Assets“ erzeugt keine Asset-Cache-Konfiguration. `backend/templates/proxy_host.conf:266`, `backend/templates/_proxy_logic.conf:296`; `docs/wiki/Proxy-Hosts.md`               | Echtes Liquid-Rendering: Ohne Block Exploits ist die Ausgabe mit/ohne Flag identisch. Mit Block Exploits ändert sich nur die gewählte ModSecurity-Konfigurationsdatei. Keine Asset-Cache-Direktiven werden ergänzt.                                                                                                     | Versprochene Cache-Semantik definieren und tatsächlich rendern; WAF-Auswahl getrennt behandeln. Grundlage für F06.                                                                                               |
| B12 | Upload-Relay formatiert ungekapselte IPv6-Upstreams falsch. `backend/templates/_upload_relay.conf:8`                                                                                 | Akzeptiertes `forward_host="::1"` ergibt öffentlich `proxy_pass http://::1:PORT$request_uri;`. Tatsächliches Rendering und Nginx mit IPv6-Echo-Origin: HTTP 500, `invalid port in upstream`; dieselbe Zeile mit `[::1]` erreicht den Origin mit HTTP 200. Beide Formen bestehen `nginx -tq`.                            | Vor dem Zusammenbauen den vorhandenen `nginxUpstreamHost`-Filter anwenden; öffentliche Relay-Routen mit IPv4, DNS und beiden IPv6-Schreibweisen tatsächlich abrufen.                                             |

## Weitere Optimierungsmöglichkeiten

| ID  | Ansatz                                                                                | Beleg und sinnvolle Messgrenze                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O01 | Berechtigungsprüfungen vorab kompilieren und vollständige Proxy-ID-Abfragen vermeiden | `backend/lib/access.js:123–134,273–281`: Jede `can()`-Prüfung erzeugt AJV neu; selbst Listenprüfungen laden alle erlaubten IDs. Die aktuellen Proxy-Permission-Schemas verwenden diese ID-Enums nicht. Instrumentierung mit echtem Access/JWT und kontrollierten Modellabfragen zeigt die vollständige ID-Liste bei 10/100/1.000 Hosts. Aktuelle Account-/Owner-Prüfungen müssen erhalten bleiben.                                                                        |
| O02 | Analytics-Aggregate als transaktionale Sammel-Upserts schreiben                       | `backend/internal/analytics.js`, `flushAggregations()`: 500 Zeilen führen zu 500 einzelnen INSERTs. Tatsächlicher SQLite-Service gegen Kandidat mit 250er-Chunks: 500 → 2 INSERTs pro Flush bei gleichen Countern einschließlich globalem NULL-Host. Median für zwei Flushes: 125,94 → 8,64 ms. Synthetische lokale Zeiten während weiterer Audit-Arbeit; kein Produktionsversprechen. PostgreSQL-/MySQL-Ausdrücke und Wiederholungssemantik sind noch separat zu testen. |
| O03 | Tabellenexpansionen an sichtbare Spalten binden                                       | `frontend/src/pages/Nginx/ProxyHosts/TableWrapper.tsx:76–82` lädt immer Owner, Access-List und Zertifikat. Messen: Antwortbytes und SQL bei ausgeblendeten Spalten. Bearbeitungsdialoge laden ihre Details bereits gesondert.                                                                                                                                                                                                                                             |
| O04 | Schlanke Hostauswahl und abbrechbare Analytics-Abfragen                               | `Analytics/index.tsx:22` lädt vollständige Hosts für ID/Domain-Auswahl. `useAnalyticsData.ts:45–49` und `useAnalyticsLiveMetrics.ts:133–139` verwerfen alte Antworten, brechen die Requests aber nicht ab. Messen: übertragene Bytes und offene Requests bei schnellem Host-/Zeitraumwechsel.                                                                                                                                                                             |
| O05 | Auth-Session-Historie begrenzen                                                       | `backend/internal/auth-session-service.js:82–90,186–206`: 96 echte SQLite-Rotationen ergeben 97 Zeilen; kein Laufzeit-Pruning vorhanden. Abgelaufene Familien nach definierter Sicherheitsaufbewahrung bereinigen; weiterhin gültige Replay-Erkennung erhalten.                                                                                                                                                                                                           |
| O06 | WireGuard-Status asynchron und gemeinsam erfassen                                     | `backend/internal/wireguard.js:235–237,922–946`: synchrone Prozesse mit bis zu zehn Sekunden Timeout und anschließende einzelne Peer-Writes. Mit `execFile`, begrenztem gemeinsamem Snapshot und Writes nur bei Änderungen prüfen. Kein gemessener Produktivgewinn behauptet.                                                                                                                                                                                             |
| O07 | Docker-Scan indizieren; Installer-Ausfallzeit verkürzen                               | Discovery lädt je Container erneut den Hostbestand. Ein gemeinsamer Index braucht eine atomare Revalidierung beim Schreiben. Der native Installer stoppt bei Wiederinstallation bereits vor späteren Integrationsdialogen und Downloads; diese Vorbereitung vorziehen, wie beim Updater bereits umgesetzt.                                                                                                                                                                |

Die Rohwerte der ausgeführten Probes und des Analytics-Vergleichs stehen im [JSON-Nachweis](./feature-review-2026-10-17.json).

## Wasm: vorhandene Technik und tatsächlicher Test

### Primärquellen und Lieferumfang

Der überprüfte `shieldpm-nginx`-Commit ist `a0db913b0495783bc1e7e9fd8ed39624c7fff2bc`.
Sein [Dockerfile](https://github.com/shedowe19/shieldpm-nginx/blob/a0db913b0495783bc1e7e9fd8ed39624c7fff2bc/Dockerfile)
pinnt API7s `wasm-nginx-module` 0.7.0 auf `0b4b31d6ecfdbc587e8ea455ed6e920a98aadff1`
und Wasmtime 49.0.2. Das Modul ist statisch eingebaut. Lua-Helfer `resty.proxy-wasm` und
`libwasmtime.so` werden im Docker-Image sowie im nativen Runtime-Archiv mitgeliefert.
Geprüft wurde das veröffentlichte ShieldPM-Nginx-Binary 1.31.6 auf x86_64.

Die [Moduldokumentation](https://github.com/api7/wasm-nginx-module/blob/0b4b31d6ecfdbc587e8ea455ed6e920a98aadff1/README.md)
verlangt `wasm_vm wasmtime;` im `http`-Kontext und die Lua-Methoden `load`, `on_configure`
und die jeweiligen HTTP-Callbacks. Die vorhandene Basiskonfiguration aktiviert diese Verbindung noch nicht.
Kongs anders benanntes Modul und dessen Direktiven sind hier nicht anwendbar.

### Ausführungsnachweis

Ein kleiner synthetischer Wasm-Filter lief in einem eigenen Nginx-Prozess auf einem temporären Loopback-Port.
Der Prozess wurde danach beendet; kein produktiver Dienst wurde verändert. Die Probe enthält acht bestandene
Assertions, die gemeinsam folgende Verhaltensweisen absichern:

| Fall                      | Tatsächliches Ergebnis                              |
| ------------------------- | --------------------------------------------------- |
| Kein Demo-API-Key         | HTTP 403, `WASM_DENIED`                             |
| Falscher Demo-API-Key     | HTTP 403                                            |
| Richtiger Demo-API-Key    | HTTP 200                                            |
| Gespoofter Request-Header | Upstream erhält stattdessen `x-shieldpm-plan: beta` |
| Response-Transformation   | Client erhält `x-shieldpm-wasm: active`             |
| Wasm-Trap                 | HTTP 503 durch ausdrückliche Lua-Fehlerbehandlung   |
| Ungültige Wasm-Datei      | HTTP 503 durch dieselbe Fehlerbehandlung            |
| Folgeanfragen             | Health und gültiger Filter bleiben HTTP 200         |

`nginx -t` war trotz der ungültigen Wasm-Datei erfolgreich: Das Modul überspringt unter
`ngx_test_config` die VM-Initialisierung. Eine Syntaxprüfung ersetzt deshalb keinen Ausführungstest.
Die erfolgreiche Trap-Behandlung begrenzt weder Endlosschleifen noch den Speicherverbrauch.
Es wurde kein Durchsatzbenchmark ausgeführt; Wasm wird hier als Erweiterungsschnittstelle bewertet.

### Grenzen des vorhandenen Adapters

Die [ABI-Beschreibung](https://github.com/api7/wasm-nginx-module/blob/0b4b31d6ecfdbc587e8ea455ed6e920a98aadff1/proxy_wasm_abi.md)
und tatsächlichen C-Implementierungen sind maßgeblich, nicht die vollständige Proxy-Wasm-Spezifikation:

- Header lesen/ändern und lokale Antworten sind nachgewiesen. Allgemeines Umschreiben von Response-Bodies ist nicht verfügbar: `proxy_set_buffer_bytes` ist nicht implementiert.
- Shared Data/Queues sowie Zeit-/Tick-APIs sind nicht implementiert; Plugin-Metrikfunktionen sind Erfolg meldende Stubs. Darauf weder verteilte Limits noch belastbare Metriken aufbauen.
- Der Wasmtime-Adapter setzt keine Fuel-/Epoch- und Store-Speicherlimits und vererbt die Prozessumgebung an WASI. Ein frei zugänglicher Upload-Katalog benötigt davor zusätzliche Grenzen im Nginx-Repository.
- Beliebige Envoy-/Kong-/Coraza-Plugins und JWT-Prüfung sind durch diesen Test nicht als kompatibel nachgewiesen.
- Die Reihenfolge mit ModSecurity/OpenAppSec, Body-/Kompressionsfiltern und sämtlichen Hostvarianten wurde noch nicht vollständig ausgeführt.

### Konkreter erster Ausbau

1. Eine Capability-Anzeige unterscheidet eingebaut, installiert, konfiguriert und tatsächlich funktionsfähig. Sie prüft Docker und native Installation durch einen echten Filteraufruf.
2. Gebündelte, geprüfte Filter bekommen unveränderliche Versionen und Hashes unter `/data/`. Pro Host gibt es Aktivierung, Reihenfolge und schema-validierte Konfiguration. Aktuelle Secrets bleiben aus Listenantworten und Audit-Diffs entfernt.
3. Ein gemeinsamer Lua-Dispatcher verbindet die Filter mit vorhandenen Lua-Blöcken. Normale Hosts, Custom-Locations und der Anubis-Pfad werden geprüft; ACME- und Firewall-Fehlerausnahmen bleiben ausdrücklich definiert.
4. Vor Aktivierung laufen Syntax- und isolierte Ausführungstests einschließlich fehlerhafter Konfiguration, fehlender/falscher Credentials und Trap. Ein Ausfall erhält den vorherigen funktionierenden Filterstand.
5. Authentifizierende Filter lehnen bei einem Laufzeitfehler kontrolliert ab. Nicht authentifizierende Filter brauchen eine ausdrücklich konfigurierte Fehlerstrategie. Pluginfehler und aktive Version sind im UI sichtbar.

Für diesen ersten gebündelten Header-/API-Policy-Filter kann das bestehende Binary verwendet werden.
CPU-/Speicherbegrenzung und eingeschränkte WASI-Umgebung für allgemeine Uploads gehören in `shieldpm-nginx`.
Die Produktanbindung, Berechtigungen, Schemas, API, Oberfläche, Versionsverwaltung und Aktivierung gehören in `ShieldPM`.

## Neue Features nach Nutzen und Aufwand

Aufwand ist relativ: M = mehrere zusammengehörige Komponenten; L = größerer Ausbau mit Datenmodell,
Aktivierungs-/Rückrollpfaden und Integrationstests. Es sind keine zugesagten Arbeitstage.

| Priorität | Feature                                                     | Neue Funktion gegenüber dem vorhandenen Stand                                                                                                 | Abnahme                                                                                                                                                                                                   | Aufwand |
| --------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| F01       | Wasm-Filter pro Host                                        | Geprüfte API-Key-/Header-Policies, Request-/Response-Header-Transformationen, lokale Antworten; Runtime-Status und Versionen                  | Die acht obigen Fälle zusätzlich mit tatsächlichem ShieldPM-Rendering, Owner-Rechten, Anubis, WAF und Rollback bestehen. Keine Freigabe allein durch `nginx -t`.                                          | L       |
| F02       | Upstream-Pools, Failover und Canary                         | Mehrere Ziele statt eines `forward_host`/Ports, Gewichte, Backupziel, sichtbarer Zustand                                                      | Gewichtung und Ausfall/Rückkehr mit echten Upstreams; WebSockets, Host/SNI und nicht idempotente Requests erhalten definierte Semantik. Aktive Checks müssen gesondert angebunden werden.                 | L       |
| F03       | Hostbezogene Versionen und Rollback                         | Historie je Host, wer welche Felder änderte, Vergleich und Wiederherstellung; ergänzt die vorhandene Entwurfs-/Aktiv-Diff-Vorschau und GitOps | Secrets redaktieren; veraltete Wiederherstellung erkennen; DB und sämtliche referenzierten Dateien nach fehlerhafter Aktivierung unverändert.                                                             | M–L     |
| F04       | Incident-Center und Benachrichtigungskanäle                 | Zusammenhängende Vorfälle, Latenzverlauf, tägliche Uptime-Aggregate, Webhook/ntfy/Discord und geplante Alarm-Stummschaltung                   | Fehlende Messungen bleiben unbekannt; Aggregate überleben die 100er-Checkhistorie; Zustellung ist sichtbar und wiederholbar. Vorhandene Wartungsseiten werden nicht mit Alarm-Stummschaltung verwechselt. | L       |
| F05       | Tags, gespeicherte Ansichten und Bulk-Profile               | Gruppen wie Produktion/Intern/Media; kombinierte gespeicherte Filter; Sicherheitsprofile auf mehrere Hosts anwenden                           | Vorschau der betroffenen Hosts, Einzelberechtigungen, Teilfehler und genau eine validierte Sammelaktivierung. Bestehende individuelle Rate-Limits bleiben erhalten.                                       | M–L     |
| F06       | Echter Cache-Manager                                        | Pro Host/Route TTL, Cache-Key, Cookie-/Auth-Bypass, gezieltes Purge und Trefferquote                                                          | Authentifizierte/private Antworten werden im Standard nicht geteilt; HIT/MISS, Ablauf und Purge mit echten Requests prüfen. Behebt den missverständlichen bisherigen Cache-Schalter.                      | M–L     |
| F07       | Geräte-/Session-Verwaltung                                  | Bestehende Session-Familien, IP/User-Agent und Widerrufsfunktionen im Benutzerprofil nutzbar machen                                           | Aktuelle Sitzung markieren; eine oder alle anderen Geräte widerrufen; Owner-Isolation; Replay-Schutz und sichere Aufbewahrungsgrenze prüfen.                                                              | M       |
| F08       | Verschlüsselte Instanzsicherung mit Wiederherstellungsprobe | Ergänzt GitOps-Konfigurations-/Dateiexport um konsistente vollständige Datenbank, Schlüsselmaterial, Manifest und geprüften Restore           | Providergeeigneter Snapshot für SQLite/MySQL/PostgreSQL; isolierte Wiederherstellung vor Aktivierung; Hash-/Versionsfehler und falsches Passwort dürfen den laufenden Stand nicht verändern.              | L       |

Weitere konkrete Ausbaupfade sind ein redaktierter GitOps-Plan vor Apply, atomare GitDeploy-Releases mit
Rollback und authentifizierten Webhooks, eingeschränkte widerrufbare Automationsschlüssel sowie
Zertifikatsablauf-/Erneuerungsalarme. WireGuard-Routing mit konfigurierbarem Egress und serverseitigen
Peer-Zielregeln ist ein größerer eigener Netzwerk-Ausbau. Diese sind keine Voraussetzung für F01.

Empfohlene Reihenfolge: zuerst B01–B08 als gezielte Stabilisierung, danach O01/O02 mit reproduzierbaren
Messungen und F01 als neues sichtbares Feature. B09–B12 in den jeweiligen UI-/Cache-/Upload-Pfaden ergänzen.
F03 sichert weitere Aktivierungsfunktionen ab; F02 und F04
ergänzen danach Verfügbarkeit und Beobachtbarkeit. Wasm ist für diese anderen Features nicht zwingend nötig.

## Validierung und Grenzen

| Prüfung                                      | Ergebnis dieses Durchgangs                                                                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend-JSDoc/TypeScript                     | Bestanden                                                                                                                                                                                |
| Gesamte Backend-Suite                        | 2.176 bestanden, 7 konfigurierte Skips; 232 Dateien bestanden, 3 übersprungen                                                                                                            |
| Gesamte Frontend-Suite                       | 943 bestanden, 213 Dateien                                                                                                                                                               |
| Locales, Frontend-Typen und Produktionsbuild | Bestanden                                                                                                                                                                                |
| Bundle-Budget                                | JS gesamt 1.111.738 / 1.290.000 Bytes; größtes JS 106.550 / 299.000; CSS 16.325 / 16.600; bestanden                                                                                      |
| Biome Backend/Frontend                       | Keine Fehler; Backend 6 vorhandene Warnungen, Konfigurationshinweise bleiben                                                                                                             |
| TScanner vollständiger Workspace             | 679 Dateien, 0 neue/bestehende/beratende Befunde, 0 Scannerfehler                                                                                                                        |
| TScanner-eigene Tests                        | 73 bestanden                                                                                                                                                                             |
| Python-Infrastrukturtests                    | 164 Fälle: 143 bestanden, 21 Umgebungsskips. Ein übersprungener Nginx-Fall anschließend mit dem vorhandenen Binary bestanden: 144 unterschiedliche Fälle ausgeführt, 20 nicht ausgeführt |
| Zusätzliche Probes                           | Echtes SQLite/Express/AJV, Radix/React Select, Liquid und lokale Nginx-Prozesse; Wasm acht Assertions erfolgreich                                                                        |

Die bestehenden PR-Checks für Quality, Browser-Smoke, MariaDB-Migrationen und CodeQL waren beim Abgleich
erfolgreich; die beiden Docker-Architektur-Builds liefen zu diesem Zeitpunkt noch. Das ersetzt keine erneute
Abfrage vor einem späteren Merge. Dieser Auftrag hat keinen Merge und keine Veröffentlichung ausgeführt.

Die verbleibenden lokalen Infrastrukturskips benötigen 17-mal native MaxMind-Bibliotheken, einmal eine
GeoIP2-Laufzeit, einmal andere UID-Rechte und einmal AF_UNIX-Rechte. Kein vollständiger Docker-Start,
Produktivupdate, externer Identity-Provider, echter ACME-Auftrag oder Anbieterzugang wurde lokal ausgeführt.
Die neuen Upsert-Kandidaten sind nicht mit MySQL/PostgreSQL gemessen; die neuen Race-Reproduktionen bilden
kein Lastprofil einer produktiven Mehrprozessinstallation ab. Die Wasm-Ausführung wurde auf x86_64 geprüft,
nicht auf ARM64. Vorhandene Tests und Scanner beweisen keine vollständige Fehlerfreiheit.

Der B01-Nachweis verwendet echte Dateien und Nginx mit isolierten Modell-/Statusschreibgrenzen. Bei B05 laufen
SQLite und die Migrationen tatsächlich, während externe Tunnelprozesse kontrolliert sind. Die DDNS-Probe
kontrolliert externe HTTP-/DB-Grenzen. Diese Unterschiede begrenzen den jeweiligen End-to-End-Nachweis.

Die Hauptprüfungen lassen sich mit Node 26 und den eingefrorenen Yarn-Abhängigkeiten wiederholen:

```sh
cd backend
node node_modules/typescript/bin/tsc --noEmit
yarn test --run --maxWorkers=2
cd ../frontend
yarn test --run --maxWorkers=2
node check-locales.cjs
yarn build
cd ..
node frontend/scripts/ci/check-bundle-budget.cjs --dist frontend/dist --budget frontend/performance-budget.json
node scripts/ci/tscanner.mjs
yarn --cwd .tscanner test
python3 -m unittest discover -s scripts/tests -v
```

## Offene Arbeiten und Wiki-Prüfung

Alle B-Punkte sind bei Erstellung dieses Berichts offen. Die Feature-Tabelle beschreibt Vorschläge mit
Abnahmekriterien, keine bereits ausgelieferte Funktion. Die zentralen TODOs stehen unter
[Offene Fragen](../offene-fragen.md).

Geprüft wurden Index, Tests, frühere Audit-/Optimierungsberichte sowie die betroffenen Backend-, Frontend-,
Nginx- und Betriebsseiten. Aktualisiert werden Index, Nginx-Engine, zentrale offene Fragen und der
Nginx-Modulhinweis in `GEMINI.md`; dieser Bericht und sein JSON-Nachweis sind neu.

## Verwandte Seiten

- [Prüfnachweise als JSON](./feature-review-2026-10-17.json)
- [Messbare Optimierungen aus PR #155](./performance-optimierung-2026-10-17.md)
- [Optimierungsprüfung vom 13. Oktober](./optimierungspruefung-2026-10-13.md)
- [Nginx-Engine](../module/nginx-engine.md)
- [Tests](./tests.md)
- [Offene Fragen](../offene-fragen.md)
