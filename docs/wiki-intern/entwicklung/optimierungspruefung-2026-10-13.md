# ShieldPM Optimierungsprüfung vom 13. Oktober 2026

## Zweck und Prüfstand

Bestandsprüfung von `develop` am Commit `02cfd0f398d9fa2bf298e3c20737518454b6e5d2`, Version 4.4.1. Zuerst sollten Zugangsdaten in Leseantworten, der Nginx-Batch-Rollback, fehlgeschlagene Wartungswechsel und veraltete Firewall-Dialogwerte korrigiert werden. Anschließend folgen Leistungs- und Betriebsverbesserungen.

Vier parallele Reviews untersuchten Sicherheit, Hintergrunddienste, Frontend und Deployment; ergänzend wurde Analytics geprüft. Bestehende Audits und Modulbeschreibungen wurden zum Abgleich bereits korrigierter Fehler gelesen. Dies ist eine gezielte Quellprüfung mit isolierten Nachweisen, keine vollständige Lektüre aller 1.805 versionierten Dateien. Die folgenden Befundbeschreibungen beziehen sich auf diesen Ausgangsstand. Auf ausdrücklichen Auftrag wurden anschließend alle 13 Punkte umgesetzt; der Abschnitt Umsetzung beschreibt die neuen Verträge. Version 4.4.1 bleibt erhalten.

## Validierung des Ausgangsstands

