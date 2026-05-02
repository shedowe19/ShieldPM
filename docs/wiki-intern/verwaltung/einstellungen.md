# Einstellungen

## Zweck

Verwaltung von globalen Systemeinstellungen und Dashboard-Notizen.

## Kontext

Die Anwendung benötigt globale Konfigurationswerte, die in der Datenbank gespeichert und über die API verwaltet werden.

## Wichtige Dateien

- `backend/internal/setting.js` (3 KB) — Business-Logik für Einstellungen
- `backend/internal/dashboard_note.js` (3 KB) — Business-Logik für Dashboard-Notizen
- `backend/models/setting.js` — Einstellungs-Modell
- `backend/models/dashboard_note.js` — Notiz-Modell

## Verhalten

- `setting.js` ermöglicht das Lesen und Aktualisieren von Systemeinstellungen (z.B. Standard-Seite, Name).
- `dashboard_note.js` speichert und lädt Notizen, die Administratoren auf dem Dashboard sehen können.

## Abhängigkeiten

- Interne Model-Klassen (Objection.js)

## Verwandte Seiten

- [Verwaltungsübersicht](./README.md)
