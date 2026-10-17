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
