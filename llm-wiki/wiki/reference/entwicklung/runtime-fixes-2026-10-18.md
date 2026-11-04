# Betriebsfehler vom 18. Oktober 2026

> Historischer Prüfbericht. Die damalige Wasm-/WASI-Funktion wurde am 27. Oktober 2026 auf Nutzerwunsch entfernt. Aktueller Stand: [Referenzkorrektur und Entfernung](./gitops-reference-and-runtime-removal-2026-10-27.md).

## Zweck und Ausgangslage

Nach dem Instanztest von PR #156 meldete die produktive Instanz einen fehlgeschlagenen Nginx-Test mit
`unknown "statu" variable` und einen Datenbankfehler beim Wiederherstellen eines Proxy Hosts.
Der übermittelte SQL-Log endet vor der eigentlichen Treiberfehlermeldung. Deshalb werden der exakt
reproduzierte Nginx-Fehler und der zusätzlich reproduzierte MariaDB-Fehler getrennt bewertet.

## Beschädigte Nginx-Literale

Der bisher aufgerufene `nginxbeautifier` interpretiert schließende Klammern in einfach zitierten
JSON-Logformaten als Blocksyntax. Aus einem gültigen `$status}` entsteht `$statu`. Das betrifft unter
anderem generierte Traffic- und Firewall-Logformate; der echte Nginx meldet danach den übermittelten Fehler.

`generateConfig()` installiert die gerenderten Bytes jetzt ohne nachträglichen externen Formatierer.
Benutzerdefinierte Direktiven werden nicht automatisch umgeschrieben. Die bestehende Nginx-Validierung,
Rücknahme und Fehlerisolierung bleiben wirksam. Der gemeinsame Startup-Fingerprint berücksichtigt
zusätzlich die Prüfsummen der Engine und ihrer zentralen Render-Helfer. Ein Update regeneriert dadurch
bereits beschädigte Dateien auch bei unveränderter Anwendungs- und Templateversion.

Die separate `variables_hash`-Meldung ist eine Warnung und nicht die Ursache dieses fatalen Startfehlers.

## Vollständige temporale Wiederherstellung

Ein nicht leeres `git_last_sync` wird beim JSON-Snapshot zu einer ISO-Zeichenkette. Der bisherige
Rollback band nur `created_on` und `modified_on` gesondert. Echtes MariaDB reproduziert beim Patch
von `git_last_sync` den Fehler 1292 an der gemeldeten Stelle. Der gekürzte Produktionslog beweist
nicht, dass dies seine einzige mögliche Datenbankursache ist.

Die Wiederherstellung bindet nun alle fünf temporalen Host-Spalten innerhalb derselben Transaktion:
`created_on`, `modified_on`, `git_last_sync`, `maintenance_start` und `maintenance_end`. Ein privater
Abfragekontext erhält beim Erfassen die ursprünglichen Treiberwerte der Wartungszeitpunkte. Normale
API-Abfragen verwenden weiterhin die bisherige Zeitzonenkonvertierung. Der Kontext stammt nicht aus
öffentlichen Nutzdaten. Gemeinsam verwendete Zertifikate und Access Lists werden weiterhin nicht
aus dem Host-Snapshot überschrieben.

## Erneuter Rollback-Fehler um 14:37 Uhr

Der neue Produktionsauszug scheitert in `patchCapturedHost()` beim regulären Modell-Patch, vor dem getrennten
Zurückschreiben der Zeitspalten. Die native SQL-Ursache bleibt im übermittelten Ausschnitt abgeschnitten.
Ein weiterer Datumsfehler ist damit nicht nachgewiesen.

