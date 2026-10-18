# Betriebsfehler vom 18. Oktober 2026

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

## Wiki-Prüfung

- Geprüfte Wiki-Seiten: Nginx-Engine, Rootfs, Konfiguration, Umgebungsvariablen, Proxy-Host und Host-Versionen.
- Aktualisierte Wiki-Seiten: Nginx-Engine, Umgebungsvariablen, öffentliche Configuration und
  Docker-Compose-Referenz sowie Proxy-Host und Host-Versionen.
- Neu erstellte Wiki-Seiten: dieser Betriebsfehlerbericht.
- Keine Wiki-Änderung nötig, weil: entfällt; Ursachen, Verhalten und Nachweise sind dokumentiert.
- Offene Wiki-TODOs: die vollständige ursprüngliche SQL-Treiberfehlermeldung liegt nicht vor.

## Verwandte Seiten

- [Nginx-Engine](../module/nginx-engine.md)
- [Host-Versionen](../features/host-revisionen.md)
- [Umsetzung der Gesamtprüfung](./feature-implementation-2026-10-17.md)
