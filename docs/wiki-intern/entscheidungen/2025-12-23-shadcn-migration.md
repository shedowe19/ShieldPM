# ADR: Migration zu Shadcn UI & Radix Primitives

## Titel

Austausch des bestehenden UI-Frameworks durch `shadcn/ui` (basierend auf Tailwind CSS und Radix UI).

## Status

`Akzeptiert` (Implementiert am 23.12.2025 in PR #145)

## Kontext

Das ShieldPM Frontend nutzte anfangs proprietäre UI-Komponenten oder Standard-Tailwind-Klassen. Dies führte zu Inkonsistenzen bei Formularen, Modals, Dropdowns und Barrierefreiheit (Accessibility/A11y). Das Fehlen einer einheitlichen Komponenten-Bibliothek verlangsamte die Entwicklung neuer Features.

## Entscheidung

Das Frontend wurde vollständig auf `shadcn/ui` umgestellt.

- Alle primitiven Komponenten (Buttons, Inputs, Dialogs, Selects, Toasts) wurden durch Shadcn-Pendants ersetzt.
- Die Abhängigkeit zu `@radix-ui/react-*` wurde aufgenommen, um W3C-konforme Accessibility sicherzustellen.
- Tailwind CSS bleibt die Basis für das Styling, jedoch nun orchestriert durch die `shadcn/ui` Utilities (`cn()`, `clsx`, `tailwind-merge`).

## Begründung

- **Accessibility:** Radix UI garantiert Keyboard-Navigation und Screenreader-Support out of the box.
- **Konsistenz:** Einheitliches Design-System für das gesamte Dashboard.
- **Flexibilität:** Im Gegensatz zu Bootstrap oder Material-UI liefert `shadcn/ui` den Quellcode direkt ins Projekt (`components/ui/`), sodass jede Komponente ohne Hacks angepasst werden kann.

## Konsequenzen

### Positiv

- Deutlich verbesserte User Experience und Accessibility.
- Beschleunigte Frontend-Entwicklung für kommende Features (wie Tor, Terminal, Cloudflare).

### Negativ

- Die Migration war extrem aufwendig und berührte hunderte Dateien.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