Ein Test gegen alle produktiven Migrationen reproduziert nun einen anderen Fehler an genau diesem Stack:
Nach den Domain-Claim-Abfragen schreibt eine zweite Verbindung den Host-Status. Unter `REPEATABLE READ` mit
`innodb_snapshot_isolation=ON` weist MariaDB den anschließenden Host-Patch mit `ER_CHECKREAD`/1020 zurück.
Die [MariaDB-Dokumentation](https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-system-variables#innodb_snapshot_isolation)
beschreibt diesen Schreibkonflikt als Abbruch der Transaktion. Die Übereinstimmung ist ein Reproduktionsnachweis,
kein Beweis für den im neuen Produktionslog fehlenden Fehlercode.

`restoreHostState()` wiederholt ausschließlich seine Datenbankkompensation höchstens dreimal in frischen
Transaktionen, mit 25/50 Millisekunden Abstand. Ausschließlich passende Fehlercode-/Nummer-Paare für Snapshot-,
Deadlock- und Lock-Timeout-Konflikte werden wiederholt. Permanente SQL-Fehler werden sofort weitergegeben;
Konfigurationsdateien und Nginx-Reload liegen außerhalb der Wiederholung. Allgemeine Domain-Claim-Rückrufe
werden wegen möglicher weiterer Zustandsänderungen nicht pauschal erneut ausgeführt.

Eine zweite Korrektur verhindert, dass ein fehlgeschlagener Rollback den ursprünglichen Aktivierungsfehler
vollständig verdrängt. Beide Ursachen bleiben privat erhalten. Eine kurze `[Host rollback]`-Logzeile enthält
Host-ID, Operation, Phase und sichere Fehlerkennungen, ohne SQL, Snapshots oder Zugangsdaten. Bei gescheiterter
Kompensation wird keine erfolgreiche Wiederherstellung behauptet.

Lokaler Nachweis mit echtem MariaDB: 31/31 Fälle über sieben Dateien, davon vier mit vollständig migriertem
Schema und allen 68 Host-Spalten. Einmaliger Konflikt, drei wiederkehrende Konflikte und permanenter SQL-Fehler
1054 sind abgedeckt. SQLite-/PostgreSQL-Revisionsfälle bestehen mit 18/18, die ergänzenden Fehler- und
Host-Service-Regressionen mit 67/67. Der neue native Produktionsfehlercode bleibt offen.

## Prüfnachweise

- Echter Nginx: vor der Korrektur HTTP 404 für den gültigen manuellen Host und reproduzierter
  `unknown "statu" variable`; danach 13/13 Fälle mit HTTP 200, gültigen Traffic-JSON-Logs,
  unveränderten zitierten Benutzerwerten, isoliertem fehlerhaftem Host sowie Neustart und Reparatur.
- Startup-Fingerprint: 9/9 Fälle, einschließlich Änderung jeder erfassten Generatorquelle und
  Übereinstimmung zwischen Node-/Shell-Aufruf und Symlink-Installation.
- Echtes MariaDB: der alte Stand scheitert in vier Regressionen; der korrigierte vollständige
  MariaDB-Lauf besteht 27/27 Fälle. Die Host-Service-Prüfung deckt lokale Zeit, positive/negative
  Verbindungs-Offsets, `dateStrings` und Sommerzeitwechsel ab.
- Verwandte Service-Regressionen: 104/104 auf SQLite und PostgreSQL/PGlite; unabhängige Nachprüfung
  von Nginx-Literalen und Host-Versionen zusätzlich 28/28. Backend-Typprüfung und Formatierung bestanden.

## Eigenständige WASI-Anwendungen

Unter **Einstellungen → WASI-Anwendungen** können Administratoren jetzt auch eigenständige
Preview-1-Kommandos hochladen und ausführen. Sie benötigen keine Proxy-Wasm-Callbacks. Jeder Start
erhält explizite Argumente, Umgebungswerte und Standardeingabe; Ausgabe, Fehlerausgabe und WASI-Exitcode
werden direkt angezeigt. Stoppen beziehungsweise ein Verbindungsende beendet den tatsächlichen Prozess.
Der private Katalog und die unveränderlichen Artefakte verwenden dieselben geprüften Dateigrenzen.

Die Ausführung verwendet den vorhandenen Node-WASI-Adapter mit festen Kindprozessen, Zeit-/Ausgabelimits
und ohne vorgeöffnete Verzeichnisse oder geerbte Umgebung. Es werden keine Anwendungs-, Paket- oder
Binary-Versionen geändert. Der genaue Preview-1-Vertrag und die Vertrauensgrenze stehen unter
[WASI-Runtime](./gitops-reference-and-runtime-removal-2026-10-27.md).

## Abschließender Prüfstand

- Backend: 2.697 bestanden, 76 ausdrückliche Umgebungs-/Runtime-Skips, 271 bestandene Testdateien.
- Frontend: 1.028/1.028 bestanden in 226 Dateien; TypeScript, alle 13 Sprachkataloge und Produktionsbuild bestanden.
- Chromium: 10/10 Abläufe ohne Skips oder unerwartete Fehler. Der WASI-Bedienablauf verwendet gemockte API-Antworten.
- Tatsächliche gemeinsame Nginx-/Wasm-/WASI-Prüfung: 174/174 Fälle in 13 Dateien, keine Skips, 32,06 Sekunden.
  Darin enthalten sind 24 eigenständige Runner-, 38 Katalog- und sechs vollständige HTTP-Ausführungsfälle.
- Komprimiertes Bundle: 1.202.465 Byte JavaScript und 16.461 Byte CSS innerhalb der unveränderten Budgets.
- TScanner: 753 Dateien, keine Fehler oder Hinweise; Biome sowie die CI-Spellingregeln bestanden.

Die Router-Barrel-Fixture isoliert ihren direkten Berechtigungs-Child, statt darüber unbeabsichtigt
den vollständigen API-Barrel zu laden. Die verbotene Komponenten-Barrel-Prüfung bleibt unverändert;
reale Admin-/Nicht-Admin-Rechte haben eigene Router- und Navigationsfälle. Der vollständige Frontend-Lauf
besteht nach dieser gezielten Test-Isolierung ohne erhöhtes Zeitlimit.

## Wiki-Prüfung

- Geprüfte Wiki-Seiten: Proxy-Host, Host-Versionen, Datenbank, Tests und dieser Betriebsfehlerbericht.
- Aktualisierte Wiki-Seiten: Proxy-Host, Host-Versionen, Tests und dieser Betriebsfehlerbericht; außerdem GEMINI.md.
- Neu erstellte Wiki-Seiten: keine für die erneute Rollback-Prüfung.
- Keine Wiki-Änderung nötig, weil: entfällt; Ursachen, Verhalten und Nachweise sind dokumentiert.
- Offene Wiki-TODOs: auch im neuen Produktionsauszug fehlt der native SQL-Fehlercode; der exakt reproduzierte
  Snapshot-Konflikt wird deshalb nicht als bestätigte einzige Produktionsursache dargestellt.

## Verwandte Seiten

- [Nginx-Engine](../module/nginx-engine.md)
- [Host-Versionen](../features/host-revisionen.md)
- [Umsetzung der Gesamtprüfung](./feature-implementation-2026-10-17.md)
- [WASI-Anwendungen](./gitops-reference-and-runtime-removal-2026-10-27.md)
