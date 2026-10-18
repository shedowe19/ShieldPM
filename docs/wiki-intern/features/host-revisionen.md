# Host-Revisionen und geprüfte Wiederherstellung

## Zweck

Erfolgreich aktivierte Proxy-Host-Zustände erhalten eine eigene Versionshistorie. Ein Benutzer kann einen früheren Zustand mit dem aktuellen Host vergleichen und nach Prüfung wiederherstellen.

## Kontext

Die Historie ergänzt die globale GitOps-Historie und die bestehende Nginx-Konfigurationsvorschau. Sie ist auf einen einzelnen Proxy-Host und dessen Leserechte begrenzt. Wiederherstellung benötigt zusätzlich `proxy_hosts:update` und die Eigentümersichtbarkeit dieses Rechts.

## Wichtige Dateien

- `backend/internal/host-revisions.js` — Aufzeichnung, Berechtigungen, Vergleich und Wiederherstellung
- `backend/models/proxy_host_revision.js` — unveränderliche gespeicherte Revision
- `backend/migrations/20261017190500_host_revisions.js` — Tabelle und Indizes
- `backend/routes/nginx/proxy_host_revisions.js` — API unter `/nginx/proxy-hosts/:host_id/revisions`
- `backend/lib/configuration-files.js` — bytegenaue Sicherung und atomare Dateiwiederherstellung
- `frontend/src/pages/Nginx/ProxyHosts/HostRevisionsDialog.tsx` — Versionsauswahl, Vergleich und Wiederherstellung

## Verhalten

Eine Revision speichert Benutzer-ID, Aktion, Zeitpunkt und SHA-256-Fingerabdruck. Der vollständige Host-Zustand einschließlich verschlüsselter Verbindungszugangsdaten, Domainrelationen und referenzierter TLS-/Zugriffsdateien wird zusätzlich mit dem bestehenden AES-GCM-Schlüssel verschlüsselt gespeichert. Pro Host bleiben höchstens 100 vollständige Versionen. Der dauerhafte Schlüssel in `/data/shieldpm/keys.json` muss bei einer vollständigen Datensicherung erhalten bleiben.

Die API liefert weder diesen verschlüsselten Inhalt noch Zugangsdaten zurück. Der Vergleich zeigt strukturierte geänderte Host-Felder. Freitextdirektiven, Notizen, Query-Werte und Plugin-Konfiguration werden ausgeblendet; Unterschiede dieser Felder bleiben als Änderung erkennbar. Die generierten Konfigurationen werden über Fingerabdrücke verglichen, nicht als möglicherweise geheime Rohkonfiguration veröffentlicht.

Vor der Wiederherstellung wird ein Plan geladen. Sein Fingerabdruck umfasst den aktuellen Datenbankzustand und referenzierte Dateien. Unter der gemeinsamen Nginx-Konfigurationssperre wird dieser Fingerabdruck erneut geprüft. Zwischenzeitliche Änderungen verlangen einen neuen Plan. Domains, neu zugewiesene Zertifikate und Access Lists sowie Firewall- und Upload-Relay-Regeln werden erneut geprüft. Die Wiederherstellung erhält den aktuellen Besitzer.

Zertifikate und Access Lists sind gemeinsam genutzte Ressourcen. Eine Host-Revision darf deren aktuelle Regeln oder Dateien nicht zurückdrehen. Haben sich die ursprünglich referenzierten Datenbankobjekte oder Datei-Inhalte geändert, wird bereits der Plan abgelehnt. Der Benutzer muss diese Ressource separat prüfen. Die bytegenaue Dateiwiederherstellung dient nur der Kompensation innerhalb derselben serialisierten Aktivierung, nicht der unbemerkten historischen Änderung gemeinsamer Ressourcen.

