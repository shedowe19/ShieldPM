# Log

Append-only, neueste zuerst. Ein Eintrag pro relevanter Aktion, mit allen Feldern.

## [2026-11-06] fix | Messgruppen im Live-Datenfluss bleiben sichtbar

- Command: Nutzerauftrag: PR 162 auf dem Produktivsystem prüfen; der Aufklapper „Messgruppen nach Byte-Abrechnung“ verschwindet im Live-Datenfluss.
- Type: fix
- Areas affected: Live-Datenfluss-Oberfläche, Analytics-Lokalisierung, Analytics-Dokumentation
- Files changed: `frontend/src/pages/Analytics/TrafficFlowRate.tsx`, `frontend/src/pages/Analytics/TrafficFlowRate.test.tsx`, `frontend/src/locale/lang/de.json`, `frontend/src/locale/lang/en.json`, `docs/wiki/Analytics.md`, `llm-wiki/wiki/tasks.md`
- Wiki pages updated: Entscheidung „Traffic-Flow: Messgrenzen explizit halten“, Log, Changelog und Aufgaben
- New wiki pages: keine
- New TODOs: T-028 (Anubis-Hosts im Live-Datenfluss kennzeichnen)
- New bugs: Der Aufklapper wurde bei jedem Poll neu bewertet und verschwand, sobald die aktuelle Rate vollständig war; eine geöffnete Aufteilung und die zuletzt gemessenen Komponenten gingen verloren.
- New decisions: Aufklapper bleibt an die Client-Gruppe gebunden. Fehlt eine aktuelle Aufteilung, werden die zuletzt gemessenen Komponenten bis zu 60 Sekunden als „zuletzt gemessen“ gehalten; danach zeigt der Aufklapper „Keine aktuelle Aufteilung“. Keine fortgeschriebenen Summen.
- Open questions: keine
- Next steps: Fix auf PR 162 pushen; nicht mergen und nicht auf Produktion deployen.
- Verification: `TrafficFlowRate.test.tsx` mit 5 Tests bestanden; TypeScript `tsc --noEmit` bestanden; Biome-Check der beiden TS-Dateien ohne Befund. Produktivdaten aus PR-162-Head `589b0cfd` bestätigten den Auslöser: `rate_components` wechselte während eines Testtransfers nach einem Poll von 1 auf 0.

## [2026-11-06] fix | Verwaltete Auswahl vor leerer Neuerstellung schützen

- Command: Abschließende CI beheben und bestehende Datenbankauswahl bei fehlenden Daten sicher behandeln.
- Type: fix
- Areas affected: DB-Startschutz, Aktivierungs-Recovery und Docker-Smoke-Orchestrierung
- Files changed: `lib/database-switch.js`, Bootstrap-Regressionstests, Docker-Smoke-Script und dessen Python-Testgerüst
- Wiki pages updated: Log und Datenbank-Referenz
- New wiki pages: keine
- New TODOs: keine
- New bugs: Fehlende explizite SQLite-Dateien hätten beim normalen Start oder ausstehender Migration unbemerkt neu angelegt werden können; verwaltete Ziele ohne Anwendungsschema dürfen ebenfalls nicht neu initialisiert werden. Das Smoke-Testgerüst erwartete einen einzigen Lauf pro UID, während die DB-Ersteinrichtung zunächst separat lief.
- New decisions: Bestehende SQLite-Auswahl nur lesend mit `fileMustExist` prüfen; verwaltete Datenbanken benötigen Benutzer- und Migrationstabellen vor Anwendungsimporten. Quellenprüfung vor Zielanlage, Zielprüfung auch bei Erstsetup-Recovery ohne Inhaltsmanifest. DB-Smoke im selben kritischen UID-Lauf vor den Nginx-Prüfungen ausführen.
- Open questions: abschließende CI nach dem Push abwarten.
- Next steps: letzten Korrekturcommit pushen; CI bis zum Endstand prüfen, nichts mergen oder bereitstellen.
- Verification: 29 fokussierte Startschutztests, TypeScript und Biome bestanden. Permanente kalte Rückwechsel erneut mit aktuellen Guards auf MariaDB/PostgreSQL (zwei Tests, 6,31 s) und Oracle MySQL (ein Test, 4,87 s) bestanden: sechs konkrete Richtungen, neue Schreibvorgänge und unveränderte Archive. Gesamte lokale Python-Suite 184 Tests/19 übersprungen ohne Fehler; tatsächlicher kombinierter Docker-Smoke mit Erstwahl/CSRF und vollständigen Routing-/Firewall-Prüfungen als UID 0 und UID 1000 bestanden. Vorherige CI bestätigte Browser, allgemeine Qualität, MariaDB und Drei-Server-Matrix; nur das nun korrigierte Infrastruktur-Testgerüst war rot.

## [2026-11-06] fix | Schreibprüfung des DB-Smoke-Tests

- Command: Neue CI-Läufe nach dem DB-Feature-Push prüfen und Fehler beheben.
- Type: fix
- Areas affected: Name einer lokalen Testvariablen
- Files changed: `scripts/ci/database-setup-smoke.mjs`
- Wiki pages updated: Log
- New wiki pages: keine
- New TODOs: keine
- New bugs: Codespell wertete den Variablennamen `crossSite` als Schreibfehler.
- New decisions: verständlicher Name `foreignRequest`, keine Wörterbuch-Ausnahme und keine Verhaltensänderung.
- Open questions: restliche CI des Feature-Commits läuft noch.
- Next steps: Korrektur pushen und abschließende CI prüfen.
- Verification: Node-Syntax und Diff-Prüfung bestanden; ausschließlich lokale Variablenbezeichnung geändert. Vorheriger tatsächlicher Docker-Test bestätigte die unveränderte Cross-Site-Abweisung als UID 0 und 1000.

## [2026-11-06] feature | DB-Ersteinrichtung und verifizierter Providerwechsel

