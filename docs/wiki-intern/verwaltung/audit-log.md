# Audit-Log

## Zweck

Protokollierung sicherheitsrelevanter Ereignisse und administrativer Aktionen.

## Kontext

Um Änderungen im System nachvollziehbar zu machen (z.B. Erstellung eines Proxy-Hosts, Login-Versuche), zeichnet das Audit-Log diese Aktionen auf.

## Wichtige Dateien

- `backend/internal/audit-log.js` (3 KB) — Business-Logik
- `backend/routes/audit-log.js` — geschützte REST-Abfrage unter `/api/audit-log`
- `frontend/src/hooks/useAuditLogs.ts` — React-Query-Zugriff mit suchspezifischem Cache-Key
- `frontend/src/pages/AuditLog/TableWrapper.tsx` — Audit-Tabelle und Suchfeld

## Verhalten

- Erfasst die Felder `id`, `action`, `user_id`, `object_id`, `object_type`, `meta`, `created_on` und `modified_on`. (Die IP-Adresse wird nicht erfasst).
- Die Listen- und Detailabfrage verlangen serverseitig `auditlog:list`.
- Die Liste ist absteigend nach Erstellungszeit und ID sortiert und auf 100 Treffer begrenzt.
- Das Suchfeld der Audit-Seite sendet `query` an `/api/audit-log`. Der Server sucht vor dieser Begrenzung als Teilzeichenkette in `meta`, `action` und `object_type`; die React-Query-Keys halten Treffer unterschiedlicher Suchbegriffe getrennt.
- Zwei lokale Datumszeitfelder grenzen die Ansicht zusätzlich über die inklusiven UTC-Parameter `created_after` und `created_before` ein. Der Client wandelt die lokale Eingabe in kanonische ISO-8601-UTC-Zeitstempel um; der Server validiert die Zeitstempel und weist umgekehrte Zeiträume ab, bevor er die Datenbankabfrage ausführt.

## Abhängigkeiten

- `backend/models/audit-log.js`

## Verwandte Seiten

- [Verwaltungsübersicht](./README.md)
