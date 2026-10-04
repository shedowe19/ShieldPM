# Audit-Log

## Zweck

Protokollierung sicherheitsrelevanter Ereignisse und administrativer Aktionen.

## Kontext

Um Änderungen im System nachvollziehbar zu machen (z. B. die Erstellung eines Proxy-Hosts), schreiben Fachservices Audit-Einträge. Anmeldeversuche oder Chat-Nachrichten sind nicht automatisch Teil dieser Tabelle. Für einen manipulationssicheren Nachweis oder ein vollständiges Security-Log ist die Tabelle allein nicht ausgelegt.

## Wichtige Dateien

- `backend/internal/audit-log.js` — Business-Logik und DDNS-Metadatenredaktion
- `backend/test/internal/audit-log-ddns-redaction.spec.js` — neue Audit-Snapshots und historische DDNS-Abfragen ohne Änderung von Providerdaten oder Historie
- `backend/routes/audit-log.js` — geschützte REST-Abfrage unter `/api/audit-log`
- `frontend/src/hooks/useAuditLogs.ts` — React-Query-Zugriff mit suchspezifischem Cache-Key
- `frontend/src/pages/AuditLog/TableWrapper.tsx` — Audit-Tabelle, Filter und CSV-Export
- `frontend/src/pages/AuditLog/audit-log-csv.ts` — sichere lokale CSV-Serialisierung
- `frontend/src/components/Table/Formatter/EventFormatter.tsx`, `frontend/src/types/enums.ts` — Ereignisnamen, Objektmetadaten und Symbolzuordnung
- `frontend/src/lib/audit-log-object-types.ts` — gemeinsame lokalisierte Objekttypen für Ereignisüberschriften und Filter
- `frontend/src/lib/audit-log-object-types.test.ts` — Abgleich mit allen tatsächlichen Backend-Literalemittern und Fallback-Prüfungen

## Verhalten