- Command: Auf ausdrücklichen Nutzerwunsch Datenbank-Erstwahl und spätere echte Migration im selben Draft-PR wie Traffic Flow umsetzen, isoliert testen und pushen; nicht mergen oder bereitstellen.
- Type: feature
- Areas affected: Bootstrap, Datenbank-Konfiguration und Kopie, Prozessaufsicht, Setup-/Settings-Oberfläche, Recovery, Instanz-Restore, SQLite-Wartung und CI
- Files changed: `bootstrap-app.js`, `runtime.js`, `lib/database-{config,switch,copy}.js`, DB-API/Schemas, historische Default-Migrationen, Backup-/CLI-Pfade, Frontend-DB-Komponenten und Tests, Launcher, Docker-Smoke und Provider-CI
- Wiki pages updated: Datenbank-Referenz, Migrationen, Konfiguration, aktueller Projektzustand, Aufgaben, ADR-Index, Index, Changelog und Log
- New wiki pages: [DB-Bootstrap und Providerwechsel](./decisions/2026-11-06-datenbank-bootstrap-und-providerwechsel.md)
- New TODOs: keine für die initiale Matrix; direkter Server-zu-Server-Wechsel und koordinierte Mehrinstanz-Migration sind ausdrücklich nicht unterstützt.
- New bugs: Reale Prüfungen fanden vorzeitige Modellimporte aus zwei historischen Migrationen, unterschiedliche Registry-Kollation, Unix-Socket-Ratelimit ohne IP, drei ungültige Oracle-MySQL-Defaults sowie Metadaten-Großschreibung. Alle genannten Fehler korrigiert und erneut geprüft. Alte Restore-/CLI-Pfade hätten die archivierte SQLite-Auswahl verwendet und berücksichtigen jetzt die aktive Auswahl.
- New decisions: DB-unabhängiger Bootstrap vor Modellimporten; private atomare Auswahl und dauerhaftes Journal; Prozessneustart stoppt eigene Schreiber, Quellsperre bleibt bis Aktivierung; vollständiger privater Export und Inhaltsprüfung vor Auswahlwechsel. Alte Quellen sind nach Aktivierung Archiv, Rückwechsel ist eine neue Migration. Andere Instanzen und externe Schreiber müssen gestoppt sein.
- Open questions: Tatsächliche CI des neuen Commits nach Push abwarten; keine produktive Installation oder Datenbank verändert.
- Next steps: Zusammenhängende DB-Phase in PR #162 pushen und alle neuen CI-Läufe prüfen. Separater früherer Audit bleibt pausiert.
- Verification: Abschließender Backend-Gesamtlauf mit echten Serverselektoren 2.790 bestanden/26 übersprungen (292 Dateien); abschließendes Frontend 1.034 bestanden (230 Dateien). Sieben Chromium-Fälle bestanden, darunter Erstwahl, Neustart, Fehlerbestätigung, veraltete Operations-Capability und Flow-Einstellungen. TypeScript/Produktionsbuild bestanden; CSS 16.539/16.600 Byte, JavaScript 1.197.144/1.290.000 Byte. Docker-Runtime-Smoke einschließlich Ersteinrichtung, CSRF, Routing und 256 Firewall-Prüfungen jeweils als UID 0 und 1000 bestanden. Zehn CLI-Tests und 23 Python-Infrastruktur-/Supervisor-Tests bestanden. Vollständige 92-Migrationen-Kette und kalte Rückwechsel auf SQLite 3.53.4, MariaDB 11.8.3, Oracle MySQL 8.4.13 und PostgreSQL 17.6 geprüft: jeweils 42 Anwendungstabellen, neue Server-Schreibvorgänge im Rückweg, unveränderte Quellarchive, private Dateien und aktivierte Recovery. Kopierengine zusätzlich mit 14 Fällen pro realer Serverauswahl geprüft. Wiki, eindeutige OpenAPI-Operationen, Locale-Check, Typen und Biome bestanden; Staged-Scanner ohne Fehler, ein Hinweis zur terminierenden Batch-Schleife.

## [2026-11-06] fix | Traffic-Settings CI und echte MariaDB-Prüfung

- Command: CI nach Veröffentlichung der Traffic-Einstellungen prüfen und Fehler beheben.
- Type: fix
- Areas affected: Fehler-Typisierung und isolierte MariaDB-Testfixtures
- Files changed: Flow-Einstellungsdienst, drei MariaDB-Fixtures und Konfigurationsdokumentation
- Wiki pages updated: Log
- New wiki pages: keine
- New TODOs: keine
- New bugs: TypeScript kannte den Rollback-Marker nicht; ein vollständiges Schema-Fixture kopierte den neuen Migrationshelfer nicht. Zwei lokale Fixtures verloren das nicht aufzählbare Treiberpasswort beim Kopieren der Konfiguration.
- New decisions: keine Produktänderung; dieselben Prüfungen laufen gegen den isolierten echten MariaDB-Server.
- Open questions: neue CI-Läufe nach Push prüfen.
- Next steps: Datenbank-Ersteinrichtung und Providerwechsel fortsetzen.
- Verification: Alle sieben MariaDB-Dateien mit 31 Tests bestanden; Backend-TypeScript-Prüfung bestanden. Keine Produktionsdatenbank verwendet.

## [2026-11-06] feature | Traffic-Einstellungen in der Oberfläche

- Command: Traffic Flow und Live-Modus standardmäßig aktivieren; Anzeige und Client-Privatsphäre im Einstellungsmenü steuern.
- Type: feature
- Areas affected: persistente Einstellungen, Nginx-Aktivierung, Collector, Analytics und Settings-Oberfläche
- Files changed: Backend-Einstellungsdienst und Migration, Startpfade, Flow-Pipeline, Frontend-Settings, deutsche/englische Texte, Tests und Analytics-Dokumentation
- Wiki pages updated: Analytics-Referenz, aktueller Projektzustand, Changelog und Log
- New wiki pages: keine
- New TODOs: keine
- New bugs: isolierte Start- und Migrationsfixtures benötigten die neue Einstellungsinitialisierung.
- New decisions: Flow und gewünschter Live-Modus standardmäßig an; anonyme Netze bleiben Datenschutzstandard. Einzeladressen und ausgeblendete Client-Identität sind ausdrücklich wählbar. Bestehende ENV-Präferenzen werden einmal importiert; danach ist die Datenbank maßgeblich.
- Open questions: Datenbank-Ersteinrichtung und geprüfter Providerwechsel werden auf Nutzerwunsch anschließend im selben PR umgesetzt.
- Next steps: Traffic-Phase veröffentlichen, danach DB-unabhängigen Bootstrap und verlustfreie Migration implementieren und isoliert prüfen.
- Verification: Backend 2.705 bestanden/56 übersprungen; Frontend 1.010 bestanden; drei Chromium-Fälle, TypeScript und Produktionsbuild bestanden. CSS 16.531/16.600 Byte; JavaScript 1.188.007/1.290.000 Byte. Native Capability-Prüfung im Produktionsimage als UID 1000 erfolgreich. Aktivierungs-/Rollback-Tests einschließlich mehr als 100 Hosts und fehlendem Modul bestanden.

## [2026-11-06] fix | CSS-Budget des Traffic-Flows einhalten

- Command: PR abschließen und tatsächliche CI-Ergebnisse prüfen.
- Type: fix
- Areas affected: Flow-Animation, Layout-Styles, CI-Bundle-Budget
- Files changed: TrafficFlowRate, TrafficFlowRows, UI- und Chromium-Tests; separates Flow-CSS entfernt
- Wiki pages updated: Log
- New wiki pages: keine
- New TODOs: keine
- New bugs: CI meldete 16.755 komprimierte CSS-Bytes bei Budget 16.600.
- New decisions: Native SVG-Bewegung statt separatem Stylesheet; Reduced-Motion-Wechsel über React-Mediensubscription, unveränderte Budgetgrenzen.
- Open questions: keine Produktfrage; neue CI-Läufe nach Push abwarten.
- Next steps: CI bis zum tatsächlichen Endstand prüfen.
- Verification: CSS-Budget 16.531/16.600 Byte, JavaScript gesamt 1.185.356/1.290.000 Byte; 18 UI-Tests und zwei Chromium-Fälle einschließlich dynamischem Reduced-Motion bestanden; TypeScript und Produktionsbuild bestanden. Layout und Messwahrheit unverändert.

