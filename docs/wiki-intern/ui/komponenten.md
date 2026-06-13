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

## Accessibility-Regeln für Komponenten

- Klickbare Navigationselemente und Trigger müssen native interaktive Elemente verwenden (`button`, `a`) statt klickbarer `div`/`span`.
- Icon-only Buttons brauchen lokalisierte zugängliche Namen über `aria-label={intl.formatMessage(...)}`; ein hartcodiertes `title` reicht nicht.
- Radix `Sheet`/`Dialog` Inhalte brauchen neben dem sichtbaren Titel eine `Description` oder explizit `aria-describedby={undefined}`. Für rein erklärende Texte kann `SheetDescription`/`DialogDescription` mit `sr-only` genutzt werden.
- Datei-Inputs dürfen nicht mit `display:none`/`hidden` unbedienbar gemacht werden. Für custom Upload-Buttons wird der echte Input `sr-only` gehalten und über ein sichtbares `label htmlFor=...` ausgelöst. Wenn Input und Label Geschwister sind, nutzt das Pattern `peer sr-only` am Input und `peer-focus-visible:*` am Label für sichtbare Tastatur-Fokuszustände.

## Verwandte Seiten

- [Screens & Pages](./screens.md)
- [Theme & Styling](./theme.md)