- Erfasst die Felder `id`, `action`, `user_id`, `object_id`, `object_type`, `meta`, `created_on` und `modified_on`. Ein eigenes Feld für die IP-Adresse der API-Anfrage ist nicht vorgesehen.
- Der Objekttyp `firewall-list` erscheint mit Schildsymbol, übersetztem Namen „Firewall-Liste“ beziehungsweise „Firewall List“ und dem Listennamen aus `meta.name`; er ist auch im Objekttypfilter auswählbar. Erstellen, Bearbeiten und Löschen verwenden `created`, `updated` und `deleted`; ein erfolgreicher manueller Refresh verwendet ebenfalls `updated`. Fehlt der Listenname, zeigt die Oberfläche `N/A`.
- Die Oberfläche erkennt alle aktuell vom Backend emittierten Objekttypen sowie den bereits unterstützten Typ `terminal-host`. Ereignisüberschrift und Objekttypfilter verwenden dieselbe Übersetzungszuordnung, insbesondere für Cloudflare-Tunnels, Terminal-Hosts und WireGuard. Zertifikatserneuerungen verwenden die bestehende Aktion `renewed`.
- WireGuard-Peers und Servereinstellungen verwenden `wireguard-peer` beziehungsweise `wireguard-settings` mit Schildsymbol. Das Peer-Badge zeigt ausschließlich `meta.name` oder den lokalisierten Ersatz „Peer #ID“; Einstellungen erhalten einen festen lokalisierten Titel. Die Zeilenkennzeichnung liest keine Schlüssel oder Konfigurationen aus Metadaten. Aktivieren und Deaktivieren eines Peers bleiben `updated`; `meta.status` unterscheidet `enabled` und `disabled`.
- Nicht erkannte oder fehlende Objekttypen erhalten eine generische lokalisierte Ereignisüberschrift und ein lokalisiertes Badge mit dem ursprünglichen Typ beziehungsweise `N/A`. Andere Metadaten werden dafür nicht als vermeintliche Objektbezeichnung interpretiert.
- Für den exakten Objekttyp `ddns-provider` wird ausschließlich `meta.config` aus neuen Audit-Snapshots und aus den Antworten bestehender Detail-, Listen- und paginierter Abfragen entfernt. Die Redaktion verwendet Kopien; gespeicherte Audit-Historie, tatsächliche Providerkonfiguration und andere Metafelder bleiben unverändert. Andere Objekttypen werden nicht redigiert.
- Die Listen- und Detailabfrage verlangen serverseitig `auditlog:list`.
- Die Liste ist absteigend nach Erstellungszeit und ID sortiert. Bestehende API-Aufrufe ohne Paginierungsparameter bleiben aus Kompatibilitätsgründen auf 100 Treffer begrenzt. Mit `page` und/oder `limit` (je 1–100) liefert die API `items` samt `pagination`-Metadaten; alle Filter laufen vor der Seitenbildung. Die Audit-Ansicht lädt damit stets 100 Ereignisse pro Seite und ermöglicht die Navigation über den gesamten autorisierten Trefferbestand.
- Das Suchfeld der Audit-Seite sendet `query` an `/api/audit-log`. Der Server sucht vor dieser Begrenzung als Teilzeichenkette in `meta`, `action` und `object_type`; die React-Query-Keys halten Treffer unterschiedlicher Suchbegriffe getrennt.
- Zwei lokale Datumszeitfelder grenzen die Ansicht zusätzlich über die inklusiven UTC-Parameter `created_after` und `created_before` ein. Der Client wandelt die lokale Eingabe in kanonische ISO-8601-UTC-Zeitstempel um; der Server validiert die Zeitstempel und weist umgekehrte Zeiträume ab, bevor er die Datenbankabfrage ausführt.
- Der Aktionsfilter sendet den exakten Parameter `action` an `/api/audit-log`. Der Server validiert ihn wie einen begrenzten Suchparameter und filtert vor dem 100er-Limit; der React-Query-Key trennt auch Treffer unterschiedlicher Aktionen.
- Der Objekttypfilter sendet den exakten Parameter `object_type` an `/api/audit-log`. Der Server validiert und filtert ihn ebenfalls vor dem 100er-Limit. Die Oberfläche verwendet die bereits lokalisierten Audit-Ressourcentypen sowie getrennte Optionen für WireGuard-Peers und -Einstellungen; der React-Query-Key hält diese Ansichten voneinander getrennt.
- Die positiven ID-Filter `user_id` und `object_id` grenzen die Liste zusätzlich auf den handelnden Benutzer beziehungsweise das betroffene Objekt ein. Server und OpenAPI validieren beide Werte als ganze IDs ab 1; die Datenbankfilter laufen vor dem 100er-Limit und die React-Query-Keys trennen auch diese Kombinationen.
- Die Zeilenaktionen der Audit-Tabelle können eine Untersuchung ohne manuelle ID-Eingabe auf den handelnden Benutzer oder dasselbe Objekt verengen. Die Objektaktion übernimmt immer `object_type` und `object_id` gemeinsam, damit gleichlautende IDs verschiedener Ressourcentypen nicht vermischt werden; bereits aktive Filter bleiben erhalten und die Ansicht wechselt auf die erste Ergebnisseite. Beide Filterbuttons verwenden wie die Detailaktion die Icon-Größe des Buttons, damit deren Symbole in den kompakten Aktionen sichtbar bleiben.
- Die Audit-Ansicht übernimmt Suche, Aktion, Objekttyp, IDs, Zeitfenster und Seite aus der URL und hält sie bei jeder Bedienung aktuell. Damit können Administratoren eine gefilterte Untersuchung als Link teilen oder später direkt wieder öffnen; Zeitfenster werden dafür als kanonische UTC-Zeitstempel gespeichert und im lokalen Datumszeitfeld dargestellt. Es gelten unverändert ausschließlich `auditlog:list` und die vorhandenen serverseitigen Parameterprüfungen.
- Bei aktiven Filtern entfernt der lokalisierte Button „Filter zurücksetzen“ alle Untersuchungsparameter aus der URL und lädt wieder die erste, ungefilterte Seite. Er ändert keine Audit-Daten und verwendet unverändert ausschließlich die bereits durch `auditlog:list` autorisierte Abfrage.
- Der Button „CSV exportieren“ schreibt ausschließlich die aktuell angezeigte, bereits über `auditlog:list` autorisierte Seite in eine lokale CSV-Datei. Die Datei übernimmt die gewählten Such-, Zeit-, Aktions-, Objekttyp- sowie Benutzer- und Objekt-ID-Filter und bleibt damit wie die Tabelle auf höchstens 100 Datensätze begrenzt. Zellen mit möglichen Tabellenformeln (`=`, `+`, `-` oder `@`, auch nach führendem Leerraum) erhalten vor dem CSV-Escaping ein Apostroph, damit Daten aus Audit-Metadaten beim Öffnen nicht als Formel ausgeführt werden.
- Der Detaildialog kann die angezeigten Metadaten lokal in die Zwischenablage kopieren. Im Demo-Modus übernimmt er dabei dieselbe IP-Maskierung wie der JSON-Editor und übergibt keine unverdeckten Demo-Werte. Bei nicht verfügbarer oder abgelehnter Zwischenablage erscheint ein lokalisierter Fehlerhinweis. Die Aktion nutzt keine zusätzliche API und bleibt damit auf Daten beschränkt, die bereits mit `auditlog:list` autorisiert geladen wurden.

SQLite speichert die historischen Audit-Zeitstempel als lokale Zeit mit einem Leerzeichen zwischen Datum und Uhrzeit. Die UTC-Zeitfilter vergleichen deshalb numerische Julianische Zeitwerte einschließlich der lokalen UTC-Umrechnung; ein lexikalischer Vergleich mit dem ISO-8601-Parameter würde gültige Ereignisse desselben Tages ausblenden. Ein Regressionstest prüft beide inklusiven Grenzen gegen eine echte SQLite-Datenbank.

## Abhängigkeiten

- `backend/models/audit-log.js`

## Verwandte Seiten

- [Verwaltungsübersicht](./README.md)
- [IP-Firewall](../module/ip-firewall.md)
- [WireGuard](../module/wireguard.md)
- [DDNS](../module/ddns.md)