## [2026-11-05] fix | Traffic-Flow Bootstrap, Identität und Messdiagnostik

- Command: Bare-Metal-Rückmeldung zu unbekannten Raten und doppelten Zielen bearbeiten.
- Type: fix
- Areas affected: Analytics-Collector, Live-Raten, Client-Privatsphäre und Flussoberfläche
- Files changed: Backend-Flow-Pipeline, Frontend-Flow-Darstellung, deutsche/englische Texte, Regressionstests und Analytics-Dokumentation
- Wiki pages updated: Analytics-Referenz, aktueller Projektzustand, Changelog und Log
- New wiki pages: keine
- New TODOs: keine
- New bugs: Fünf-Sekunden-Bootstrap übersah kurze native Beobachtungen; Mindestintervall verwarf kurze Transfers.
- New decisions: Einzeladressen nur mit explizitem Opt-in; numerische Ziele ohne DNS-Vermutungen zusammenführen.
- Open questions: Tatsächliche Betreiberinstallation muss native Modul-/Konfigurationskette bestätigen.
- Next steps: Draft-PR aktualisieren; tatsächliche Bare-Metal-Konfiguration anhand der Diagnose prüfen.
- Verification: Abschließende Gesamtläufe: Backend 2.681 bestanden/56 übersprungen, Frontend 1.003 bestanden; TypeScript und Produktionsbuild bestanden. Zunächst zwei PostgreSQL-Timeouts unter paralleler Last, anschließend beide isoliert und im Gesamtlauf ohne Änderung grün. 35 gezielte Backend-Tests, 18 UI-Tests und zwei Chromium-Fälle bestanden; tatsächlicher Nginx→Collector-Transfer mit exakten Intervallraten bestanden. Wiki, Biome, Staged-Scanner und Diff-Prüfung bestanden.

## [2026-11-05] validation | Finales Produktionsimage und vollständige App-Prüfung

- Command: Finale Produktionsmessung und vollständige Prüfungen dokumentieren.
- Type: validation
- Areas affected: Traffic-Flow-Abnahme und Messdokumentation
- Files changed: Analytics-Dokumentation und Wiki-Messbelege
- Wiki pages updated: Analytics-Referenz, Messentscheidung und Log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine bestätigten
- New decisions: keine Produktänderung; finale Produktionsbelege ersetzen frühere Zwischenstände.
- Open questions: Veröffentlichung der abhängigen Draft-PRs
- Next steps: Draft-PRs prüfen; kein Merge oder Deployment.
- Verification: Produktionsimage `328e794ef29f9166c27677c26f05ba630516ba923b6ef622eb8d88d11800b0d7` bestand Modul-Gate, 694 Runtime-Samples, 28 Protokoll-Samples und sieben HTTP/3-Fälle (2.417 UDP-Zeilen; 90 verworfene/549 verzögerte Datagramme, Kapazität/Reload). Echter Produktionscapture→App-Test bestanden: 555 Requests, 869 exakte Intervalle, 52 aktive Download-/14 Uploadintervalle, Maskierung. Backend vollständig: 2.674 bestanden/56 übersprungen. Frontend vollständig im unveränderten Wiederholungslauf: 998 bestanden; TypeScript und Produktionsbuild bestanden. Ein anfänglicher Router-Testtimeout unter paralleler Last bestand isoliert und im vollständigen Wiederholungslauf ohne Code- oder Timeoutänderung.

## [2026-11-05] feature | HTTP/3-ACK-/Streamraten angebunden

- Command: Verbleibendes HTTP/3 nativ messen und unabhängig in der App validieren.
- Type: feature
- Areas affected: Flow-Collector, Qualitätssemantik, UI-Komponenten und Dokumentation
- Files changed: H3-Gate, Qualitätsgruppen, exakte Tooltips, Captureprüfung und Tests
- Wiki pages updated: Analytics/API, Messentscheidung, Aufgaben, Projektstand, Changelog und Log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine bestätigten App-Fehler
- New decisions: Eindeutige ACK-Bytes versus konsumierte Streambytes; inkompatible Summen bleiben unbekannt, kompatible Komponenten expandierbar.
- Open questions: Veröffentlichung abhängiger Nginx-Basis und weitere Upstream-Protokolle
- Next steps: Draft-PRs prüfen, kein Merge oder Deployment.
- Verification: Native QUIC-Suite mit Verlust/ACK-Verzögerung/Reset/Disconnect/Churn bestanden; echter Capture→App-Test: 295 Requests, 63 exakte Intervalle, 45 aktive Download-/13 Uploadintervalle und Maskierung. App-Tests, Chromium und Typecheck bestanden.

## [2026-11-05] feature | HTTP/2-Streams und WebSockets angebunden

- Command: Verbleibende Protokolle nativ messen und integrieren.
- Type: feature
- Areas affected: Flow-Collector, Hosttemplate, UI-Semantik und Tests
- Files changed: Protokollvalidierung, Templateplatzierung, Tests und Dokumentation
- Wiki pages updated: Messentscheidung, Analytics, Aufgaben, Projektstand, Log und Changelog
- New wiki pages: keine
- New TODOs: keine; HTTP/3 bleibt offen
- New bugs: Directive war im Anubis-Zweig statt Standardserver; durch echten Rendertest gefunden und korrigiert.
- New decisions: HTTP/2 zählt pro Stream; WebSockets zählen Handshake und Frame-Transportbytes.
- Open questions: HTTP/3-QUIC-Abrechnung
- Next steps: Abhängige Draft-PRs prüfen, kein Merge oder Deployment.
- Verification: Native Suite belegt zwei Hosts auf derselben HTTP/2-Verbindung und 196.608 WebSocket-Payloadbytes je Richtung während offener Verbindung. App-Tests prüfen Isolation, unbekanntes HTTP/3 und beide Opt-in-Flags.

## [2026-11-05] feature | Native HTTP/1-Live-Raten integriert

- Command: Tatsächliche Live-Kantenraten einschließlich laufender Transfers implementieren.
- Type: feature
- Areas affected: Analytics-Collector, Nginx-Template, API, UI und Dokumentation
- Files changed: traffic-flow-live, TrafficFlowRate, Konfiguration, Tests und nativer Messprobe
- Wiki pages updated: Analytics-Referenz/API, Messentscheidung, Aufgaben, Projektstand, Changelog, Log
- New wiki pages: keine
- New TODOs: keine; T-028 bleibt für weitere Protokolle offen
- New bugs: keine bestätigten
- New decisions: HTTP/1-Transportbytes werden als Intervallraten gezeigt; fehlende Protokollabdeckung bleibt unbekannt.
- Open questions: HTTP/2, HTTP/3 und Upgrades sowie Veröffentlichung der abhängigen Nginx-Basis
- Next steps: Draft-PRs prüfen; kein Merge oder Deployment.
- Verification: Echte Modul→UDP→App-Probe bestanden: aktive Download-/Uploadraten, exakte Zählerdifferenzen und Maskierung. Native Suite prüft HTTPS, Retries, Keepalive, Abbrüche und Reloads. Automatisierte App-Tests und Build separat im PR dokumentiert.

