# UI-Komponenten

## Zweck

Übersicht der wiederverwendbaren Frontend-Komponenten.

## Basis-Komponenten (shadcn/ui)

Pfad: `frontend/src/components/ui/`

| Komponente            | Datei                            |
| --------------------- | -------------------------------- |
| Alert                 | `alert.tsx`                      |
| Avatar                | `avatar.tsx`                     |
| Badge                 | `badge.tsx`                      |
| Button                | `button.tsx`                     |
| Card                  | `card.tsx`                       |
| Checkbox              | `checkbox.tsx`                   |
| Dialog                | `dialog.tsx`                     |
| Dropdown Menu         | `dropdown-menu.tsx`              |
| Form                  | `form.tsx`                       |
| Input                 | `input.tsx`                      |
| Label                 | `label.tsx`                      |
| Popover               | `popover.tsx`                    |
| Scroll Area           | `scroll-area.tsx`                |
| Select                | `select.tsx`                     |
| Separator             | `separator.tsx`                  |
| Sheet                 | `sheet.tsx`                      |
| Skeleton              | `skeleton.tsx`                   |
| Switch                | `switch.tsx`                     |
| Table                 | `table.tsx`                      |
| Tabs                  | `tabs.tsx`                       |
| Textarea              | `textarea.tsx`                   |
| Toast / Toaster       | `toast.tsx`, `toaster.tsx`       |
| Toggle / Toggle Group | `toggle.tsx`, `toggle-group.tsx` |
| Tooltip               | `tooltip.tsx`                    |

## Projekt-Komponenten

| Komponente       | Datei                  | Beschreibung                     |
| ---------------- | ---------------------- | -------------------------------- |
| Sidebar          | `Sidebar.tsx`          | Navigationsleiste                |
| SiteHeader       | `SiteHeader.tsx`       | Kopfzeile mit Benutzermenü       |
| SiteFooter       | `SiteFooter.tsx`       | Fußzeile mit Versionsinformation |
| SiteMenu         | `SiteMenu.tsx`         | Hauptmenü                        |
| SiteContainer    | `SiteContainer.tsx`    | Layout-Wrapper                   |
| AnimatedPage     | `AnimatedPage.tsx`     | Seitenübergangs-Animation        |
| Loading          | `Loading.tsx`          | Ladeindikator                    |
| LoadingPage      | `LoadingPage.tsx`      | Lade-Seite                       |
| EmptyData        | `EmptyData.tsx`        | Leerzustand-Anzeige              |
| ErrorNotFound    | `ErrorNotFound.tsx`    | 404-Seite                        |
| ThemeSwitcher    | `ThemeSwitcher.tsx`    | Dark/Light-Mode                  |
| LocalePicker     | `LocalePicker.tsx`     | Sprachauswahl                    |
| ServiceIcon      | `ServiceIcon.tsx`      | Service-Icons (Auto-Detect)      |
| NavLink          | `NavLink.tsx`          | Navigations-Link                 |
| Flag             | `Flag.tsx`             | Länderflaggen                    |
| HasPermission    | `HasPermission.tsx`    | Berechtigungsprüfung             |
| NoteWarning      | `NoteWarning.tsx`      | Warnhinweise                     |
| Button           | `Button.tsx`           | Erweiterter Button               |
| GitSyncTab       | `GitSyncTab.tsx`       | GitOps-Tab                       |
| AnubisRulesField | `AnubisRulesField.tsx` | Anubis-Regeleditor               |
| Unhealthy        | `Unhealthy.tsx`        | Gesundheitsstatus                |

## Spezial-Komponenten (Ordner)

| Ordner       | Beschreibung               |
| ------------ | -------------------------- |
| `AiChat/`    | AI-Chat-Interface          |
| `Analytics/` | Analytics-Visualisierungen |
| `Form/`      | Formular-Komponenten       |
| `Nginx/`     | Nginx-spezifische UI       |
| `Table/`     | Tabellen-Komponenten       |

## Fehlerbehandlung bei Git-Sync und WireGuard

- `GitSyncTab.tsx` verlangt eine Repository-URL nur bei aktivierter automatischer Synchronisierung. Ein lokal
  bereitgestellter Host kann deshalb auch nach dem Öffnen dieses Tabs ohne Git-Konfiguration gespeichert werden.
  Manuelle Synchronisierungen prüfen das fachliche `success`-Feld der HTTP-200-Antwort; ein gemeldeter Git-Fehler oder
  Transportfehler erzeugt eine Fehlermeldung statt einer Erfolgsmeldung. `GitSyncTab.test.tsx` prüft beide Formularfälle
  sowie Erfolg, fachlichen Fehler und Transportfehler.
- `Nginx/WireguardConfigModal.tsx` zeigt fehlgeschlagene Konfigurationsabfragen im Dialog an und lässt den Download
  dabei gesperrt. Die Kopierbestätigung erscheint erst nach erfolgreichem Schreiben in die Zwischenablage. Bei einem
  Peerwechsel oder Schließen werden verspätete Kopierantworten ignoriert und der Bestätigungstimer entfernt;
  Clipboard-Fehler nutzen die bestehende Toast-Fehlermeldung. Die Dialogtests prüfen Ablehnung, Peerwechsel und Cleanup.

## Fehler beim Laden von Oberflächen

`RouteErrorBoundary.tsx` zeigt einen lokalisierten Fehler mit Neuladen-Aktion und fokussiert die Fehlerüberschrift.
Der Router verwendet diese Grenze auch für die erstmalige Einrichtung, zusammen mit einem `Suspense`-Ladebildschirm.
Damit kann ein fehlgeschlagener Setup-Chunk beim ersten Start nicht den gesamten React-Baum beenden.
`Router.test.tsx` prüft die Einrichtung zusätzlich zu den öffentlichen und angemeldeten Routen.

Der aus der Sidebar gestartete KI-Chat besitzt dieselbe Fehlergrenze ausschließlich um seinen dynamischen Inhalt.
Seine Fehlermeldung erscheint separat; Navigation und aktive Seite bleiben verfügbar. Siehe [AI-Agent](../module/ai-agent.md).

## Verwandte Seiten

- [Screens & Pages](./screens.md)
- [Theme & Styling](./theme.md)