Ein Kandidat wird in kurzen Datenbanktransaktionen geschrieben und anschließend mit der bestehenden Nginx-Aktivierung geprüft. Bei Fehlern werden unmittelbar vorherige Host-Felder, Domains und aktive Dateien samt Berechtigungen wiederhergestellt und erneut geladen. Die langsame Nginx-Prüfung hält keine Datenbanktransaktion offen. Erfolgreiche Wiederherstellung erzeugt eine neue Revision und einen Audit-Eintrag mit Referenz auf die ausgewählte Version.

Auf MySQL/MariaDB werden JSON-serialisierte Zeitpunkte beim Rollback und bei der Aktivierung einer gespeicherten
Revision wieder als `Date`-Werte gebunden. Das umfasst alle temporalen Host-Spalten: `created_on`, `modified_on`,
`git_last_sync`, `maintenance_start` und `maintenance_end`; Domain-Zeitstempel werden ebenfalls wiederhergestellt.
Dadurch verwendet mysql2 die bestehende Verbindungszeitzone; strikte DATETIME-Spalten erhalten keine
ISO-Zeichenketten mit `T`/`Z`. Vertrauenswürdige Zustandskopien behalten die ursprünglichen Treiberwerte der
Wartungstermine. Die Wiederherstellung schreibt diese Werte innerhalb derselben Transaktion nach den regulären
Modell-Hooks, damit deren Formatierung mit der Serverzeitzone weder Zeitpunkte verschiebt noch den
Sommerzeitwechsel verändert. SQL-Datumszeichenketten aus `dateStrings` und `null` bleiben unverändert.
Gemeinsam genutzte Zertifikats- oder Access-List-Graphen werden nicht zurückgeschrieben.

`mariadb-proxy-host-update.spec.js` hat den zuvor fehlenden Fall mit gefülltem `git_last_sync` auf einer echten
MariaDB reproduziert: Nach abgelehnter Nginx-Aktivierung schlug die Kompensation mit DATETIME-Fehler 1292 fehl und
verdeckte den Aktivierungsfehler. Die Regression prüft jetzt die vollständige Host-Zeile, Domain-IDs und
Zeitstempel, Konfigurationsbytes und Dateirechte für lokale, positive und negative Verbindungszeitzonen sowie
`dateStrings`, einschließlich eines Wartungsfensters am Berliner Sommerzeitwechsel. Ein weiterer Fall aktiviert
erfolgreich eine gespeicherte Revision mit Git-Zeitstempel.

## Schnittstellen

| Methode | Pfad                                       | Ergebnis                                                     |
| ------- | ------------------------------------------ | ------------------------------------------------------------ |
| GET     | `/:host_id/revisions`                      | Höchstens 100 autorisierte Versionsmetadaten                 |
| GET     | `/:host_id/revisions/:revision_id/plan`    | Geschützter Vergleich und erwarteter aktueller Fingerabdruck |
| POST    | `/:host_id/revisions/:revision_id/restore` | Aktivierung mit `expected_fingerprint`                       |

## Validierung

`host-revisions.spec.js` führt die echten Datenbankabfragen mit SQLite und eingebettetem PostgreSQL/PGlite aus. Es prüft verschlüsselte Speicherung, Attribution, ausgeblendete Geheimnisse, Eigentümersichtbarkeit, unbekannte Revisionen, veraltete Pläne, geänderte gemeinsam genutzte Autorisierungsdateien und die Wiederherstellung nach fehlgeschlagener Aktivierung. Der Frontend-Test prüft explizite Versionsauswahl, Weitergabe des überprüften Fingerabdrucks und gesperrte Aktionen bei veralteten oder fehlerhaften Plänen.

## Offene Fragen

- Historische Revisionen werden für vorhandene Hosts ab der ersten erfolgreichen Änderung aufgezeichnet; frühere Änderungen werden nicht rekonstruiert.
- Der Vergleich veröffentlicht bewusst keine Rohdirektiven und keine private Schlüsseldatei.

## Verwandte Seiten

- [Proxy-Host](../module/proxy-host.md)
- [Nginx-Engine](../module/nginx-engine.md)
- [Access List](../module/access-lists.md)