## [2026-11-05] research | Laufende Transfermessung mit Lua geprüft

- Command: Echte Live-Kantenraten weiter untersuchen und nachweisen.
- Type: research
- Areas affected: Nginx-Messquelle und Traffic-Flow-Abnahme
- Files changed: scripts/benchmarks/traffic-flow-live-measurement.mjs und Messdokumentation
- Wiki pages updated: decisions/2026-11-05-traffic-flow-messgrenzen, reference/module/analytics, log, changelog
- New wiki pages: keine
- New TODOs: keine; T-028 bleibt offen
- New bugs: keine Produktänderung
- New decisions: Lua-Bodyfilter-Bytes sind keine tatsächlichen Downstream-Raten; native Instrumentation benötigt den dokumentierten Lebenszyklusvertrag.
- Open questions: Native Messquelle sowie HTTP/2-/HTTP/3-Zuordnung noch nicht implementiert.
- Next steps: Instrumentation in der getrennten Nginx-Basis implementieren und protokollweise messen; keine erfundenen Raten in der Vorschau.
- Verification: Reproduzierbarer Lua-Test mit ShieldPM Nginx 1.31.6 bestanden: laufender 1-MiB-Transfer, 65.411 empfangene Body-Bytes gegenüber 106.368 bereits vom Bodyfilter verarbeiteten Bytes; Timer-Zugriff auf Requestvariablen abgelehnt. Mengen sind timingabhängig. Wiki-Prüfung bestanden. Kein Merge oder Deployment.

## [2026-11-05] feature | Experimentelle Traffic-Flow-Vorschau

- Command: Live Traffic Flow implementieren, Branch pushen und englischen Draft-PR gegen develop erstellen.
- Type: feature
- Areas affected: Analytics, Nginx-Konfiguration, API, Frontend, Tests und Dokumentation
- Files changed: Traffic-Flow-Collector, Snapshot-API, Nginx-Logformat, Analytics-Panel, Tests und Messskript
- Wiki pages updated: reference/module/analytics, reference/api/nginx-analytics, current-project-state, tasks, index, changelog, decisions/README, log
- New wiki pages: decisions/2026-11-05-traffic-flow-messgrenzen.md
- New TODOs: T-028 echte Kantenraten für laufende Transfers
- New bugs: keine bestätigten offenen aus dieser Änderung
- New decisions: Abschlussbeobachtungen und konfigurierte Topologie bleiben ausdrücklich von unbekannten aktuellen Raten getrennt.
- Open questions: echte sekündliche Kantenraten, Glättung und Ratenskala bleiben unerfüllt; Instrumentation der separaten Nginx-Basis erforderlich.
- Next steps: Draft-PR prüfen; T-028 getrennt mit laufenden Transfers validieren. Kein Merge oder Deployment.
- Verification: Backend 274 Dateien bestanden, 9 übersprungen; 2657 Tests bestanden, 56 übersprungen. Frontend 223 Dateien und 990 Tests bestanden. Backend-Typecheck und Frontend-Build bestanden. Chromium-Smoke: 1 Test bestanden, einschließlich Pause/Fortsetzen, Fehler, veraltete Daten und schmale Ansicht. Echte Nginx-Messprüfung: 131072 Body-Bytes erst nach Abschluss, keine Beobachtung während des Transfers. Locale-Check bestanden mit fehlenden Übersetzungswarnungen außerhalb Englisch. Lokaler synthetischer Benchmark: 100000 Eingaben in 970,74 ms, maximal 1000 Einträge; Snapshot mit 100 Hosts in 13,83 ms und 216047 Bytes. Kein Nachweis für Produktions-Overhead oder echte Live-Raten.

## [2026-11-05] chore | T-019 Triage und 16 Sofortfixes

- Command: „T-019 mach das“.
- Type: chore
- Areas affected: Backend-Code, Wiki, Aufgabenboard
- Files changed: `token.js`, `ai/providers.js`, `auth-cookies.js`, `demo.js`,
  `access-list.js`, `analytics.js`, `2fa.js`, `tokens.js`, `certificates.js`,
  `gitops.js`, `prompt.js`; Triage-Seite und Aufgaben
- Wiki pages updated: analyses/2026-11-05-warnungs-triage (neu), analyses/README,
  index, tasks, changelog, current-project-state, log
- New wiki pages: `analyses/2026-11-05-warnungs-triage.md`
- New TODOs: T-020 bis T-027
- New bugs: keine
- New decisions: Triage nach Bereich und Schwere statt Einzelfix aller 350
- Open questions: unverändert (T-007, T-017)
- Next steps: T-020 (Sicherheit) und T-021 (CI) zuerst
- Verification: 355 Einträge klassifiziert; 16 Sofortfixes; `tsc --noEmit` grün;
  48 Tests in fünf Dateien grün; Wiki-Werkzeug PASS.

## [2026-11-05] audit | Vollständiger Datei-Audit und Behebung der 22 Fehler

- Command: „jede einzeln prüfen bitte mit mehreren Agents“.
- Type: audit
- Areas affected: gesamtes Repository, Wiki, CI-Konfiguration, OpenAPI-Schemas
- Files changed: `wiki-check.mjs`, `executor.js`, fünf Schema-Dateien,
  `docs/wiki/*` (3), `locale/README.md`, `.cursorrules`, `AGENTS.md`,
  `GEMINI.md`, `spellcheck.yml`, `renovate.json`, `frontend/package.json`,
  `.gitignore`, Fixtures-README, mehrere Wiki-Seiten
- Wiki pages updated: analyses (neu), index, analyses/README, tasks, changelog,
  log, contradictions, current-project-state, reference/api/schemas,
  reference/architektur/datenfluss, reference/entwicklung/feature-…,
  reference/module/2fa-service, certbot, ip-firewall, reference/ui/i18n
- New wiki pages: `analyses/2026-11-05-datei-audit.md`
- New TODOs: T-019 (350 Warnungen triagieren)
- New bugs: keine offenen aus den 22 Fehlern; ein Fehlalarm bestätigt
- New decisions: keine
- Open questions: unverändert (T-007, T-017)
- Next steps: T-019 priorisieren; T-007/T-017 auf laufender Instanz
- Verification: 173 Agents, 2.066/2.066 Dateien, 0 unvollständige Batches;
  Wiki-Werkzeug PASS; Markdown-Links 1.321/1.321; OpenAPI 120 Pfade,
  169 Operationen, 168 IDs, keine fehlenden Refs; `tsc --noEmit` Backend grün;
  61 Schema-/IP-Ranges-/Token-Tests grün.

