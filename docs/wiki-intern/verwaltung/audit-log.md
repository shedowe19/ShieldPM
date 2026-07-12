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
- Die Liste ist absteigend nach Erstellungszeit und ID sortiert und auf 100 Treffer begrenzt.
- Das Suchfeld der Audit-Seite sendet `query` an `/api/audit-log`. Der Server sucht vor dieser Begrenzung als Teilzeichenkette in `meta`, `action` und `object_type`; die React-Query-Keys halten Treffer unterschiedlicher Suchbegriffe getrennt.
- Zwei lokale Datumszeitfelder grenzen die Ansicht zusätzlich über die inklusiven UTC-Parameter `created_after` und `created_before` ein. Der Client wandelt die lokale Eingabe in kanonische ISO-8601-UTC-Zeitstempel um; der Server validiert die Zeitstempel und weist umgekehrte Zeiträume ab, bevor er die Datenbankabfrage ausführt.
- Der Aktionsfilter sendet den exakten Parameter `action` an `/api/audit-log`. Der Server validiert ihn wie einen begrenzten Suchparameter und filtert vor dem 100er-Limit; der React-Query-Key trennt auch Treffer unterschiedlicher Aktionen.
- Der Objekttypfilter sendet den exakten Parameter `object_type` an `/api/audit-log`. Der Server validiert und filtert ihn ebenfalls vor dem 100er-Limit. Die Oberfläche verwendet die bereits lokalisierten Audit-Ressourcentypen sowie getrennte Optionen für WireGuard-Peers und -Einstellungen; der React-Query-Key hält diese Ansichten voneinander getrennt.
- Der Button „CSV exportieren“ schreibt ausschließlich die aktuell angezeigten, bereits über `auditlog:list` autorisierten Treffer in eine lokale CSV-Datei. Die Datei übernimmt die gewählten Such-, Zeit-, Aktions- und Objekttypfilter und bleibt damit wie die Tabelle auf höchstens 100 Datensätze begrenzt. Zellen mit möglichen Tabellenformeln (`=`, `+`, `-` oder `@`, auch nach führendem Leerraum) erhalten vor dem CSV-Escaping ein Apostroph, damit Daten aus Audit-Metadaten beim Öffnen nicht als Formel ausgeführt werden.

## Abhängigkeiten

- `backend/models/audit-log.js`

## Verwandte Seiten

- [Verwaltungsübersicht](./README.md)
