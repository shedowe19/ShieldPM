# Audit-Log

## Zweck

Protokollierung sicherheitsrelevanter Ereignisse und administrativer Aktionen.

## Kontext

Um Änderungen im System nachvollziehbar zu machen (z.B. Erstellung eines Proxy-Hosts, Login-Versuche), zeichnet das Audit-Log diese Aktionen auf.

## Wichtige Dateien

- `backend/internal/audit-log.js` (3 KB) — Business-Logik

## Verhalten

- Erfasst die Felder `id`, `action`, `user_id`, `object_id`, `object_type`, `meta`, `created_on` und `modified_on`. (Die IP-Adresse wird nicht erfasst).
- Bietet Methoden zum Abfragen der Logs für Administratoren.

## Abhängigkeiten

- `backend/models/audit-log.js`

## Verwandte Seiten

- [Verwaltungsübersicht](./README.md)