## [2026-11-04] feature | Backlog abgearbeitet: Authentik, Fastly, Advanced Model, Tokens, Tabelle

- Command: „Alles bearbeiten außer das du nicht kannst“.
- Type: feature
- Areas affected: `backend/internal`, `backend/lib`, `backend/models`,
  `frontend/src/pages/Users`, `scripts/install.sh`, Wiki
- Files changed: `ip_ranges.js`, `ip-ranges.spec.js`, `token-scope.js` (neu),
  `token-scope-compat.spec.js` (neu), `token.js`, `Users/Table.tsx`,
  `install.sh`, `openappsec-advanced-model.spec.js` (neu), Dokumentationsseiten
- Wiki pages updated: tasks, questions/open-questions, reference/offene-fragen,
  reference/module/oauth2-proxy, reference/module/ip-ranges,
  architecture/overview, current-project-state, coverage, changelog, log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: Akamai wird mangels stabiler öffentlicher Liste nicht geladen
- Open questions: fünf Backlog-Punkte geschlossen; T-017 für die Live-Prüfung
  des Advanced-Modells ergänzt
- Next steps: T-007 und T-017 auf einer laufenden Instanz; Routinen beim
  nächsten Auslöser
- Verification: 26 gezielte Tests in vier Dateien grün (nach Anpassung der
  Fastly-Mocks); `node --check` für alle geänderten JS-Dateien; `install.sh`
  mit `bash -n` auf LF-Kopie; Policy-YAML unverändert valide; Wiki-Werkzeug PASS.

## [2026-11-04] audit | Abschlussprüfung aller geänderten Dateien

- Command: „sind wir nun komplett fertig, checke nochmals jeden file ganz genau“.
- Type: audit
- Areas affected: `backend/schema`, Wiki (Daten, Architektur, Aufgaben, Graph)
- Files changed: `swagger.json` (sechs Tags), sechs DDNS-Pfaddateien
  (Operation-IDs), `migrations.md`, `architecture/overview.md`, `tasks.md`,
  `wiki-graph.html`, `changelog.md`, `log.md`
- Wiki pages updated: data/migrations, architecture/overview, tasks, changelog,
  log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine
- Open questions: zwei veraltete Einträge geschlossen (SQLite, Unix-Socket)
- Next steps: T-007 auf einer laufenden Instanz; Routinen beim nächsten Auslöser
- Verification: 148 Wiki-Dateien (141 Markdown); Wiki-Werkzeug PASS; Prettier
  PASS; OpenAPI 120 Pfade, 169 Operationen, 168 eindeutige IDs, 26 Tags, keine
  fehlenden `$ref`s; 15 YAML-Dateien valide; `node --check` für alle geänderten
  JS-Dateien; `install.sh` und OpenAppSec-Policy gültig; Lockfiles mit
  `--frozen-lockfile`; 11 gezielte Tests grün; CodeQL 0 und Dependabot 0 offene
  Alarme; keine Konfliktmarker, keine Leerdateien, keine Secrets im Repository.

## [2026-11-04] security | CodeQL-Funde im Wiki-Werkzeug und Graphen behoben

- Command: CodeQL-Ansicht mit vier offenen Funden auf `develop`.
- Type: security
- Areas affected: `llm-wiki/tools/wiki-check.mjs`, `.github/codeql`
- Files changed: `wiki-check.mjs` (Scanner statt Einzel-Regex),
  `codeql-config.yml` (`paths-ignore` für den generierten Graphen)
- Wiki pages updated: tasks, security/overview, changelog, log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: generierte Vendor-Artefakte werden nicht mitgescannt
- Open questions: unverändert (T-007)
- Next steps: CodeQL-Lauf auf `develop` beobachten; Alarme sollten schließen
- Verification: `node --check` und `node llm-wiki/tools/wiki-check.mjs` → PASS;
  Scanner-Verhalten für Tags, verschachtelte Klammern und mehrzeilige Kommentare
  geprüft; CodeQL-YAML mit PyYAML geparst.

## [2026-11-04] chore | Abhängigkeits-PR #159 geschlossen, #160 erstellt

- Command: „mach den alten zu und erstell ein neuen“.
- Type: chore
- Areas affected: GitHub-PR `#159`/`#160`, Workflow `npm-updates.yml`
- Files changed: keine im Repository; PR #160 ändert Abhängigkeiten,
  Lockfiles und `THIRD-PARTY-NOTICES.md`
- Wiki pages updated: current-project-state, log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine
- Open questions: unverändert (T-007)
- Next steps: #160 reviewen und mergen; danach läuft der tägliche Updater weiter
- Verification: PR #159 mit Begründung geschlossen und Branch gelöscht;
  Workflow-Lauf `41904085825` erfolgreich, PR #160 aus `update-all-deps`
  erstellt; alle 21 Prüfungen sind grün.

## [2026-11-04] security | Dependabot-Alarm minimatch geschlossen

- Command: Fortsetzung des Internet-Audits.
- Type: security
- Areas affected: `backend/package.json`, `backend/yarn.lock`, `backend/test/ci`
- Files changed: `backend/package.json` (`archiver/**/minimatch` 11.0.4),
  `backend/yarn.lock`, `dependabot-security-resolutions.spec.js`,
  `npm-package-constraints.spec.js`
- Wiki pages updated: security/overview, tasks, current-project-state, changelog,
  log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine
- Open questions: unverändert (T-007)
- Next steps: PR #159 prüfen/mergen; Patch-Updates dem täglichen Updater überlassen
- Verification: Advisory `minimatch >= 7.0.0, < 11.0.1`, feste Version 11.0.1;
  Lockfile auf 11.0.4; `yarn install --frozen-lockfile` besteht; 11 Tests in
  vier CI-Specs grün (Security-Resolutions, Package-Constraints,
  Archiver-ESM, OpenAppSec-Policy).

## [2026-11-04] security | Dependabot-Alarme qs und seroval geschlossen

- Command: „Aber nochmals komplett code mit internet checken ob noch was
  angepasst werden muss etc.“
- Type: security
- Areas affected: `backend/package.json`, `backend/yarn.lock`,
  `frontend/yarn.lock`, `backend/test/ci`
- Files changed: `backend/package.json` (qs-Resolution 6.16.1),
  `backend/yarn.lock`, `frontend/yarn.lock` (seroval 1.6.11),
  `dependabot-security-resolutions.spec.js` (CRLF-Normalisierung),
  `npm-package-constraints.spec.js` (erwarteter qs-Pin)
- Wiki pages updated: security/overview, reference/module/openappsec,
  reference/offene-fragen, tasks, changelog, log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine; v1beta1 bleibt maßgeblich, v1beta2 ist laut Doku Beta
