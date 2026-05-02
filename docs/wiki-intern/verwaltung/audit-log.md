# Audit-Log

## Zweck

Protokollierung sicherheitsrelevanter Ereignisse und administrativer Aktionen.

## Kontext

Um Änderungen im System nachvollziehbar zu machen (z.B. Erstellung eines Proxy-Hosts, Login-Versuche), zeichnet das Audit-Log diese Aktionen auf.

## Wichtige Dateien

- `backend/internal/audit-log.js` (3 KB) — Business-Logik

## Verhalten

- Erfasst den ausführenden Benutzer, die Aktion, das betroffene Objekt und die IP-Adresse.
- Bietet Methoden zum Abfragen der Logs für Administratoren.

## Abhängigkeiten

- `backend/models/audit_log.js`

## Verwandte Seiten

- [Verwaltungsübersicht](./README.md)
