# Dashboard-Notizen

## Zweck

Kleines Notiz-/Memo-Modul, das Notizen direkt im Dashboard von ShieldPM ablegt.

## Kontext

Notizen werden für berechtigte Benutzer derselben Instanz gemeinsam angezeigt. Die Tabelle hat keine Besitzer-ID und
trennt Notizen daher nicht nach Benutzer oder Team. Das Widget erscheint nur mit `dashboard_notes:view`;
Schreibaktionen benötigen `dashboard_notes:manage`.

## Wichtige Dateien

- `backend/internal/dashboard_note.js` — Business-Logik (CRUD)
- `backend/models/dashboard_note.js` — Objection.js-Modell
- `backend/routes/dashboard.js` — REST-API unter `/api/dashboard`
- `backend/lib/access/dashboard_notes-*.json` — RBAC-Regeln
- `frontend/src/pages/Dashboard/DashboardNotesWidget.tsx` — UI-Widget
- `frontend/src/modals/DashboardNoteModal.tsx` — Bearbeitungs-Modal
- `frontend/src/api/backend/createDashboardNote.ts`, `updateDashboardNote.ts`, `deleteDashboardNote.ts`, `getDashboardNotes.ts`

## Verhalten

- Berechtigte Benutzer können Notizen anlegen, bearbeiten und löschen; das Widget liest die Liste sortiert nach `position`.
- Das Schema enthält `content` (Pflichtfeld), `color` (gelb, blau, grün, rot, lila oder grau), `position` sowie Erstellungs- und Änderungszeitstempel. Ein Titel- oder Statusfeld existiert nicht.
- Die Oberfläche zeigt den Inhalt als reinen Text mit erhaltenen Zeilenumbrüchen an; Markdown wird nicht gerendert.
- Anlegen, Ändern und Löschen erzeugen Audit-Einträge vom Objekttyp `dashboard_note`.

## Abhängigkeiten

- `internal/audit-log.js` — Protokollierung
- `lib/access/*` — RBAC

## Offene Fragen

Siehe zentrale Sammelseite [Offene Fragen](../offene-fragen.md).

## Verwandte Seiten

- [Modulübersicht](./README.md)
- [Verwaltung](../verwaltung/README.md)
- [Audit-Log](../verwaltung/audit-log.md)