- Open questions: T-007 unverändert; PR #159 bleibt offen
- Next steps: PR #159 prüfen/mergen; direkte Patch-Updates beim nächsten
  Updater-Lauf
- Verification: `yarn install --frozen-lockfile` für Backend und Frontend;
  `vitest run` für `openappsec-local-policy`, `dependabot-security-resolutions`
  und `npm-package-constraints` (9 Tests grün); Lockfile zeigt `qs@6.16.1` und
  `seroval@1.6.11`; Dependabot-API vor der Änderung: drei offene moderate
  Alarme (qs, seroval ×2).

## [2026-11-04] chore | Wiki-Prüfung in CI und portabler OpenAppSec-Test

- Command: „nochmals komplett checken ob noch was gemacht werden muss“.
- Type: chore
- Areas affected: `.github/workflows`, `backend/test/ci`, Wiki (Coverage,
  Infrastruktur, Zustand, Aufgaben)
- Files changed: `lint-and-format.yml`, `openappsec-local-policy.spec.js`,
  `coverage.md`, `infrastructure/build-and-release.md`,
  `current-project-state.md`, `tasks.md`, `changelog.md`, `log.md`,
  `llm-wiki/README.md`
- Wiki pages updated: coverage, infrastructure/build-and-release,
  current-project-state, tasks, changelog, log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine (gefundene Lücke direkt geschlossen)
- New decisions: keine
- Open questions: unverändert; T-007 bleibt extern blockiert
- Next steps: T-007 auf einer laufenden Instanz; Routinen beim nächsten Auslöser
- Verification: `node llm-wiki/tools/wiki-check.mjs` → PASS; Regex-Match nach
  CRLF-Normalisierung geprüft (vorher auf Windows-Checkout falsch); Workflow-YAML
  mit PyYAML geparst; `node --check` für den Test; Prettier `--check` ohne
  Abweichung; CI-Lauf `41894222573` für `1b5acadd` grün, inklusive Schritt
  „Check internal LLM wiki“, Backend-Tests und Frontend-Build.

## [2026-11-04] verification | OpenAppSec-Policy gegen v1beta1 validiert

- Command: „Komplett machen“ (Rest abschließen).
- Type: verification
- Areas affected: `scripts/install.sh`, OpenAppSec-Policy, Aufgaben-Board
- Files changed: `backend/test/ci/openappsec-local-policy.spec.js` (neu),
  `tasks.md`, `current-project-state`, `questions`, `changelog`, `log`
- Wiki pages updated: tasks, current-project-state, questions, changelog, log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine
- Open questions: OpenAppSec-Zeile auf T-007 umgestellt
- Next steps: T-007 auf einer laufenden Instanz; M-001–M-003 beim nächsten Auslöser
- Verification: Policy-YAML gegen das veröffentlichte v1beta1-Schema mit
  `jsonschema` validiert („POLICY VALID“); Referenzen
  `shieldpm-default-practice`/`shieldpm-log-trigger` vorhanden; Regressionstest
  angelegt und `node --check` OK; `install.sh` mit `bash -n` auf LF-Kopie geprüft.

## [2026-11-04] feature | T-004, T-005-Vorbereitung und M-001–M-004

- Command: „Mach den rest komplett fertig“.
- Type: feature
- Areas affected: `backend/schema`, `scripts/install.sh`, Wiki (Fragen, Glossar,
  Aufgaben, Coverage)
- Files changed: `backend/schema/swagger.json`, 22 neue Pfad-JSONs,
  `scripts/install.sh`, `reference/projekt/begriffe.md`, `reference/index.md`,
  kuratierte Seiten (api, glossary, questions, tasks, coverage, changelog, log)
- Wiki pages updated: `api/overview`, `api/schemas`, `glossary`, `questions`,
  `tasks`, `coverage`, `changelog`, `log`, `current-project-state`,
  `reference/index`, `reference/projekt/begriffe`
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine
- Open questions: Triage abgeschlossen; beantwortete Fragen ausgelagert
- Next steps: T-005 (Live-Beleg); M-001/M-002/M-003 beim nächsten Auslöser
- Verification: `node llm-wiki/tools/wiki-check.mjs` → PASS; `swagger.json`
  geparst (120 Pfade, 162 eindeutige Operation-IDs, keine fehlenden `$ref`s);
  Policy-YAML mit PyYAML geparst (Referenzen `shieldpm-default-practice` und
  `shieldpm-log-trigger`); `install.sh` mit `bash -n` auf LF-Kopie geprüft;
  Graph neu erzeugt.

## [2026-11-04] release | Wiki-Migration committet

- Command: „Mach“ (Commit-Freigabe).
- Type: release
- Areas affected: gesamtes Repository
- Files changed: Commit `443d764f` (159 Dateien: 109 Löschungen, 11 geänderte
  Dateien, `llm-wiki/` neu, Renames erkannt)
- Wiki pages updated: `current-project-state`, `coverage`, `changelog`, `log`
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine
- Open questions: keine
- Next steps: T-004, T-005; M-001 bis M-004
- Verification: `git status --short` leer; `git log -1` = `443d764f`;
  `node llm-wiki/tools/wiki-check.mjs` → PASS.

## [2026-11-04] docs | T-001 und T-002 umgesetzt

- Command: „Mach“ auf die Empfehlung, die beiden Doku-Widersprüche zu beheben.
- Type: docs
- Areas affected: `AGENTS.md`, `.cursorrules`, Widerspruchsseiten, Aufgaben
- Files changed: `AGENTS.md`, `.cursorrules`, 2 Widerspruchsseiten, `tasks.md`,
  `index`, `current-project-state`, `changelog`, `log`
- Wiki pages updated: contradictions (2 + Index), tasks, current-project-state,
  changelog, log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine
- Open questions: keine
- Next steps: T-004, T-005; M-001 bis M-004
- Verification: `grep -i "sqlite in dev only" AGENTS.md` → keine Treffer;
  `grep -in "debounc" .cursorrules` → nur Docker-Discovery; beide
  Widerspruchsseiten auf `superseded`; `node llm-wiki/tools/wiki-check.mjs` → PASS.

## [2026-11-04] lint | Vierte Prüfrunde mit achtzehn Gutachtern

- Command: „nochmals komplett mit 18 Sub-Agenten“.
- Type: lint
- Areas affected: alle kuratierten Seiten, Tiefendoku, Prüfwerkzeug, Wiki-Graph
- Files changed: 24 kuratierte Seiten, 2 Referenzseiten, `wiki-check.mjs`,
  `reference/wiki-graph.html`, `agent.md`
- Wiki pages updated: overview, index, current-project-state, tasks, log,
  changelog, glossary, analyses/README, architecture (5), backend, api (2),
  data (2), frontend, infrastructure (3), modules, testing, contradictions (2),
  questions, decisions/adr-template