Die acht zuletzt abgefragten Workflows dieses Commits sind erfolgreich, einschließlich Docker-Build, CodeQL und [Quality Gates](https://github.com/shedowe19/ShieldPM/actions/runs/38433987545). Deren Logs bestätigen 2.080 bestandene Backendtests mit vier Skips, 906 Frontendtests, Typprüfung, Locale-Prüfung, Build und Bundle-Budget. MariaDB-Migrationen und Browser-Smoke bestehen ebenfalls. Die Abhängigkeitsprüfungen melden keine bekannten Schwachstellen bei 522 Backend- und 632 Frontendpaketen. Das JavaScript-Bundle liegt insgesamt bei 1.117.195 gzip-Bytes gegenüber 1.290.000 erlaubten Bytes.

Die ursprünglichen Nachweise führten tatsächliche Quellfunktionen mit kontrollierten Abhängigkeiten aus. Die Umsetzung ergänzt echte HTTP-/JWT-/SQLite-Tests, PostgreSQL-Prüfungen in PGlite, Liquid-Rendering mit temporären Dateien, lokale Monitor-Upstreams und gemountete React-Regressionen. Die unterstützte Node.js-26-Laufzeit und exakten Backend-Abhängigkeiten stehen inzwischen lokal zur Verfügung. Frontend, Biome und TScanner werden zusätzlich mit den vollständigen Abhängigkeiten in GitHub CI validiert.

## Umsetzung aller 13 Punkte

| Nr. | Neuer Vertrag                                                                                                                                                                                                                                                                                                                  | Regressionen                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Öffentliche Cloudflare-, DDNS- und Access-List-Antworten entfernen Secrets und liefern lediglich Konfigurationsindikatoren. Omission/Leerwerte erhalten aktuelle gespeicherte Secrets; DDNS und Access Lists lesen diese innerhalb der gesperrten Schreibtransaktion. Vertrauenswürdige Serverpfade behalten die echten Werte. | `service-credentials.spec.js`, Cloudflare-, DDNS- und Access-List-Formulartests einschließlich gleichzeitiger Rotation. |
| 2   | Alle Statuswrites und Rollbacks werden vollständig abgewartet. Sicherungen bleiben bis zum erfolgreichen Gruppenabschluss erhalten; Cleanup-Fehler entfernen keine akzeptierten Listener. Bulk bleibt validierend, der gemeinsame Reload liegt beim Aufrufer.                                                                  | `nginx-bulk-validation.spec.js` mit realen Dateien und verzögerten Fehlerfällen.                                        |
| 3   | Privates persistentes `maintenance_pending` erhält fehlgeschlagene Aufträge über Neustarts. Ein gesperrter Batch rendert, validiert und lädt neu; Fehler restaurieren die bisherigen Dateien. Erst nach Erfolg werden passende Termine abgeschlossen.                                                                          | `maintenance-schedule.spec.js`, `maintenance-pending.spec.js`, serialisierter Startup-Reload.                           |
| 4   | Firewall-Listen warten beim Öffnen auf einen frischen erfolgreichen Snapshot und erhalten anschließend den Entwurf.                                                                                                                                                                                                            | `FirewallListModal.test.tsx`.                                                                                           |
| 5   | Bis zu 100 fällige Hosts je Scan werden mit höchstens fünf unmittelbar nachgefüllten Workern geprüft. Stop verhindert weitere Queueaufträge.                                                                                                                                                                                   | `proxy-host-monitor.spec.js` mit 100/120 tatsächlichen lokalen HTTP-Probes und langsamen Checks.                        |
| 6   | Erfolgreiche Host-, Discovery- und GitOps-Änderungen aktualisieren den Domaincache. GitOps meldet einen kompletten Batch einschließlich Teilfehlern; gleichzeitige Meldungen werden zusammengeführt.                                                                                                                           | `analytics-domain-lifecycle.spec.js`, graphbasierte Transaktions- und GitOps-Batchtests.                                |
| 7   | Installer und Updater teilen einen root-eigenen `flock`, der die Selbstupdate-Execs überlebt.                                                                                                                                                                                                                                  | `test_native_maintenance.py`.                                                                                           |
| 8   | Neuinstallation sichert und ersetzt die Anwendung exakt, erhält `/data` und restauriert Anwendungsdateien bei Fehlern vor Beginn neuer Migrationen. Unsichere Quell-/Zielpfade werden abgewiesen.                                                                                                                              | Reale temporäre Kopier-/Rollback- und Symlink-Fixtures.                                                                 |
| 9   | Alle optionalen Entscheidungen, begrenzten Downloads und Archiv-/ELF-Prüfungen laufen vor Dienststopp; danach werden nur vorbereitete Dateien installiert.                                                                                                                                                                     | Native-Maintenance- und Updater-Laufzeitverträge.                                                                       |
| 10  | Latest-Neubauten müssen je Architektur GeoIP- und Root-/UID-1000-Smokes bestehen. Tags werden anschließend aus den genau getesteten Digests erzeugt.                                                                                                                                                                           | `docker-latest-workflow.spec.js` führt die tatsächlichen Push-/Promote-Shellblöcke mit kontrolliertem Docker aus.       |
| 11  | Cloudflare-, Tor- und WireGuard-Speicherergebnisse gehören zur jeweiligen Dialoggeneration. Same-ID-Aktualisierungen erhalten den offenen Entwurf.                                                                                                                                                                             | Gemountete Dialog-Race- und Cloudflare-Credentialtests.                                                                 |
| 12  | Analytics beendet alle drei Intervalle und seine Domain-Subscription. Alte Reads können einen Neustartcache nicht überschreiben.                                                                                                                                                                                               | Lifecycle-Tests einschließlich Stop während Init und verspäteter Abfrage.                                               |
| 13  | Proxy-Host-Suche wartet 300 ms nach der Eingabe; Query-Abbruch wird bis zum tatsächlichen Fetch weitergereicht.                                                                                                                                                                                                                | Gemountete Suchburst-/Fetch-Abbruchtests.                                                                               |

Die zusätzliche unabhängige Prüfung fand und korrigierte außerdem ein Refresh-Rennen unmittelbar nach Promise-Abschluss, mögliche Secret-Rückrotation durch alte Snapshots sowie die Konkurrenz zwischen Startup-Reload und Wartungsaktivierung. Der Anwendungsrollback ist keine Gesamttransaktion über Pakete, Rootfs, Binärdateien und Datenbank; nach Start neuer Migrationen bleiben Sicherungen zur manuellen Wiederherstellung erhalten.

## Hohe Priorität

### 1 Zugangsdaten aus Leseantworten entfernen

**Fundstellen:** `backend/routes/nginx/cloudflared.js:22–64`, `backend/models/cloudflared_tunnel.js:53–65`, `backend/internal/ddns-provider.js:77–103`, `backend/internal/access-list.js:408–417,534–545,570–587`.

Die Get-/List-Capabilities erlauben gewöhnlichen Benutzern `view`. Cloudflare-Leseantworten enthalten jedoch den beim Modelllesen entschlüsselten Tunnel-Token. DDNS-Antworten behalten Zugangsdaten in `config`; Access Lists behalten `oauth2_client_secret`, `oauth2_cookie_secret` und `oidc_client_secret` in ihren Metadaten. Bei Sichtbarkeit `all` betrifft dies fremde Einträge. Sichtbarkeit `user` begrenzt den Besitzer korrekt, entfernt aber keine Secrets aus eigenen Leseantworten.

**Nachweis:** Tatsächliches Cloudflare-Modell, AES-GCM-Helper und GET-Listenhandler mit synthetischem Schlüssel/Token ausgeführt: `view/all` liefert den entschlüsselten Token eines fremden Besitzers; `view/user` liefert keine fremden Einträge. Tatsächliche DDNS- und Access-List-Lesemethoden erhalten die synthetischen Secrets ebenfalls. ORM, Express-Transport und Capability-Ergebnis wurden kontrolliert; alle sechs Berechtigungsdateien wurden separat geprüft. Keine echten Zugangsdaten oder Live-Dienste verwendet.

**Korrektur:** Explizite öffentliche Antwortobjekte ohne Secrets für Listen, Einzelobjekte und Mutationsantworten. Formulare zeigen nur, ob Zugangsdaten hinterlegt sind; ausgelassene Secret-Werte erhalten die gespeicherten Werte. Regressionen für `view/user`, `view/all`, alle Lesepfade und Updateantworten ergänzen. Bereits korrigierte DDNS-Audit-Logs und Host-Expansionen lösen diese direkten Ressourcenantworten nicht.

### 2 Nginx-Sicherungen bis zum vollständigen Gruppenabschluss behalten

**Fundstellen:** `backend/internal/nginx.js:139–154,505–517,547–575`.

Die parallelen `commitStagedConfig()`-Aufträge löschen einzeln ihre Sicherungen. Scheitert danach beispielsweise der Statuswrite eines anderen Hosts, rollt der Fehlerpfad sämtliche Hosts zurück. Eine bereits abgeschlossene Hostkonfiguration wird nach `.conf.err` verschoben, ihre gelöschte `.bak` kann nicht wiederhergestellt werden. Beim folgenden Reload fehlt die Hostkonfiguration.

**Nachweis:** Originalfunktionen mit echten temporären Dateien und kontrolliertem Statuswrite-Fehler beim zweiten Host ausgeführt. Host 1 besitzt anschließend keine aktive `.conf`; Host 2 erhält seine alte Datei zurück. Kein Nginx-Prozess gestartet.

**Korrektur:** Statusupdates und Sicherungsbereinigung trennen. Sicherungen bis zum vollständigen Erfolg, möglichst bis zum erfolgreichen gemeinsamen Reload, erhalten. Auch nach Fehlern alle gestarteten Arbeiten vor Freigabe der Konfigurationssperre abwarten. Regression mit zwei Hosts, verzögertem Commit und fehlschlagendem Rollback ergänzen.

### 3 Fehlgeschlagene Wartungswechsel erneut versuchen

**Fundstelle:** `backend/internal/maintenance.js:75–80,123–154`.

Der Dienst persistiert `maintenance_active` und entfernt abgearbeitete Termine vor Konfiguration und Reload. Fehler werden nur protokolliert. Beim nächsten Poll entspricht der gespeicherte Status bereits dem Sollzustand; einmalige Starts und beendete Fenster fehlen nach Terminlöschung ganz in der Abfrage. Einstellung und tatsächliche Nginx-Aktivierung bleiben auseinander.

**Nachweis:** Originalservice zweimal mit kontrolliertem Hostmodell ausgeführt, jeweils mit einmaligem Konfigurations- beziehungsweise Reloadfehler. Nur ein Aktivierungsversuch; der Starttermin ist danach gelöscht.

**Korrektur:** Einen dauerhaften Pending-/Retryauftrag bis zum erfolgreichen validierten Reload erhalten. Auch zurückgegebene fehlgeschlagene Nginx-Konfigurationen behandeln. Regressionen für Start, Ende und gemeinsamen Reload ergänzen.

### 4 Firewall-Listen mit einem frischen Öffnungssnapshot bearbeiten

**Fundstellen:** `frontend/src/modals/FirewallListModal.tsx:66–76,129–141,437–450`, `frontend/src/hooks/useFirewallLists.ts:22–27`.

Gecachte Daten sind sofort bearbeitbar. Nach beliebiger Änderung verhindert `isDirty` das Übernehmen frisch geladener Werte. Eine reine Namensänderung kann deshalb einen inzwischen deaktivierten Eintrag wieder aktivieren und seine neue Feed-URL durch die alte ersetzen. Auch nach fehlgeschlagener Öffnungsabfrage mit Cache bleibt Speichern möglich; eine Aktualisierung beim Öffnen wird nicht erzwungen.

**Nachweis:** Tatsächliche Defaultwerte, Reset-Bedingung und Submit-Funktion in isoliertem Node-Harness ausgeführt. Der Save enthält alte URL-/Enabled-Werte. Kein gemounteter React-Test.

**Korrektur:** Verpflichtende Öffnungsaktualisierung und den bereits in anderen Dialogen verwendeten `useFreshFormData`-Vertrag übernehmen. Erst nach erfolgreichem frischem Snapshot bearbeiten, danach den Entwurf stabil halten. React-Regressionen für Cache, verzögerte und fehlgeschlagene Öffnungsabfrage ergänzen.

## Mittlere Priorität

| Nr. | Befund und Fundstelle                                                                                                                                                                                               | Nachweis                                                                                                                                                                                 | Verbesserung                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | Monitor prüft höchstens fünf Hosts pro Zehnsekundentakt und füllt freie Plätze nicht nach. `backend/internal/proxy-host-monitor.js:738–752,762`.                                                                    | Original-Tick mit 100 fälligen Hosts und sofort erfolgreichen simulierten Probes benötigt 20 Ticks: letzter erster Check frühestens nach 190 Sekunden.                                   | Fünf Worker nach Abschluss unmittelbar mit weiteren fälligen Hosts versorgen; begrenzte Abfrageseiten und nächsten Fälligkeitszeitpunkt verwenden. Parallelitätsgrenze beibehalten.     |
| 6   | Analytics-Domaincache wird nur beim Start und alle zehn Minuten geladen; neue oder geänderte Zuordnungen werden bis dahin falsch erfasst. `backend/internal/analytics.js:95,108–119,175–181`.                       | Originalklasse mit kontrolliertem Domainmodell: gleicher neuer Host vor Refresh mit ID 0, danach mit ID 2.                                                                               | Nach erfolgreichen Host-/Domainänderungen gebündelt aktualisieren; periodischen Refresh beibehalten. Bereits gespeicherte Ereignisse werden durch Refresh nicht rückwirkend korrigiert. |
| 7   | Native Updates besitzen keine gemeinsame Installationssperre. Parallele Aufrufe können Dateiaustausch, Neustart und Rollback gegeneinander ausführen. `rootfs/usr/local/bin/update-shieldpm:10–42,384–405,579–582`. | Gesamtes Skript einschließlich Selbstupdate-/Rollbackpfaden gelesen; kein gemeinsamer Lock. Kein echtes paralleles Update ausgeführt.                                                    | Root-eigenen `flock` vor Systemänderungen erwerben, über `exec` erhalten und mit dem Installer teilen; isolierte Mehrprozessregression ergänzen.                                        |
| 8   | Native Neuinstallation überlagert bestehende Dateien und lässt entfernte Module, Pakete und Frontend-Assets zurück. `scripts/install.sh:187–199`.                                                                   | Echten Kopierblock in temporären Verzeichnissen ausgeführt; entfernte Backenddatei, altes Paket und alter Chunk blieben bestehen.                                                        | Anwendung sichern und `/app` sowie `/html/frontend` exakt ersetzen, entsprechend dem vorhandenen Updater. `/data` erhalten.                                                             |
| 9   | Native Updates stoppen ShieldPM vor optionalen Rückfragen und Downloads ohne Zeitbegrenzung. `rootfs/usr/local/bin/update-shieldpm:390,419–425,459–479,527–550,579–582`.                                            | Reihenfolge und Curl-Aufrufe im Skript nachvollzogen; kein Produktionsupdate.                                                                                                            | Entscheidungen, begrenzte Downloads und Archivprüfung vor dem Stopp durchführen; Unterbrechung auf Austausch und Neustart begrenzen.                                                    |
| 10  | Manueller latest-Neubau besitzt keine GeoIP- und Root-/UID-1000-Smokes; das Basisimage `master` ist veränderlich. `.github/workflows/docker-latest.yml:117–169`, Vergleich `docker.yml:192–208`.                    | Workflows und Dockerfile verglichen; kein Image veröffentlicht.                                                                                                                          | Bereits geprüften Image-Digest übernehmen oder identische Architektur-Smokes vor Veröffentlichung ausführen; Workflow-Vertrag ergänzen.                                                 |
| 11  | Verspätete Speicherantwort schließt einen inzwischen neu geöffneten Tunnelentwurf. `frontend/src/components/Nginx/CloudflaredTunnelModal.tsx:45–63,106`; ähnliche Muster bei Tor und WireGuard.                     | Tatsächlichen Cloudflare-Submitcallback mit kontrollierter Mutation ausgeführt: Save, Schließen, anderen Dialog öffnen, alte Antwort schließt neuen Dialog. Kein React-Integrationstest. | Ergebnisse an eine Dialoggeneration binden oder während Save sämtliche Schließpfade sperren. Tor-/WireGuard-Analogien mit gemounteten Regressionen prüfen.                              |

## Niedrigere Priorität

| Nr. | Befund                                                                                                                                                                                                                                                                             | Nachweis und Verbesserung                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | Analytics-Domain-Refresh-Timer wird nicht gespeichert und beim Stoppen nicht entfernt. `backend/internal/analytics.js:95,156–164`.                                                                                                                                                 | Originalklasse zweimal mit kontrollierten Timern gestartet und gestoppt: zwei Intervalle mit 600.000 ms bleiben übrig. Eigene Timerreferenz speichern und Stop-/Restartregression ergänzen. |
| 13  | Proxy-Host-Suche startet für jeden Tastendruck einen Serverauftrag; Query-Abbruch wird nicht weitergereicht. `frontend/src/pages/Nginx/ProxyHosts/TableWrapper.tsx:74–80,133–135`, `frontend/src/hooks/useProxyHosts.ts:28–32`, `frontend/src/api/backend/getProxyHosts.ts:31–42`. | Datenfluss nachvollzogen, keine Lastmessung. Suchauftrag um ungefähr 250–300 ms verzögern und AbortSignal bis zum API-Client durchreichen; Eingabeburst und Abbruch testen.                 |

## Bewusster Berechtigungsvertrag

`analytics:view` erlaubt laut bestehender Dokumentation globale Analytics und ist für neue normale Benutzer standardmäßig gesetzt. Dies wurde deshalb nicht als neuer Produktfehler gezählt. Ein separates Recht für globale Analytics und standardmäßig nur eigene Hoststatistiken wären eine zusätzliche Datenschutzentscheidung mit geändertem Berechtigungsvertrag.

## Umsetzung und Wiki-Prüfung

Alle 13 Befunde sind implementiert und mit gezielten Regressionen versehen. Die oben angegebenen historischen CI-Zahlen gehören ausschließlich zum Ausgangscommit; Ergebnisse der Änderung werden im englischen PR ausgewiesen. Echte externe Anbieter, vollständige Native-/LXC-Neuinstallationen und manuelle Latest-Veröffentlichung benötigen weiterhin ihre jeweiligen Betriebsumgebungen.

Geprüft und aktualisiert wurden Audit-, Tests-, Deployment-, Build-, Rootfs-, Cloudflare-, DDNS-, Access-List-, Nginx-, Wartungs-, Monitor- und Analytics-Seiten. Diese Seite hält Ausgangsbefunde und Umsetzung gemeinsam fest; Index und zentrale TODO-Liste unterscheiden korrigierte Befunde von offenen Betriebsfragen. Keine Veröffentlichung in develop oder produktive Installation erfolgt durch diese Prüfung.

## Verwandte Seiten

- [Codeprüfung Oktober](./code-audit-2026-10.md)
- [Tests](./tests.md)
- [Deployment](./deployment.md)
- [Nginx-Engine](../module/nginx-engine.md)
- [Maintenance](../module/maintenance.md)
- [Proxy-Host-Monitor](../module/proxy-host-monitor.md)
- [Analytics](../module/analytics.md)
- [IP-Firewall](../module/ip-firewall.md)
- [Cloudflare Tunnels](../module/cloudflared.md)
- [Offene Fragen](../offene-fragen.md)
