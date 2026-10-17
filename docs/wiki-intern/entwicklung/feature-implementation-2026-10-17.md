# Umsetzung der Gesamtprüfung vom 17. Oktober 2026

Die [ursprüngliche Gesamtprüfung](./feature-review-2026-10-17.md) ist ein unveränderter Befundbericht vor der Implementierung. Dieses Dokument beschreibt die anschließende Umsetzung von B01–B12, O01–O07 und F01–F08 mit dem erneut geladenen deepen-prompt-Skill. Grundlage sind derselbe ShieldPM-Stand einschließlich [PR #155](https://github.com/shedowe19/ShieldPM/pull/155), reale Datenbank-/HTTP-Tests und das veröffentlichte ShieldPM-Nginx-Binary 1.31.6 mit API7 Wasm 0.7.0/Wasmtime 49.0.2. Ein Versionswechsel ist nicht Bestandteil dieser Änderung.

## Neue Funktionen

| ID  | Umsetzung                                                                                                                                                                                                   | Oberfläche und Dokumentation                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| F01 | Geordnete vertrauenswürdige Wasm-Filter für API-Schlüssel, Anfrage-/Antwortheader und lokale Antworten; Runtime-Erkennung, echter Selbsttest, unveränderliche Artefakte, geprüfte Aktivierung und Rücknahme | Proxy-Host → Wasm; [Wasm-Filter](../module/wasm-filter.md)                    |
| F02 | Gewichtete Upstream-Pools, Backup-Ziele, passive Ausfallbehandlung, sichere Wiederholungsregeln, Host-/SNI-/TLS-Konfiguration und getrennte TCP-/Monitorbeobachtung                                         | Proxy-Host → Upstreams; [Upstream-Pools](../module/upstream-pools.md)         |
| F03 | Verschlüsselte Host-Versionen, redigierter Vergleich, Schutz vor veralteten Zuständen, begrenzte Aufbewahrung und Wiederherstellung mit geprüfter Aktivierung                                               | Host-Menü → Versionen; [Host-Versionen](../features/host-revisionen.md)       |
| F04 | Störungen, gemessene Verfügbarkeit/Abdeckung, Latenzverlauf, geplante Alarmunterdrückung und dauerhafte Webhook-/ntfy-/Discord-Zustellung mit Wiederholungen                                                | Störungszentrale; [Incident Center](../module/incident-center.md)             |
| F05 | Tags, persönliche Ansichten, Sicherheits-/Ratenprofile und geprüfte Mehrfachänderungen mit Ergebnissen je Host                                                                                              | Host-Arbeitsbereich; [Arbeitsbereich](../features/host-arbeitsbereich.md)     |
| F06 | Tatsächlicher Proxy-Cache mit TTL, Routen, Größenlimit, Auth-/Cookie-/Methoden-Bypass, Löschung und begrenzter HIT/MISS-Stichprobe; WAF-Auswahl unabhängig vom Cache                                        | Proxy-Host → Cache und Sicherheit; [Proxy-Cache](../module/proxy-cache.md)    |
| F07 | Eigene Browser-Sitzungen anzeigen und einzelne oder alle anderen Geräte abmelden                                                                                                                            | Profil → Sitzungen; [Auth-Session-Service](../module/auth-session-service.md) |
| F08 | Verschlüsselte vollständige Instanzbackups einschließlich Datenbank, Zertifikaten, Schlüsseln und Konfiguration; Upload/Download, Integritätsprüfung und geprüfte Wiederherstellung beim nächsten Start     | Einstellungen → Backups; [Instanzbackups](../module/instance-backups.md)      |

Wasm führt den gebündelten, begrenzten Policy-Filter aus. Ein beliebiger Upload fremder Wasm-Binaries, ein Plugin-Marktplatz und unbelegte JWT-/Body-Rewrite-Funktionen werden nicht angeboten. Für diese Funktionen wäre eine gesonderte Runtime- und Ressourcenprüfung erforderlich.

## Fehlerkorrekturen

| ID  | Änderung und Absicherung                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B01 | Access-List-Dateien erhalten unveränderliche versionierte Namen; laufende alte Worker lesen weiterhin die alten Passwort-/CA-Dateien. Ungültige CA wird vor Veröffentlichung verworfen. Gemeinsamer Rollback umfasst Datenbank, Dateien und Nginx. |
| B02 | Begrenzter kanonischer Validator-Cache entfernt auch AJV-Einträge bei Verdrängung; konstante Schemas werden wiederverwendet.                                                                                                                       |
| B03 | Transaktionales gemeinsames Domainregister verhindert konkurrierende Proxy-/Redirect-/404-Belegungen auch über mehrere Datenbankverbindungen. Alte und neue Namen bleiben während einer Aktivierung für deren Rollback reserviert.                 |
| B04 | Docker-Eventstream verbindet mit begrenztem exponentiellem Backoff neu und gleicht den Bestand erneut ab; Stop beendet Stream und Timer.                                                                                                           |
| B05 | GitOps aktiviert neue/geänderte Cloudflared-Tunnel und meldet Prozessfehler. Proxy-Importe berücksichtigen die neuen Policy- und Aktivierungsregeln.                                                                                               |
| B06 | Manueller DDNS-Test und Scheduler verwenden dieselbe Provider-Queue und lesen aktuelle Konfiguration innerhalb der Queue.                                                                                                                          |
| B07 | Die ACME-Registrierung erfolgt erst bei der ersten tatsächlichen Zertifikatsanforderung unter dem vorhandenen Prozess-Lock. Ein nicht erreichbares ACME blockiert die Oberfläche nicht beim Start.                                                 |
| B08 | Installer und Runtime berücksichtigen die effektive Legacy-Datenbankquelle; eine widersprüchliche Providerwahl wird nicht mehr als erfolgreicher Wechsel ausgegeben.                                                                               |
| B09 | Alle Proxy-Tabs haben zugängliche übersetzte Namen, einschließlich der bisherigen Symbol-Tabs.                                                                                                                                                     |
| B10 | Das gemeinsame React-Select-Domainfeld verwendet `inputId`, damit Label und tatsächliche Eingabe verbunden sind.                                                                                                                                   |
| B11 | Der Cache-Schalter erzeugt echte Cache-Direktiven. Eine Migration bewahrt die bisher effektive WAF-Auswahl unabhängig davon.                                                                                                                       |
| B12 | Upload-Relay kapselt IPv6-Ziele über den vorhandenen Upstream-Host-Filter; echte IPv4-/IPv6-/Pool-Anfragen prüfen den Datenpfad.                                                                                                                   |

## Optimierungen

| ID  | Umsetzung und Messgrenze                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O01 | Wiederverwendete Access-Validatoren mit aktuellen Actor-/Owner-Daten; keine vollständige Proxy-ID-Liste für eine reine Capability-Prüfung.                                             |
| O02 | Transaktionale Analytics-Sammel-Upserts in 250er-Chunks mit gleichen Zählern, Mehrfachschlüsseln und atomarem Rollback auf SQLite/PostgreSQL. MySQL-Ausdrücke sind kompiliert geprüft. |
| O03 | Owner-/Access-List-/Zertifikatsexpansionen folgen den sichtbaren Tabellenspalten. Ein Bearbeitungsdialog lädt weiterhin eigene vollständige Details.                                   |
| O04 | Schlanke Hostauswahl und echte Request-Abbrüche bei Analytics-Auswahlwechsel, unsichtbarer Seite, Offline-Zustand und Unmount.                                                         |
| O05 | Stündliche begrenzte Bereinigung abgelaufener Auth-Sessions nach sieben Tagen zusätzlicher Aufbewahrung; gültige Replay-Erkennung bleibt erhalten.                                     |
| O06 | Asynchrone WireGuard-Abfragen mit zwei Sekunden gemeinsamem Snapshot, Singleflight, Invalidierung und Datenbank-Writes nur bei geänderten Statuswerten.                                |
| O07 | Ein indexierter Docker-Ausgangsbestand mit atomarer Prüfung beim Schreiben; native Installer-Vorbereitung und Downloads vor dem Anhalten der laufenden Instanz.                        |

### Reproduzierbarer Analytics-Vergleich

`node backend/scripts/benchmarks/analytics-upsert.mjs` vergleicht 500 einzelne Upserts mit der tatsächlichen neuen Produktionshilfe. Ein Sample umfasst zwei Flushes mit Zählerprüfung, nach einem Warmup folgen sieben Samples. Im lokalen SQLite-Speicherlauf mit Node 26.12.0 sinkt die Anzahl der INSERTs von 1.000 auf 4; der Median beträgt 83,48 statt 8,00 ms. Das sind synthetische lokale Werte während weiterer Prüfungen, kein Versprechen für Produktionslatenz.

Die [JSON-Rohwerte](./feature-implementation-2026-10-17.json) enthalten alle Samples und den abschließenden Prüfstand. Weitere Optimierungen haben funktionale und instrumentierte Nachweise; ein ungemessener Produktivgewinn wird nicht behauptet.

## Abschließende Validierung

- Backend: 2.508 Tests im Gesamtlauf bestanden, 41 umgebungsabhängige Skips; keine Fehler. PostgreSQL-Verhalten wird zusätzlich mit PGlite geprüft.
- Frontend: 986 Tests bestanden; TypeScript, Übersetzungen, Produktionsbuild und komprimiertes Größenbudget bestanden.
- Echter Chromium-Browser: zehn vollständige Abläufe einschließlich der neuen Bedienwege bestanden; keine unbehandelten Browserfehler.
- Skripte/Betrieb: 170 Python-Tests, davon 149 bestanden und 21 umgebungsabhängig übersprungen; Shellsyntax geprüft.
- Zusätzlich tatsächliches ShieldPM-Nginx: Wasm/Cache-Kombination, Header-Fehlerstrategie, Pool-Failover, IPv4/DNS/IPv6-Uploads, weiterlaufende Access-List-Worker und Backup-Containment.
- Statische Konventionen, Diff-/Secretprüfung und Schema-Auflösung bestanden auf dem endgültigen Stand.

### Nachprüfung der ersten CI-Runde

Die echte GitHub-CI hat zusätzliche Annahmen der Testumgebung sichtbar gemacht: Die isolierte MariaDB-Testkopie erhält nun auch die Domain-Schlüsselhilfe; ein immer ausgeführter SQLite-Test prüft denselben vollständigen temporären Migrationsbaum. Drei reine Service-Tests laden keine fremden Datenbank-/Schlüsseldienste mehr. Ihre unveränderten 26 Assertions bestehen sowohl mit schreibgeschütztem `DATA_PATH` als auch ohne vorhandenes Datenverzeichnis. Access-List-Dateien und Revisionssnapshots verwenden denselben validierten Pfad unter `DATA_PATH`.

Die CodeQL-Nachprüfung führte zu zusätzlichen Schutzmaßnahmen und Regressionstests: Dateipfade akzeptieren nur kanonische IDs, Cache-/Logzugriffe prüfen symbolische Links, und Backup-Downloads sowie Entschlüsselung lesen über denselben geprüften Dateideskriptor. Jeder Upload besitzt ein eigenes privates temporäres Verzeichnis, das auch bei falschen Formularfeldern, mehreren Dateien, Größenlimit, Parserfehlern und Verbindungsabbruch bereinigt wird. Sechs zusätzliche echte HTTP-Fälle prüfen diese Fehlerwege, unberührte fremde Dateien und eine anschließend erfolgreiche neue Anfrage. FIFOs können die Prüfung nicht blockieren. Access-List-Dateiversionen verwenden zufällige 256-Bit-IDs unabhängig von Zugangsdaten; die Passwörter bleiben mit bcrypt-Kostenfaktor 13 geschützt. Der WireGuard-Test startet einen festen Hilfsprozess statt erzeugten JavaScript-Quelltextes. CodeQL-Regeln werden dafür nicht unterdrückt.

### Nachprüfung der automatischen PR-Review

Der Monitorfilter des Arbeitsbereichs berücksichtigt die aktuelle Aktivierung von Host und Monitor statt allein des letzten Messwerts. Pausierte Hosts erscheinen dadurch nicht mehr unter `up` oder `down`; aktivierte Hosts ohne Monitor werden unter `unknown` geführt. SQLite- und PostgreSQL/PGlite-Fälle prüfen Filter, Besitzergrenzen, Zähler und Paginierung.

GitOps verwirft fremde Access-List-Dateirevisionen und erzeugt Passwort-/CA-Dateien unter der lokalen Listen-ID vor der Host-Aktivierung neu. Fehlende oder fehlgeschlagene Listen verhindern das Schreiben abhängiger Host-Kandidaten. Zehn Tests mit tatsächlichem Nginx prüfen Basic Auth, mTLS und Rücknahme, einschließlich eines injizierten Datenbankfehlers nach bereits erfolgreichem Reload. Möglicherweise noch von auslaufenden Workern benötigte unveränderliche ACL-Dateien bleiben erhalten.

Wasm unterscheidet erfolgreiche Vorprüfung und bestätigte Aktivierung. Der gemeinsame Konfigurations-Lock führt den Status erst nach abgeschlossenem Batch beziehungsweise dessen Rücknahme fort. Alte geheime Host-Konfigurationen erhalten persistente Schutzreferenzen auf Worker-PID und Kernel-Startzeit; sie werden erst gelöscht, wenn keine aktive/gesicherte Konfiguration und kein auslaufender Worker sie mehr benötigt. Dies erzwingt keine Unterbrechung langer Verbindungen. Fehlerberichte verschiedener Filterversionen sind getrennt. Die Einzelheiten und die sichere Behandlung unbekannter Prozesszustände stehen unter [Wasm-Filter](../module/wasm-filter.md).

Ein vorhandener Frontend-Quellvertrag akzeptiert außerdem Formatierungs-Leerraum nach dem Audit-Wrapper. Seine Prüfung der Audit-Objekttypen und vollständigen Aufrufabdeckung bleibt erhalten. Der Nginx-Parallelitätstest verwendet explizite Start-/Freigabebarrieren statt eines einzelnen JavaScript-Takts und prüft die vollständige Reihenfolge beider Änderungen; die zugehörigen Render-/Aktivierungs-/Rücknahmetests bestehen mit 201 Fällen.

Die erweiterte GitOps-Erreichbarkeit machte zwei CodeQL-Hinweise zur bisherigen PEM-Regex sichtbar. Die Prüfung verwendet nun einen linearen Scanner mit einer Grenze von 1 MiB, exakten Hüllen, geprüften Base64-Zeichen und weiterhin `X509Certificate` für jedes Zertifikat. Regressionsfälle mit 20.000 wiederholten BEGIN-Markern prüfen die beiden langsamen Fehlerformen innerhalb einer Sekunde. Der echte mTLS-Test vertraut seiner erzeugten CA ausdrücklich und prüft SAN/Servername `localhost`, statt die TLS-Zertifikatsprüfung auszuschalten. Die gemeinsame gezielte ACL-/GitOps-Prüfung besteht mit 100 Fällen; CodeQL-Regeln werden nicht unterdrückt.

## Betriebsfehler und Wiederanlauf nach dem ersten Instanztest

Die ursprünglichen SQLite-/PGlite- und Nginx-Prüfungen deckten die folgenden tatsächlichen MariaDB- und
Startkonstellationen nicht ausreichend ab. Die nachgereichten Produktionsmeldungen wurden mit zusätzlichen
gezielten Regressionen überprüft:

- Die Historienbereinigung kann unter MariaDB-Snapshot-Isolation `ER_CHECKREAD`/1020 auslösen und die gesamte
  Ergebnistransaktion verwerfen. Wiederholt wird deshalb ausschließlich die vollständige Datenbankarbeit in
  höchstens drei frischen Transaktionen. Probe und externe Benachrichtigungen laufen einmal. Echte konkurrierende
  Verbindungen reproduzieren den Fehler vor der Korrektur; Status, Historie, Vorfall und Outbox bleiben danach atomar.
- Der implizite lokale Docker-Socket ist bei nativer/LXC-Installation optional. Sein Fehlen erzeugt eine Info und
  Wiederholungen im Abstand von 30 bis höchstens 300 Sekunden. Explizite Ziele und andere Transportfehler bleiben
  sichtbare Warnungen, identische Meldungen höchstens alle fünf Minuten. Später bereitgestellte Sockets werden erkannt.
- Zertifikatsupdates binden streng geprüfte zonierte ISO-Werte als echte `Date`-Werte, damit mysql2 seine bestehende
  Verbindungszeitzone konsistent verwendet. Tests prüfen den gemeldeten DATETIME-Fehler und Offset-/Berlin-Roundtrips.
- Der neue manuelle Host-Updatepfad hatte den vollständigen gelesenen Relationsgraph einschließlich Zertifikats-/
  Access-List-Daten und ISO-Zeitstempeln in den Schreibgraph übernommen. Der Schreibgraph enthält nun nur angefragte
  Hostfelder und normalisierte Domains; gemeinsam genutzte Ressourcen und ausgelassene aktuelle Werte bleiben erhalten.
  Der getrennte vollständige Snapshot bleibt für Revisionen und Aktivierungs-Rollback bestehen. Dessen Rückweg bindet
  MySQL-Zeitstempel ebenfalls über den Treiber statt als unzulässige ISO-SQL-Zeichenketten.
- Beim Start hatte ein einzelner fehlerhafter Host nach dem vorherigen Löschen der aktiven Dateien den gesamten
  Neuaufbau zurückgerollt. Nginx konnte anschließend den leeren Include-Bestand erfolgreich prüfen, während die
  Webseiten HTTP 404 lieferten. Eine echte Nginx-Regression reproduziert dieses Muster. Der Startup-Pfad isoliert
  fehlerhafte Hosts und bereitet die gültigen Hosts einzeln vor; der bestehende abschließende Reload aktiviert sie.
  Solange ein Host fehlschlägt, wird der Fingerprint nicht geschrieben, damit der nächste Start erneut versucht.

Die lokalen Serverfälle verwenden echtes MariaDB 10.11.14 mit ausdrücklich aktivierter Snapshot-Isolation;
die CI führt zusätzlich alle internen `mariadb-*.spec.js` gegen ihren vorhandenen MariaDB-11.8.3-Service aus.
Der konkrete ursprüngliche ungültige Nginx-Hosteintrag der produktiven Instanz ist nicht bekannt. Globale
Nginx-Konfigurationsfehler können weiterhin die abschließende Aktivierung verhindern.

## Integrationsregeln und Prüfgrenzen

Neue und vorhandene Hosts verwenden dieselben Policy-Normalisierungen. Öffentliche API und GitOps akzeptieren keine als lokale Geheimnisse ausgegebenen Wasm-Ciphertexte. Ein leeres Schlüsselfeld erhält den aktuellen gespeicherten Schlüssel desselben Hosts und Filters. Exporte, Vorschauen, Revisionsvergleiche und Audit-Metadaten geben Schlüssel nicht preis. Vollständige Instanzbackups enthalten die zur Wiederherstellung benötigten Schlüssel ausschließlich innerhalb des verschlüsselten Archivs.

Die funktionalen Prüfungen verwenden SQLite und PostgreSQL über PGlite, tatsächliche lokale HTTP-/TLS-Server und das veröffentlichte x86_64-Nginx. Wasm-Ausführung, Cache, IPv6, WebSocket, Pool-Failover und weiterlaufende Access-List-Worker werden tatsächlich ausgeführt. In der eingeschränkten Testumgebung ersetzt ein ausschließlich für den Selbsttest aktivierter TCP-Schalter die sonst verwendete Unix-Socket-Verbindung. Die fünf tatsächlichen Master-/Worker-Fälle lesen echte Kernel-Prozessdaten; lediglich die PID-Datei des Testbeobachters übersetzt die verschachtelten lokalen PID-Namensräume. Workerzustände und Prozess-Zugangsdaten werden dabei nicht simuliert. Zusammen mit 18 Datei-/Prozess-Regressionsfällen und 16 echten Wasm-/Cache-/Vorprüfungsfällen bestehen 39 kombinierte Prüfungen.

Ein produktiver externer MySQL-/PostgreSQL-Server, ARM64, eine echte WireGuard-Schnittstelle, Docker-Daemon, Cloudflare-/ACME-Konten und öffentliche Benachrichtigungsdienste stehen lokal nicht vollständig zur Verfügung. Deren Grenzen werden durch echte lokale Gegenstellen, kontrollierte Prozessgrenzen und CI-Prüfungen abgesichert; die jeweilige externe Betriebsprüfung wird dadurch nicht ersetzt. Eine produktive Instanz wurde nicht verändert.

## Wiki-Prüfung

- Geprüfte Wiki-Seiten: ursprüngliche Gesamtprüfung, betroffene Backend-/UI-/Betriebsseiten und API-Übersicht.
- Aktualisierte Wiki-Seiten: Auth, Access Lists, Host-Lifecycle, Docker, DDNS, GitOps, WireGuard sowie zentrale Index-/Kontextseiten.
- Neu erstellte Wiki-Seiten: Wasm, Upstream-Pools, Proxy-Cache, Host-Versionen, Host-Arbeitsbereich, Störungszentrale und Instanzbackups einschließlich API-Nachweis.
- Keine Wiki-Änderung nötig: entfällt; sämtliche neuen Funktionsbereiche sind dokumentiert.
- Offene Wiki-TODOs: externe Betriebsprüfungen und die beschriebenen Plattformgrenzen; keine erfundenen Produktivmessungen.

## Verwandte Seiten

- [Ursprüngliche Gesamtprüfung](./feature-review-2026-10-17.md)
- [Interner Wiki-Index](../index.md)
- [Rohwerte und Prüfstand](./feature-implementation-2026-10-17.json)