- New wiki pages: keine
- New TODOs: keine (bestehende präzisiert)
- New bugs: keine bestätigten; `/api`-Routing, Timer-Guard, Stream-Hosts,
  Model cardinalities, OpenAppSec-Verortung, Demo/Pagination, Datenpfad und
  Zählungen korrigiert
- New decisions: keine
- Open questions: Socket-Pfad, GeoIP-Reihenfolge und Release-Zyklus beantwortet
- Next steps: T-001, T-002, T-004, T-005; M-001 bis M-004
- Verification: `node llm-wiki/tools/wiki-check.mjs` → PASS (141 Markdown-Dateien,
  35 kuratiert, 103 reference, 147 Textassets, 148 Dateien); Selbsttest 25/25;
  `prettier --check` sauber; `node --check` OK; `docker.yml` YAML-gültig;
  Graph neu erzeugt (103 Knoten, 733 Kanten).
- Werkzeug: scannt jetzt auch `.txt/.yml/.sh/.mjs/.js` (außer `tools/`),
  validiert `<img src>`, unbenutzte Referenz-Links und Same-Page-Anker,
  prüft doppelte Metadaten, `.md`-unabhängige Manifeste und nur echte
  `paths:`-Einträge in `docker.yml`.

## [2026-11-04] lint | Dritte Prüfrunde mit acht Gutachtern

- Command: „nochmals komplett mit der Max anzahl an Sub-Agents“.
- Type: lint
- Areas affected: kuratierte Seiten, Tiefendoku, Prüfwerkzeug, `.github/workflows/docker.yml`
- Files changed: 20 kuratierte Seiten, 2 Referenzseiten, ein Analyse-JSON,
  `llm-wiki/tools/wiki-check.mjs`, `docker.yml`, `agent.md`, `current-project-state`
- Wiki pages updated: overview, backend, modules, testing, frontend, api (2), data (2),
  architecture (3), security, infrastructure (2), coverage, index, tasks, log,
  changelog, decisions, contradictions, questions, reference/wiki-pflege
- New wiki pages: `analyses/README.md`, `glossary.md`
- New TODOs: M-001 bis M-004 (Lint aufgeteilt)
- New bugs: keine bestätigten Fehler; falsche Modellbeziehungen, OpenAppSec-Verortung,
  Demo-/Pagination-/Schema-Aussagen, Zählungen und Beziehungen korrigiert
- New decisions: keine
- Open questions: Release-Zyklus beantwortet; übrige Fragen mit Prüfstelle
- Next steps: T-001, T-002, T-004, T-005; M-001 bis M-004
- Verification: `node llm-wiki/tools/wiki-check.mjs` → PASS (141 Markdown-Dateien,
  35 kuratiert, 103 reference, 147 Textassets, 148 Dateien inkl. Werkzeug); Werkzeug-Selbsttest mit 25 Fällen
  (private/public IPs, IPv6 ULA, E-Mail, interne Hostnamen, Build-Pfade, Secrets,
  Bearer, Credential-URL, HTML-/Referenz-Links, Anker, CRLF, Fenced-Metadaten,
  doppelter Status, Manifest-Präfix und -Ghost, Wikilink im Kommentar, Fence-Link,
  Dateiname) → alle erwartungsgemäß; `node --check` OK.
- Sicherheit: interne Sandbox-Pfade (Arbeitsbereich und Home-Verzeichnis der
  Prüfumgebung) aus dem Audit-JSON 2026-10 entfernt; Manifest nennt jetzt den
  Git-Blob.
- Behoben: tote `docker.yml`-Pfadfilter entfernt (T-003) und Prüfung 12 im Werkzeug
  ergänzt.

## [2026-11-04] lint | Zweite Prüfrunde: fünf Gutachter, Werkzeug gehärtet

- Command: „nochmals von mehreren Subagents prüfen lassen“.
- Type: lint
- Areas affected: kuratierte Seiten, Prüfwerkzeug, `agent.md`, Referenzebene
- Files changed: 18 kuratierte Seiten, `agent.md`, `llm-wiki/tools/wiki-check.mjs`,
  `llm-wiki/README.md`, drei Referenzseiten
- Wiki pages updated: modules, api/endpoints, security, infrastructure/runtime,
  testing, architecture (overview, nginx-engine, request-lifecycle), backend,
  frontend, data (overview), coverage, overview, questions, tasks, index, log,
  changelog, decisions/README, adr-template
- New wiki pages: keine
- New TODOs: keine (bestehende T-001 bis T-005 präzisiert)
- New bugs: keine bestätigten Fehler; falsche Modulbeschreibungen, Zählungen und
  Zeilenverweise korrigiert
- New decisions: keine
- Open questions: bereichsübergreifend zusammengeführt und mit Prüfstelle versehen;
  Python-CI-Frage beantwortet
- Next steps: T-001 bis T-005, M-001
- Verification: `node llm-wiki/tools/wiki-check.mjs` → PASS (139 Dateien);
  Werkzeug-Selbsttest mit 13 injizierten Fehlern (darunter private IP, E-Mail,
  Wikilink, Dateiname, Secret, Case-Mismatch, fehlende Kernseite, Raw-Waisen,
  gefencetes `## Zweck`) → alle erwartet erkannt; Geheimwert wird nicht ausgegeben;
  `node --check` für das Werkzeug OK.
- Hinweis: Referenzseiten behalten ihre übernommene Vorlage; das ist jetzt in
  Schema und ADR ausdrücklich festgehalten.

## [2026-11-04] lint | Fünf unabhängige Prüfungen, Befunde korrigiert

- Command: „nochmals von mehreren Subagents prüfen lassen“.
- Type: lint
- Areas affected: `llm-wiki/wiki` (kuratiert und reference), `llm-wiki/raw`,
  Prüfwerkzeug
- Files changed: 20 kuratierte Seiten, 6 reference-Seiten,
  `llm-wiki/tools/wiki-check.mjs` (neu), `llm-wiki/raw/README.md` (neu),
  `llm-wiki/raw/legacy-agent-md-2026-11-04.md` (neu), `AGENTS.md` (letzte Zeile)
- Wiki pages updated: architecture (overview, request-lifecycle, background-jobs,
  nginx-engine), api (overview, endpoints), data (overview, migrations),
  backend, frontend, testing, coverage, overview, current-project-state,
  contradictions (2 + Index), decisions (2), tasks, questions, index, log
- New wiki pages: `llm-wiki/tools/wiki-check.mjs`,
  `llm-wiki/raw/README.md`, `llm-wiki/raw/legacy-agent-md-2026-11-04.md`
- New TODOs: keine
- New bugs: keine bestätigten Fehler; falsche Aussagen und Zählungen korrigiert
- New decisions: keine; ADR präzisiert (reference als Quellschicht, raw-Inhalt)
- Open questions: keine neuen
- Next steps: T-001 bis T-005, M-001
- Verification: `node llm-wiki/tools/wiki-check.mjs` → PASS; Zählungen neu erhoben
  (53 internal, 34 routes, 33 modelldateien, 58 lib-Dateien, 91 Migrations, 286
  Testdateien davon 278 Tests, 219 Frontend-Tests, 13 Workflows, 14 Python-Tests,
  799 Frontend-Dateien, 3 Schema-Top-Level) und Zeilenverweise am Code nachgeprüft;
  `git status --short` unverändert im erwarteten Rahmen.
