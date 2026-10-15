# ShieldPM — Gesamtprüfung vom 15. Oktober 2026

## Zweck und Prüfstand

Erneute Prüfung des aktuellen `develop`: Commit `32a3a9d5dde3182dfc10d3700366d531a7462fa3`, Tree `a4b0caecda7b77d39f6fa2a9680d89a325040bea`, Version 4.4.1. PR #152 ist gemergt; der signierte Merge wurde lokal SHA-identisch übernommen. Die Branchabfrage während der Abschlussprüfung bestätigt diesen Stand.

Die Inventur umfasst **1.822 versionierte Dateien**: 749 Backend-, 812 Frontend-, 35 Skript-, 32 Rootfs-, 15 Workflow-/GitHub-, 146 Dokumentations- und elf Scannerdateien sowie Rootdateien. Sechs unabhängige Reviews untersuchten Authentifizierung, Integrationen und Konfigurationskonsistenz, Datenbanken und Laufzeit, Frontend, Installation/Deployment sowie Tests und Scanner. Zentrale Funktionsketten und Randfälle wurden vertieft gelesen und mit isolierten Nachweisen geprüft; keine vollständige manuelle Lektüre jeder Dateizeile wird behauptet.

Der Ausgangsscan bestätigte **18 Defektgruppen**, davon **zwei mit hoher und 16 mit mittlerer Priorität**. Zehn ältere Produktbefunde bestanden auf dem geprüften Merge weiterhin; acht Gruppen wurden neu bestätigt. Die zehn älteren Punkte waren nicht Bestandteil des Testfixes PR #152. Der frühere Dockerlint-Fehler war durch diesen PR bereits behoben.

