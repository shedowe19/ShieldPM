# Dashboard-Notizen

## Zweck

Kleines Notiz-/Memo-Modul, das Notizen direkt im Dashboard von ShieldPM ablegt. Ideal für Hinweise an andere Admins, ToDo-Listen oder kurzlebige Reminder.

## Kontext

Notizen sind pro Benutzer/Team verfügbar und werden im Dashboard prominent angezeigt. Sie ersetzen keinen Wissensspeicher, sondern dienen als "Sticky Notes" für die Tagespraxis.

## Wichtige Dateien

- `backend/internal/dashboard_note.js` (~103 Zeilen) — Business-Logik (CRUD)
- `backend/models/dashboard_note.js` — Objection.js-Modell
- `backend/routes/dashboard.js` — REST-API unter `/api/dashboard`
- `backend/lib/access/dashboard_notes-*.json` — RBAC-Regeln
- `frontend/src/pages/Dashboard/DashboardNotesWidget.tsx` — UI-Widget
- `frontend/src/modals/DashboardNoteModal.tsx` — Bearbeitungs-Modal
- `frontend/src/api/backend/createDashboardNote.ts`, `updateDashboardNote.ts`, `deleteDashboardNote.ts`, `getDashboardNotes.ts`

## Verhalten

- Benutzer mit entsprechender Berechtigung können Notizen anlegen, bearbeiten und löschen.
- Notizen werden als Liste im Dashboard angezeigt (Widget).
- Felder: Titel, Text (Markdown), Farbe/Status (sofern unterstützt), Timestamps.

## Abhängigkeiten

- `internal/audit-log.js` — Protokollierung
- `lib/access/*` — RBAC

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Verwaltung](../verwaltung/README.md)
- [Audit-Log](../verwaltung/audit-log.md)
