# Audit-Log

## Zweck

Protokollierung sicherheitsrelevanter Ereignisse und administrativer Aktionen.

## Kontext

Um Änderungen im System nachvollziehbar zu machen (z.B. Erstellung eines Proxy-Hosts, Login-Versuche), zeichnet das Audit-Log diese Aktionen auf.

## Wichtige Dateien

- `backend/internal/audit-log.js` (3 KB) — Business-Logik
- `backend/routes/audit-log.js` — geschützte REST-Abfrage unter `/api/audit-log`
- `frontend/src/hooks/useAuditLogs.ts` — React-Query-Zugriff mit suchspezifischem Cache-Key
- `frontend/src/pages/AuditLog/TableWrapper.tsx` — Audit-Tabelle, Filter und CSV-Export
- `frontend/src/pages/AuditLog/audit-log-csv.ts` — sichere lokale CSV-Serialisierung

## Verhalten

- Erfasst die Felder `id`, `action`, `user_id`, `object_id`, `object_type`, `meta`, `created_on` und `modified_on`. (Die IP-Adresse wird nicht erfasst).
- Die Listen- und Detailabfrage verlangen serverseitig `auditlog:list`.
- Die Liste ist absteigend nach Erstellungszeit und ID sortiert. Bestehende API-Aufrufe ohne Paginierungsparameter bleiben aus Kompatibilitätsgründen auf 100 Treffer begrenzt. Mit `page` und/oder `limit` (je 1–100) liefert die API `items` samt `pagination`-Metadaten; alle Filter laufen vor der Seitenbildung. Die Audit-Ansicht lädt damit stets 100 Ereignisse pro Seite und ermöglicht die Navigation über den gesamten autorisierten Trefferbestand.
- Das Suchfeld der Audit-Seite sendet `query` an `/api/audit-log`. Der Server sucht vor dieser Begrenzung als Teilzeichenkette in `meta`, `action` und `object_type`; die React-Query-Keys halten Treffer unterschiedlicher Suchbegriffe getrennt.
- Zwei lokale Datumszeitfelder grenzen die Ansicht zusätzlich über die inklusiven UTC-Parameter `created_after` und `created_before` ein. Der Client wandelt die lokale Eingabe in kanonische ISO-8601-UTC-Zeitstempel um; der Server validiert die Zeitstempel und weist umgekehrte Zeiträume ab, bevor er die Datenbankabfrage ausführt.
- Der Aktionsfilter sendet den exakten Parameter `action` an `/api/audit-log`. Der Server validiert ihn wie einen begrenzten Suchparameter und filtert vor dem 100er-Limit; der React-Query-Key trennt auch Treffer unterschiedlicher Aktionen.
- Der Objekttypfilter sendet den exakten Parameter `object_type` an `/api/audit-log`. Der Server validiert und filtert ihn ebenfalls vor dem 100er-Limit. Die Oberfläche verwendet die bereits lokalisierten Audit-Ressourcentypen sowie getrennte Optionen für WireGuard-Peers und -Einstellungen; der React-Query-Key hält diese Ansichten voneinander getrennt.
- Die positiven ID-Filter `user_id` und `object_id` grenzen die Liste zusätzlich auf den handelnden Benutzer beziehungsweise das betroffene Objekt ein. Server und OpenAPI validieren beide Werte als ganze IDs ab 1; die Datenbankfilter laufen vor dem 100er-Limit und die React-Query-Keys trennen auch diese Kombinationen.
- Die Zeilenaktionen der Audit-Tabelle können eine Untersuchung ohne manuelle ID-Eingabe auf den handelnden Benutzer oder dasselbe Objekt verengen. Die Objektaktion übernimmt immer `object_type` und `object_id` gemeinsam, damit gleichlautende IDs verschiedener Ressourcentypen nicht vermischt werden; bereits aktive Filter bleiben erhalten und die Ansicht wechselt auf die erste Ergebnisseite.
- Die Audit-Ansicht übernimmt Suche, Aktion, Objekttyp, IDs, Zeitfenster und Seite aus der URL und hält sie bei jeder Bedienung aktuell. Damit können Administratoren eine gefilterte Untersuchung als Link teilen oder später direkt wieder öffnen; Zeitfenster werden dafür als kanonische UTC-Zeitstempel gespeichert und im lokalen Datumszeitfeld dargestellt. Es gelten unverändert ausschließlich `auditlog:list` und die vorhandenen serverseitigen Parameterprüfungen.
- Bei aktiven Filtern entfernt der lokalisierte Button „Filter zurücksetzen“ alle Untersuchungsparameter aus der URL und lädt wieder die erste, ungefilterte Seite. Er ändert keine Audit-Daten und verwendet unverändert ausschließlich die bereits durch `auditlog:list` autorisierte Abfrage.
- Der Button „CSV exportieren“ schreibt ausschließlich die aktuell angezeigte, bereits über `auditlog:list` autorisierte Seite in eine lokale CSV-Datei. Die Datei übernimmt die gewählten Such-, Zeit-, Aktions-, Objekttyp- sowie Benutzer- und Objekt-ID-Filter und bleibt damit wie die Tabelle auf höchstens 100 Datensätze begrenzt. Zellen mit möglichen Tabellenformeln (`=`, `+`, `-` oder `@`, auch nach führendem Leerraum) erhalten vor dem CSV-Escaping ein Apostroph, damit Daten aus Audit-Metadaten beim Öffnen nicht als Formel ausgeführt werden.
- Der Detaildialog kann die angezeigten Metadaten lokal in die Zwischenablage kopieren. Im Demo-Modus übernimmt er dabei dieselbe IP-Maskierung wie der JSON-Editor und übergibt keine unverdeckten Demo-Werte. Bei nicht verfügbarer oder abgelehnter Zwischenablage erscheint ein lokalisierter Fehlerhinweis. Die Aktion nutzt keine zusätzliche API und bleibt damit auf Daten beschränkt, die bereits mit `auditlog:list` autorisiert geladen wurden.

## Abhängigkeiten

- `backend/models/audit-log.js`

## Verwandte Seiten

- [Verwaltungsübersicht](./README.md)