Nach der Freigabe zur Umsetzung korrigiert [PR #154](https://github.com/shedowe19/ShieldPM/pull/154) alle 18 Gruppen einschließlich Regressionen und ergänzender Verbesserungen. Die Version bleibt 4.4.1. Der PR führt Tests und Imageprüfungen aus; er veröffentlicht keine Images oder Releases und verändert keine Produktivinstallation. Die nachfolgenden ursprünglichen Befunde dokumentieren den historischen Ausgangszustand; den neuen Vertrag beschreibt die Umsetzungstabelle.

## Validierung des Ausgangsstands und Grenzen

| Prüfung                                                           | Ergebnis dieses Durchgangs                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lokales vollständiges Backend, Node 26 und unverändertes Lockfile | 2.160 bestanden, vier erwartete Skips, ein Timeout im PostgreSQL-Migrationstest; 230 Dateien bestanden, eine fehlgeschlagen, zwei übersprungen.                                                                                                               |
| Lokale Backend-Typprüfung                                         | Erfolgreich.                                                                                                                                                                                                                                                  |
| Vollständiges Biome auf Backend und Frontend                      | Exit 0; vorhandene Hinweise/Warnungen bleiben sichtbar.                                                                                                                                                                                                       |
| Lokale Infrastruktur                                              | 164 Tests abgeschlossen, davon 143 bestanden und 21 wegen fehlender lokaler Laufzeitumgebung übersprungen.                                                                                                                                                    |
| Frischer Shellcheck-/Infrastrukturjob vom 15. Oktober             | Shellcheck erfolgreich; 164 Tests mit zwei erwarteten CI-Skips.                                                                                                                                                                                               |
| Frischer vollständiger TScanner vom 15. Oktober                   | 73 Integrationstests bestanden; 678 gescannte Dateien; keine neuen Fehler, Baselinefehler, Advisories oder Scannerfehler; Scanner-Audit 0 Befunde bei 24 Paketen.                                                                                             |
| Lokale dependencyfreie Scanner-Regressionen                       | 28 bestanden; vollständiger lokaler Scanner mangels installierter Scannerpakete nicht ausgeführt.                                                                                                                                                             |
| Frischer Quality-Versuch 2 vom 15. Oktober                        | 2.160 Backendtests bestanden, vier Skips, ein 5-Sekunden-Timeout in `nginx-smoke-endpoints.spec.js`; Frontend, Build und Audits danach nicht gestartet.                                                                                                       |
| Frischer Browserlauf vom 15. Oktober                              | Sieben Chromium-Smokes bestanden.                                                                                                                                                                                                                             |
| Frischer MariaDB-Lauf                                             | Zwei Migrationssuiten mit zwei Tests am 15. Oktober bestanden.                                                                                                                                                                                                |
| Unveränderter weiterer Quality-Versuch                            | Versuch 5 am 15. Oktober erfolgreich: 2.161 Backendtests mit vier erwarteten Skips, 931 Frontendtests, Typen, Locales, Produktionsbuild und Bundlebudget bestanden. Backend-Audit 0/522, Frontend-Audit 0/628. Die vorherigen Timeoutnachweise bleiben offen. |
| Zusätzliche fachliche Tests                                       | 88 Integrationstests und 56 Laufzeit-/Daten-/Monitorprüfungen bestanden; fünf Domain-Transaktions-/Race-Kontrollen bestanden.                                                                                                                                 |
| Bereits vorhandene Merge-CI auf exakt diesem Commit               | Alle acht ursprünglichen Workflows erfolgreich; darunter Docker x86_64/ARM64 mit GeoIP-Doppelstart, UID-0-/UID-1000-Runtime-Smokes und Installer-/LXC-Artefakten. Diese Deployments wurden für den Scan nicht erneut ausgelöst.                               |

Der letzte unveränderte Quality-Versuch endete am 15. Oktober um 07:32:51 UTC erfolgreich. Gemessene gzip-Budgets: JavaScript gesamt 1.111.538/1.290.000 Byte, größter Chunk 106.549/299.000 Byte, CSS 16.325/16.600 Byte. Damit sind Frontendtests, Typen, Locales und Produktionsbuild frisch bestätigt. Ein erfolgreicher Retry korrigiert die zuvor reproduzierten Testzeitverträge nicht. Die beiden geplanten Dependency-Läufe vom 14./15. Oktober beendeten nur den Guard erfolgreich und übersprangen das Update wegen eines offenen Dependency-PRs; sie sind keine zusätzlichen Testdurchläufe. Der manuelle Update-Lauf nach dem Merge führte die Verifikation tatsächlich erfolgreich aus.

CI-Nachweise: [Quality](https://github.com/shedowe19/ShieldPM/actions/runs/38470454960), [TScanner](https://github.com/shedowe19/ShieldPM/actions/runs/38470454977), [Shellcheck/Infrastruktur](https://github.com/shedowe19/ShieldPM/actions/runs/38470455209), [ursprünglicher Docker-Mergelauf](https://github.com/shedowe19/ShieldPM/actions/runs/38470455250). Neue Versuche desselben Runs behalten dieselbe Run-URL. Frische Jobs: Scanner `116299600756`, Shellcheck `116299802206`, Browser `116300822106`, MariaDB `116301782558`; fehlgeschlagener Quality-Versuch `116299569458`, weiterer unveränderter Quality-Versuch `116302440432`. Die zuerst beobachtete Testfehlstelle bleibt auch bei späterem Erfolg dokumentiert.

Nachweise verwenden aktuelle Originalfunktionen sowie je nach Fall echte SQLite-/eingebettete PostgreSQL-Engines, temporäre Dateien, HTTP-/WebSocket-Verbindungen und kontrollierte äußere Abhängigkeiten. Es wurden keine fremden Systeme geprüft. Ein zusätzlicher vertiefender Sicherheitsprüfschritt wurde automatisch blockiert; dieser Schritt wird nicht als abgeschlossen ausgewiesen. Insbesondere bleibt eine weitergehende Prüfung der AI-Argumentvalidierung unbestätigt. Die bereits belegten Befunde wurden davon getrennt bewertet.

## Ausgangsbefunde mit hoher Priorität

### A01 — Globale mTLS-Zugangsdaten über gewöhnliche Zertifikatsrechte

**Bestehend, P1.** `backend/routes/nginx/certificates.js:150–169`, `backend/internal/pki.js:239–249,302–324`, `backend/templates/proxy_host.conf:184–190`.

Ein gewöhnlicher Benutzer mit eigener Sichtbarkeit und `certificates: manage` kann Client-Zertifikate der gemeinsamen internen CA ausstellen. Andere ausschließlich über diese CA geschützte Hosts binden diese Zertifikate nicht an Benutzer oder Zugriffsliste. Das überschreitet den Umfang einer eigenen Zertifikatsverwaltung.

Die aktuelle Probe verwendet die tatsächliche HTTP-Route, JWT/Access, SQLite und OpenSSL; das ausgestellte Testzertifikat besitzt eine gültige Client-Vertrauenskette zur gemeinsamen Test-CA. Kein fremder Live-Host wurde aufgerufen; zusätzliche unabhängige Authentifizierung bleibt wirksam. **Korrektur:** Globale Ausstellung auf Administratoren oder ein separates globales PKI-Recht begrenzen; benutzerbezogene Ausstellung benötigt ACL-Bindung oder getrennte Vertrauensanker.

### A02 — SSH-Zielserver wird vor der Anmeldung nicht verifiziert

**Neu, P1.** `backend/internal/terminal.js:170–182`.

Die SSH-Verbindung erhält entschlüsselte Zugangsdaten, aber weder einen gespeicherten Hostfingerprint noch einen `hostVerifier`. Bei manipuliertem Zielserver oder Netzwerkpfad ist damit keine vertrauenswürdige Identität des SSH-Gegenübers sichergestellt.

Der aktuelle Original-Verbindungsablauf akzeptierte in einer isolierten lokalen Probe einen neu erzeugten, unbekannten Server-Schlüssel und führte die Passwortanmeldung aus. Nur Hostdaten, Entschlüsselung und der interne Nginx-Handoff waren Fixtures. **Korrektur:** Bestätigten SHA-256-Fingerprint je Terminalziel speichern, strikt prüfen und einen ausdrücklichen Ablauf für erstmaliges Vertrauen und Schlüsselwechsel anbieten.

## Ausgangsbefunde mit mittlerer Priorität

### A03 — Legacy-ACL-Metadaten enthalten weiterhin SSO-Secrets in Hostantworten

**Bestehend, P2.** `backend/lib/host-response.js:23–33`.

Bei doppelt JSON-kodierten Legacy-Metadaten behandelt `_.omit()` einen String als nummerierte Zeichenfelder. Die Zeichen enthalten weiterhin das vollständige Secret. Die aktuelle echte Hostlistenroute lieferte einem Benutzer mit Hostleserecht und ausgeblendeten Access Lists ein rekonstruierbares synthetisches Secret; normale Objektmetadaten wurden korrekt redigiert. **Korrektur:** Dieselbe normalisierende ACL-Redaktion wie für direkte ACL-Antworten verwenden.

### A04 — Verspäteter Refresh kann die Cookie-Identität zurücksetzen

**Bestehend, P2.** `frontend/src/context/AuthContext.tsx:125–156,169–177`, `frontend/src/api/backend/refreshToken.ts:6–17`, `backend/routes/tokens.js:360–409`.

Die Generation schützt den JavaScript-Zustand, verhindert aber nicht die spätere Anwendung einer HTTP-Cookieantwort. Nach Impersonation kann die UI den Zielbenutzer anzeigen, während Folgeanfragen die vorherige Administratoridentität nutzen; nach Logout kann ein schon ausgestellter Access-Cookie erneut erscheinen.

Originale Auth-Callbacks, AuthStore, Cookiehelfer und JWT-Prüfung bestätigen dies bei kontrollierter Antwortreihenfolge. Cookiezustellung ist modelliert, kein vollständiger Browser-/HTTP-Rennentest; eine Rechteerhöhung eines unprivilegierten Nutzers wird nicht behauptet. **Korrektur:** Cookieverändernde Auth-Aufträge serialisieren und laufende Refreshes vor Identitätswechseln vollständig abschließen; die Identität eines Folgeaufrufs im Browser prüfen.

### A05 — ACL-Löschung entfernt nach Rollback weiter benötigte Auth-Dateien

**Bestehend, P2.** `backend/internal/access-list.js:475–488`, `backend/internal/nginx.js:538–539,584–596`.

Ein Host-Renderfehler stellt die alte Auth-Konfiguration wieder her. Die Löschung wertet den Bulk-Rückgabestatus nicht aus, entfernt trotzdem die referenzierte Passwortdatei und stoppt OAuth2. Originale Service-/Nginx-Pfade mit echten temporären Dateien bestätigen Erfolg trotz fehlender Auth-Abhängigkeiten. Ein Live-HTTP-Fehler wurde nicht ausgeführt. **Korrektur:** Fehler propagieren und DB-Wechsel, Aktivierung und Bereinigung mit vollständigem Rollback koordinieren.

### A06 — Docker-/GitOps-Aktionen umgehen die gemeinsame Nginx-Sperre

**Bestehend, P2.** `backend/internal/docker.js:251–252`, `backend/internal/gitops.js:1277–1293,1628`.

Ein abschließender Reload kann während einer gesperrten Konfigurationsänderung laufen. Beim GitOps-Pruning kann außerdem ein schon laufender Renderer nach der Löschung erneut eine aktive Listenerdatei schreiben. Die aktuellen Originalpfade bestätigen beide Fälle; beim Prune bleibt `is_deleted=1`, aber die aktive Datei erscheint erneut. **Korrektur:** Finalreloads einreihen und Pruning einschließlich DB-/Dateiänderung unter derselben Sperre ausführen.

### A07 — Git-Deploy wiederholt eine fehlgeschlagene erste Rootaktivierung nicht

**Bestehend, P2.** `backend/internal/git-deploy.js:231–246`.

`configure()` kann nach einer abgelehnten Nginx-Konfiguration mit `nginx_online: false` zurückkehren. Git-Deploy meldet dennoch Erfolg. Der bereits gespeicherte Zielroot verhindert beim nächsten Poll eine erneute Aktivierung. Aktuelle Originalfunktionen bestätigen zwei Erfolge, nur einen Generierungsversuch und den alten aktiven Root. **Korrektur:** Aktivierungsstatus auswerten und ausstehende Aktivierungen dauerhaft erneut versuchen.

### A08 — Analytics schreibt beim Shutdown den Folgepuffer nicht mehr

**Bestehend, P2.** `backend/internal/analytics.js:203–217,416–419`.

Ein laufender Flush hat seinen Snapshot bereits abgetrennt. Danach eintreffende Requests landen im Folgepuffer; `stop()` wartet lediglich auf den vorhandenen Flush. Die aktuelle Probe lässt nach abgeschlossenem Stop einen Detailrequest und ein Aggregat im Speicher zurück, ohne DB-Fehler. **Korrektur:** Eingabe stoppen, laufenden Flush abwarten und anschließend den verbleibenden Puffer schreiben.

### A09 — PostgreSQL-Monitore mit NULL-Fälligkeit können dauerhaft warten

**Bestehend, P2.** `backend/internal/proxy-host-monitor.js:741–755`.

PostgreSQL sortiert `next_check_at=NULL` bei der aktuellen aufsteigenden Abfrage zuletzt. Dauerhaft wieder fällige bestehende Hosts können alle begrenzten Batches belegen. Die originale Abfrage gegen echtes PGlite ließ den neuen Monitor 201 nach drei Scans und 300 Checks ungeprüft. **Korrektur:** NULL-Fälligkeiten ausdrücklich zuerst sortieren und den Vertrag auf allen Datenbankengines prüfen. Ohne anhaltenden Rückstau ist keine dauerhafte Starvation belegt.

### A10 — Updater verwechselt Zeilen innerhalb mehrzeiliger `.env`-Werte

**Bestehend, P2.** `rootfs/usr/local/bin/update-shieldpm:241–242,444–447`.

Der Installer erlaubt mehrzeilige Literalzuweisungen, der Updater sucht und ersetzt dagegen einzelne Zeilen. Aktuelle Originalfunktionen ändern dadurch ein gültiges mehrzeiliges Passwort bei der Anubis-Aktivierung oder klassifizieren eine vorhandene SQLite-Datenbank fälschlich als extern und lassen ihren Recovery-Snapshot aus. Beides endet mit Exit 0; echte temporäre SQLite-Datei und isolierte Dienstgrenzen wurden verwendet. **Korrektur:** Vollständige Literalzuweisungen einheitlich parsen und lesen/schreiben.

### A11 — Öffentliche Architektur-Tags werden vor den Smokes veröffentlicht

**Bestehend, P2.** `.github/workflows/docker.yml:175–208`.

Nicht-PR-Builds pushen öffentliche Architektur-Tags vor GeoIP-/Runtime-Smokes. Ein späterer Smoke-Fehler verhindert das gemeinsame Manifest, lässt das Architektur-Tag aber auf dem nicht erfolgreich geprüften Image stehen. Quellenreihenfolge und vorhandene Merge-Logs belegen den Ablauf; kein fehlerhaftes Image wurde zum Nachweis veröffentlicht. PRs sind nicht betroffen. **Korrektur:** Wie im manuellen Latest-Workflow Kandidaten testen und anschließend die getesteten Digests auf öffentliche Tags übertragen.

### A12 — Große Downloads blockieren Analytics-Detailbatches

**Neu, P2.** `backend/migrations/20251231000000_analytics_logs.js:9`, `backend/internal/analytics.js:273–285,352–355,428–437`.

`analytics_logs.bytes` verwendet weiterhin einen vorzeichenbehafteten 32-Bit-Integer. Ein regulärer Download über 2 GiB erzeugt auf PostgreSQL einen Überlauf: PostgreSQL lehnt den gesamten atomaren INSERT ab, sodass auch Nachbarrequests nicht gespeichert werden. Eine aktuelle Probe mit Originalmigrationen und Flush gegen PGlite speicherte nach zwei Versuchen null von drei Detailrequests; der unveränderte Batch blieb gepuffert. Aggregate waren korrekt. **Korrektur:** Additive BIGINT-Migration und robusten Werte-/Batchvertrag ergänzen. MySQL wurde dafür nicht separat gestartet.

### A13 — Offenes Terminal verhindert regulären Backend-Shutdown

**Neu, P2.** `backend/index.js:86–95`, `backend/internal/terminal.js:13–35,75–81`.

Analytics-/Relay-Bereinigung liegt im `server.close()`-Callback. Offene Terminal-WebSockets werden vorher nicht geschlossen und halten diesen Callback zurück. Original-Terminalinitialisierung, echter HTTP-Server und echte lokale WebSocket-Verbindung bestätigen: Cleanup wird erst nach Beendigung des WebSockets erreicht. SSH war kontrolliert simuliert. **Korrektur:** Expliziten Terminal-Stop, Ablehnung neuer Upgrades und begrenztes Schließen bestehender WebSocket-/SSH-Verbindungen vor dem finalen HTTP-Abschluss ergänzen. Der konkrete Terminalfall wurde für den Produktionsstart belegt.

### A14 — Gleichzeitige Host-Erstellung vergibt dieselbe Domain mehrfach

**Neu, P2.** `backend/internal/proxy-host.js:124–140,169–175`, `backend/migrations/20260222000000_normalize_domain_names.js:14–25`.

Belegungsprüfung und Speicherung erfolgen getrennt; der Domainindex ist nicht eindeutig. Zwei kontrolliert überlappende Aufrufe originaler Create-/Belegungsfunktionen mit echten SQLite-Modellen speichern dieselbe Domain für zwei aktive Hosts erfolgreich. Welcher Listener bei echtem Nginx gewinnt, wurde nicht ausgeführt. **Korrektur:** Aktive Domainreservierung atomar und typenübergreifend absichern; Soft-Delete und spätere Wiederverwendung berücksichtigen.

### A15 — Upload-Relay startet einen Origintransfer noch nach Stop

**Neu, P2.** `backend/internal/upload-relay.js:579–607,638–647,925–929`.

Ein laufender Finalizer wartet vor Registrierung seines AbortControllers auf die Hostauflösung. `stop()` kann daher keinen Controller abbrechen; nach Ende des Reads startet der Transfer trotzdem und hält Stop bis zur Antwort beziehungsweise zum bis zu zehnminütigen Timeout offen. Originalrelay, echte Chunkdateien und lokaler HTTP-Origin bestätigen den Ablauf. **Korrektur:** Stopzustand vor und nach asynchroner Vorbereitung prüfen, Controller früh registrieren und neue Queuearbeit sperren. Betroffen ist die separate Backend-tus-API, nicht der öffentliche Nginx-Upload-Passthrough.

### A16 — Analytics-Auswahl widerspricht globalen Analytics-Rechten

**Neu, P2.** `frontend/src/pages/Analytics/index.tsx:18–39`, `frontend/src/pages/Dashboard/TopHostsWidget.tsx:96–101`.

Globale Analytics-Rechte erlauben einen fremden Host, die UI akzeptiert ihn aber nur aus der eingeschränkten Proxy-Verwaltungsliste. Ein gültiger Dashboardlink wird auf den eigenen Host umgeschrieben. Mit ausgeblendeter Proxyverwaltung scheitert die Liste und startet keine Chartabfrage. Echte AJV-Policies und originale Autorisierung/Auswahl bestätigen den Vertragsbruch; Navigation und Datenbankgrenze sind kontrolliert, kein React-Mount. **Korrektur:** Analytics-berechtigte Hostauswahl bereitstellen und zulässige Zielhosts erhalten.

### A17 — Speichern im offenen Dialog macht erfolgreichen Git-Deploy rückgängig

**Neu, P2.** `frontend/src/components/GitSyncTab.tsx:27–39`, `frontend/src/hooks/useGitSync.ts:38–42`, `frontend/src/modals/ProxyHostModal.tsx:35–46`, `backend/internal/proxy-host.js:304–307,367–371,397–400`.

Ein erfolgreicher erster manueller Sync aktiviert den verwalteten Webroot, während das offene Formular seinen alten Root behält. Ein anschließendes Speichern sendet diesen alten Wert erneut und aktiviert ihn erfolgreich. Ohne automatisches Polling erfolgt keine spätere Korrektur. Originale Formular-/Payloadfunktionen sowie eine unabhängige Gegenprobe mit Originalupdate und Nginx-Dateiaktivierung bestätigen den Ablauf; der Hook-Runtimevertrag ist modelliert. **Korrektur:** Ergebnisse eigener Dialogaktionen gezielt mit unberührten Entwurfsfeldern abgleichen und echte konkurrierende Rootänderungen als Konflikt behandeln. A07 betrifft dagegen eine bereits fehlgeschlagene Aktivierung.

### A18 — Zwei Integrationstests haben unzureichende Zeit-/Fixtureverträge

**Neu, P2.** `backend/test/migrations/maintenance-pending.spec.js:9–12,35–36`, `backend/test/lib/nginx-smoke-endpoints.spec.js:170–206`, `scripts/ci/nginx-smoke-endpoints.mjs:73–80,143–145`.

Der PostgreSQL-Migrationstest umfasst PGlite-Start, Migrationen und Cleanup innerhalb des Standardlimits von fünf Sekunden. Er überschritt dieses Limit im vollständigen und im isolierten lokalen Lauf; unverändert mit einem begrenzten CLI-Limit von 30 Sekunden bestehen beide Enginefälle.

Der frische CI-Lauf überschritt das gleiche äußere Limit im Smoke-Endpoint-Test. Dieser bündelt drei echte Childprocess-Szenarien mit eigenen Readinessfristen; das Cleanup kann je lebender Fixture zusätzlich bis zu drei Sekunden warten. Isoliert bestehen unverändert alle sieben Tests. **Korrektur:** Slow-Integrationstimeouts ausdrücklich und begrenzt festlegen; Childprocess-Fälle trennen und Fixture-Signale sauber behandeln. Assertions beibehalten. Ein späterer erfolgreicher Retry beseitigt diese Nachweise nicht.

## Umsetzung in PR #154

Alle 18 Ausgangsgruppen sind im PR korrigiert. Die Nachweise prüfen den jeweiligen Vertrag; sie sind keine Zusicherung, dass jede externe Integration oder jeder Browser vollständig abgedeckt ist.

| Gruppe | Implementierter Vertrag und Regression                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01    | Neues `certificates:create-client` prüft die aktuellen Administratorrollen aus der Datenbank, auch im vorhandenen AI-Ausstellungspfad. Normale Serverzertifikate behalten ihre bisherigen Rechte. Echte HTTP-/JWT-/SQLite-Tests sichern erlaubte und verbotene Ausstellungen.                                                                                                                                                                         |
| A02    | `terminal_host_fingerprint` speichert einen ausdrücklich bestätigten OpenSSH-SHA256-Pin. Ein fehlender Pin blockiert vor Entschlüsselung/Verbindung, ein falscher Pin vor SSH-Authentifizierung. Migration, Schema, Formular und tatsächliche lokale SSH-Handshakes sind geprüft.                                                                                                                                                                     |
| A03    | Hostantworten verwenden dieselbe normalisierende Credential-Redaktion wie direkte ACL-Antworten, einschließlich mehrfach kodierter Legacy-Metadaten. Regressionen erhalten konfigurierte Indikatoren und entfernen Secrets.                                                                                                                                                                                                                           |
| A04    | Cookieverändernde Auth-Aufträge werden bis zum vollständigen HTTP-Antwortabschluss serialisiert. Web Locks erweitern dies auf unterstützte Tabs; Storage/BroadcastChannel übertragen ausschließlich Identitätsmetadaten. Fremde oder wiederhergestellte Identitäten werden mit `/users/me` bestätigt. Zwei echte Chromiumfälle prüfen verspätete HttpOnly-Refreshcookies vor Impersonation beziehungsweise Logout und die Identität der Folgeanfrage. |
| A05    | ACL-Detach, strikte Nginx-Aktivierung und Bereinigung laufen unter derselben Queue. Fehler stellen DB, Dateien und aktive Listener wieder her; Auth-Dateien/OAuth2 werden erst nach Erfolg entfernt. Reale temporäre Dateien und DB-Rollbackpfade prüfen dies einschließlich fehlgeschlagener Statusschreibvorgänge und konkurrierender ACL-Neuzuordnung.                                                                                             |
| A06    | Docker-/GitOps-Finalreloads und GitOps-Pruning verwenden die gemeinsame Nginx-Queue. Locked-Bulkhelfer vermeiden verschachtelte Sperren; Konfigurationsbackups bleiben bis zum Statuscommit erhalten. Überlappende Render-/Prune-/Reloadfälle sind geprüft.                                                                                                                                                                                           |
| A07    | Ein atomar mit dem Root gespeicherter privater Aktivierungsmarker bleibt nach fehlgeschlagenem Nginx-Configure bestehen. Derselbe Checkout wird beim nächsten Sync erneut aktiviert; erst Erfolg entfernt den Marker. Antwort und Regressionen unterscheiden gespeicherten und tatsächlich aktivierten Root.                                                                                                                                          |
| A08    | Analytics stoppt Eingaben, leert die Parsequeue, wartet auf den aktiven Snapshotflush und schreibt anschließend den Folgepuffer. Verzögerte Initialisierung, Stop/Neustart und Flushüberlappung sind geprüft.                                                                                                                                                                                                                                         |
| A09    | NULL-Fälligkeiten stehen ausdrücklich vor zeitlich fälligen Monitoren; eine eigene Sortierspalte erhält die Reihenfolge über Knex-Dialekte. Tatsächliche SQLite-/PostgreSQL-Abfragen prüfen begrenzte Batches und Starvation.                                                                                                                                                                                                                         |
| A10    | Installer und Updater teilen einen Literalparser ohne Shellausführung. Mehrzeilige/CRLF-Werte bleiben erhalten; Updates schreiben atomar mit Modus 0600. Recovery folgt tatsächlicher JSON-Konfiguration vor vollständiger Env-Providerkonfiguration vor SQLite und berücksichtigt eigene Datenpfade. Python- und echte temporäre SQLite-Prüfungen sichern dies.                                                                                      |
| A11    | Run-/Attempt-spezifische Kandidaten durchlaufen GeoIP, Root-/UID1000-Runtime sowie Installer-/LXC-Export vor dem Push. Öffentliche Tags werden erst aus den beiden validierten, auf GHCR/Repository und SHA256 geprüften Digests erzeugt. PR-Builds pushen nicht; ausführbare Workflowverträge und native Architekturjobs prüfen dies.                                                                                                                |
| A12    | Additive BIGINT-Migration für Detailbytes, begrenzte nichtnegative sichere JS-Ganzzahlen bei der Eingabe und überlaufsichere Puffersummen. SQLite, PostgreSQL und MariaDB prüfen große Downloads. Down behält BIGINT bewusst, damit gültige Daten über 2 GiB erhalten bleiben.                                                                                                                                                                        |
| A13    | Terminalstop sperrt neue Upgrades und schließt SSH/WebSockets vor HTTP-Close. Nach einer Sekunde werden verbleibende WebSockets beendet; Stop/Neustart ist idempotent. Echte lokale HTTP-/WebSocket-Prüfungen sichern den Abschluss.                                                                                                                                                                                                                  |
| A14    | Datenbanktrigger reservieren aktive Domains typenübergreifend eindeutig und pflegen Soft-Delete, Restore und physisches Löschen. GitOps-Graphen schreiben auf allen drei Engines transaktional. SQLite/PGlite prüfen tatsächliche Constraints und Rollbacks; MariaDB-CI prüft mehrere echte Verbindungen. Historische Konflikte führen vor DDL zu einer Diagnose mit Domain und betroffenen Hosts.                                                    |
| A15    | Relay registriert Abbruchcontroller vor asynchroner Vorbereitung, prüft den Lebenszyklus vor Dispatch/Recovery und sperrt neue Queuearbeit nach Stop. Lokaler Origin und echte Chunkdateien sichern, dass kein verspäteter Transfer startet. Persistierte Uploads bleiben für den nächsten Start erhalten.                                                                                                                                            |
| A16    | `GET /api/analytics/hosts` liefert nur `id` und `domain_names`, bei globalen Analytics-Rechten alle aktiven Hosts und sonst den bestehenden Own-Host-Fallback. Die UI verwendet diese Liste; Tests prüfen Rechte ohne zusätzliche Proxy-Verwaltungsberechtigung.                                                                                                                                                                                      |
| A17    | Eigene Sync-Ergebnisse aktualisieren ausschließlich unberührte Root-/Scheme-Felder. Während Sync ist Speichern auch im Submitpfad gesperrt; konkurrierende Änderungen sind sichtbar auflösbare Konflikte. Gemountete Dialogtests erhalten andere Entwurfsfelder.                                                                                                                                                                                      |
| A18    | PGlite-Integrationstests verwenden explizite begrenzte Budgets; die drei Childprocess-Smokes sind einzeln begrenzt und die Fixture behandelt SIGQUIT mit geprüftem regulärem Exit. Zusätzlich erhalten die echte große GeoIP-Datei und der TLS-Migrationstest angemessene lokale Budgets. Assertions und Produktionszeitlimits bleiben erhalten.                                                                                                      |

### Ergänzende Verbesserungen

- Locale-/Theme-Präferenzen überstehen blockiertes `localStorage` mit einem In-Memory-Fallback; entsprechende React-Regressionen sind ergänzt.
- Hohe/kritische Backend-/Frontend-Auditbefunde blockieren den Qualityjob. Workflowrechte sind je Job reduziert, ein unerreichbarer PR-Kommentarzweig entfällt.
- Backend-Test-/Fixturedateien fehlen im Docker-/Native-Runtimepayload. Die tatsächlichen Runtime-Smokes prüfen sowohl diesen Ausschluss als auch notwendige Startskripte und den Env-Parser. Eine CPU-Einsparung wird nicht behauptet.
- Der zunächst unbestätigte DefaultSite-/GitOps-Formularfall ist mit neun gemounteten QueryClient-Regressionen bestätigt und korrigiert: frische Öffnungsdaten, Fehler/Retry und erhaltene laufende Entwürfe.

### Validierung der Korrekturen

Die vollständige PR-CI ist in [PR #154](https://github.com/shedowe19/ShieldPM/pull/154) an den jeweiligen Head gebunden. Abschließende Zahlen werden in der PR-Beschreibung dokumentiert, damit ein späterer Source-/Dokumentationscommit nicht irrtümlich durch Ergebnisse seines Vorgängers als geprüft gilt. Bereits erfolgreich auf dem integrierten Zwischenstand: neun echte Chromiumtests, vier MariaDB-Suiten mit vier Tests, 73 Scannerintegrationstests ohne neue Scannerfehler sowie 172 Infrastrukturtests mit zwei erwarteten CI-Skips. Ein veralteter Nginx-Testmock aus diesem Zwischenstand wurde korrigiert; sein fehlgeschlagener Qualityjob gilt nicht als finaler Erfolgsnachweis.

Lokal bestehen Backendtypen und 172 Infrastrukturtests mit 21 ausgewiesenen Umgebungsskips. Gezielte Regressionen prüfen die Originalfunktionen und die genannten tatsächlichen lokalen Engines/Verbindungen. Die nativen Images werden auf x86_64 und ARM64 geprüft; Veröffentlichung, Release und Deployment sind nicht Teil des PRs.

### Upgradehinweise und verbleibende Grenzen

- Bestehende Terminalziele erhalten zunächst keinen Pin. Vor der nächsten Verbindung muss ein Administrator den Hostfingerprint über einen vertrauenswürdigen Weg prüfen und speichern; es gibt kein automatisches Erstvertrauen.
- Bereits ausgestellte Clientzertifikate und die vorhandene CA werden nicht automatisch widerrufen oder rotiert. Die neue Administratorgrenze betrifft die künftige Ausstellung; frühere Ausstellungen müssen bei Bedarf gesondert betrieblich geprüft werden.
- Domainreservierungen benötigen auf MySQL/MariaDB `TRIGGER`-Rechte und transaktionale InnoDB-Tabellen. Historische aktive Doppelbelegungen müssen anhand der nichtdestruktiven Migrationsdiagnose bereinigt werden. Die Normalisierung ist für ASCII/Punycode geprüft; identische SQL-Unicode-Kleinschreibung oder semantische Gleichheit aller Nginx-Regexnamen über verschiedene Engines wird nicht behauptet.
- Ohne Web Locks ist Auth-Serialisierung auf dieselbe Seite begrenzt. Storage/BroadcastChannel dienen zusätzlich dem UI-Abgleich; bei vollständig gesperrtem Storage gibt es über einen Reload hinweg keine persistente Impersonation-Metadatenkontinuität. Metadaten enthalten keine JWTs, Refresh-Tokens oder CSRF-Secrets.
- Benutzerdefinierte DB-Provider ausschließlich in zusätzlichen Systemd-Drop-ins werden weiterhin nicht automatisch aus diesen Dateien erkannt. Der reguläre Installer verwaltet die Anwendungsumgebung selbst.
- Die weitergehende AI-Argumentprüfung blieb automatisch blockiert und unbestätigt. Allgemeine Origin-/WebSocket-Browserverträge sowie bestehende WireGuard-/OpenAppSec-Betriebsfragen sind keine neu abgeschlossenen Defektgruppen.

## Wiki-Prüfung

- Geprüfte Wiki-Seiten: vorhandene Audit-/Test-/Build-/Deploymentseiten, Frontend-Internas, Auth/PKI/Terminal, Analytics/Monitor, GitOps/Git-Deploy, Nginx, ACLs, Proxy Hosts, Migrationen, Upload-Relay, Rootfs und offene Fragen.
- Aktualisierte Wiki-Seiten: dieser Bericht, Index, offene Fragen, Tests, die betroffenen Modul-/Betriebsseiten, die öffentliche PKI-Anleitung und `GEMINI.md`.
- Neu erstellte Wiki-Seiten: keine zusätzliche Seite in der Umsetzungsphase; dieser vorhandene Scanbericht enthält die Nachverfolgung.
- Keine Wiki-Änderung nötig, weil: entfällt; Code-, Schema- und Betriebsverträge haben sich geändert.
- Offene Wiki-TODOs: verbleibende unbestätigte Prüfungen und bestehende separate Betriebsfragen bleiben ausdrücklich ausgewiesen; die 18 Ausgangsgruppen sind umgesetzt.

## Verwandte Seiten

- [Optimierungsprüfung vom 13. Oktober](./optimierungspruefung-2026-10-13.md)
- [Tests](./tests.md)
- [Build](./build.md)
- [Deployment](./deployment.md)
- [Terminal](../module/terminal.md)
- [Interne PKI](../module/pki.md)
- [Analytics](../module/analytics.md)
- [Proxy-Host-Monitor](../module/proxy-host-monitor.md)
- [Git-Deploy](../module/git-deploy.md)
- [Upload-Relay](../module/upload-relay.md)
- [Rootfs](../konfiguration/rootfs.md)
- [Offene Fragen](../offene-fragen.md)
