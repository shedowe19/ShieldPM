# Theme & Styling

## Zweck

Beschreibung des Styling-Systems.

## Technologie

- **Tailwind CSS** v3.4 — Utility-first CSS
- **shadcn/ui** (Radix UI) — Accessible UI-Primitives
- **Framer Motion** — Animationen
- **CSS Modules** — Für spezifische Styles (`.module.css`)

## Konfiguration

- Tailwind: `frontend/tailwind.config.js`
- PostCSS: `frontend/postcss.config.js`
- Basis-CSS: `frontend/src/index.css`
- shadcn/ui Config: `frontend/components.json`

## Theme-Wechsel

- `ThemeSwitcher.tsx` ermöglicht Dark/Light-Mode
- Theme-Präferenz wird im Browser gespeichert

## Icons

- **Lucide React** (`lucide-react`) — Primäre Icon-Bibliothek
- **Tabler Icons** (`@tabler/icons-react`) — Zusätzliche Icons

## Verwandte Seiten

- [Screens & Pages](./screens.md)
- [Komponenten](./komponenten.md)