- Hinweis: Prüfwerkzeug und `raw/` entstanden in dieser Runde; die Verifikationen
  der früheren Einträge nutzten ein temporäres Skript und sind mit dem heutigen
  Werkzeug reproduzierbar.

## [2026-11-04] verification | PROMPT-Abgleich, Altpfad entfernt, Abdeckung dokumentiert

- Command: „das alte Wiki entfernen und nochmals komplett gegen PROMPT.md prüfen“.
- Type: verification
- Areas affected: `docs/wiki-intern` (bestätigt entfernt), `llm-wiki`, `tasks`
- Files changed: `llm-wiki/wiki/coverage.md` (neu), `llm-wiki/wiki/index.md`,
  `llm-wiki/README.md`, `llm-wiki/wiki/tasks.md`
- Wiki pages updated: `index`, `tasks`, Schema
- New wiki pages: [Abdeckung und Inventar](./coverage.md)
- New TODOs: keine; zwei „Hack“-Kommentare als Backlog-Kandidaten aufgenommen
- New bugs: keine
- New decisions: keine
- Open questions: keine neuen
- Next steps: T-001 bis T-005, M-001
- Verification: Prüfskript (damals temporär, nicht im Repo abgelegt; reproduzierbar
  mit `llm-wiki/tools/wiki-check.mjs`) → PASS (139 Markdown-Dateien:
  33 kuratiert, 103 reference, 1 Schema-README, 2 raw); `prettier --check` auf den
  kuratierten Seiten sauber;
  `python -c yaml.safe_load` für den Spellcheck-Workflow OK;
  `docs/wiki-intern` nicht mehr vorhanden; vollständiger TODO/FIXME/HACK-Scan
  durchgeführt.
- Hinweis: `llm-wiki/wiki/reference/` wurde bewusst nicht umformatiert; sie zählt
  bei der Duplikatprüfung als Quellschicht.

## [2026-11-04] docs | Altes Wiki nach `llm-wiki` migriert und Verweise umgestellt

- Command: Nutzerwunsch „das Neue in AGENTS/GEMINI etc. aufnehmen und das Alte
  ersetzen“.
- Type: docs
- Areas affected: `docs/wiki-intern`, `llm-wiki`, `AGENTS.md`, `GEMINI.md`,
  `.cursorrules`, `agent.md`, `README.md`, `docs/wiki/Development.md`,
  `scripts/wiki-graph.py`, `scripts/sync-verified-dependency-docs.js`,
  `backend/test/ci/sync-verified-dependency-docs.spec.js`, Spellcheck-Workflow
- Files changed: `docs/wiki-intern/**` (verschoben), `llm-wiki/**`,
  `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `agent.md`, `README.md`,
  `docs/wiki/Development.md`, `scripts/wiki-graph.py`,
  `scripts/sync-verified-dependency-docs.js`,
  `backend/test/ci/sync-verified-dependency-docs.spec.js`,
  `.github/workflows/spellcheck.yml`
- Wiki pages updated: `README.md`, `index`, `overview`, `current-project-state`,
  `tasks`, `decisions/*`, `reference/index`, `reference/wiki-pflege`
- New wiki pages: `llm-wiki/wiki/reference/**` (109 Dateien übernommen); das
  Raw-Archiv entstand erst in der Lint-Runde danach
- New TODOs: keine
- New bugs: keine
- New decisions: aktualisierte [Wiki-Struktur](./decisions/2026-11-04-wiki-struktur.md)
- Open questions: keine neuen
- Next steps: T-001 bis T-003; `python3 scripts/wiki-graph.py` neu laufen lassen
- Verification: Prüfskript (damals temporär, nicht im Repo abgelegt; reproduzierbar
  mit `llm-wiki/tools/wiki-check.mjs`) über `llm-wiki/**` (Links,
  Index, Struktur, Secrets, Redaktion) ohne Befund; `git status --short` zeigt nur
  die erwarteten Pfade.

## [2026-11-04] bootstrap | LLM-Wiki initialisiert

- Command: Nutzerauftrag „Mach das llm-wiki-init-PROMPT.md“; Intake nachgeholt
  (Projekt ShieldPM, Zweck aus README, Sichtbarkeit public, Sprache Deutsch,
  Umfang full filtered).
- Type: bootstrap
- Areas affected: gesamtes Repository, insbesondere `README.md`, `GEMINI.md`,
  `.cursorrules`, `backend/`, `frontend/`, `rootfs/`, `scripts/`, `docs/wiki-intern/`
- Files changed: `llm-wiki/**`, `AGENTS.md` (nur der markierte Block)
- Wiki pages updated: alle Seiten unter `llm-wiki/wiki/`
- New wiki pages: `index`, `overview`, `current-project-state`, `tasks`, `log`,
  `changelog`; `architecture/{overview,request-lifecycle,nginx-engine,host-lifecycle,background-jobs}`;
  `backend/overview`; `frontend/overview`; `api/{overview,endpoints,schemas}`;
  `data/{overview,migrations}`; `infrastructure/{runtime,build-and-release,configuration}`;
  `security/overview`; `testing/overview`; `modules/overview`;
  `decisions/{README,adr-template,2026-11-04-wiki-struktur,2026-10-27-entfernung-der-wasm-laufzeit}`;
  `questions/open-questions`; `contradictions/{README,2026-11-04-sqlite-in-produktion,2026-11-04-nginx-reload-debounce}`
- New TODOs: T-001, T-002, T-003, T-004, T-005, M-001
- New bugs: keine bestätigten Fehler; zwei Dokumentationswidersprüche und zwei
  tote CI-Pfadfilter festgehalten
- New decisions: [Wiki-Struktur](./decisions/2026-11-04-wiki-struktur.md),
  [Wasm-Entfernung](./decisions/2026-10-27-entfernung-der-wasm-laufzeit.md)
- Open questions: siehe [offene Fragen](./questions/open-questions.md)
- Next steps: T-001 bis T-003 entscheiden und umsetzen; M-001 nach etwa 20 Seiten
- Verification: Prüfskript (damals temporär, nicht im Repo abgelegt; reproduzierbar
  mit `llm-wiki/tools/wiki-check.mjs`) für Links, Index, Struktur,
  Secrets und Redaktion ohne Befund; `prettier --check` sauber; `git status --short`
  zeigt ausschließlich `llm-wiki/` und `AGENTS.md`.
- Hinweis Sichtbarkeit: `public` verlangt Redaktion. Die Seiten nennen keine
  internen IPs, Hostnamen, Domains oder Personendaten; Beispielwerte aus
  `compose.yaml`/`.env.example` wurden nicht übernommen.
