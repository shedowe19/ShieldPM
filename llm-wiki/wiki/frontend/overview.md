# Frontend

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite erklärt Aufbau und Konventionen der React-SPA: Routing, Datenabruf,
Berechtigungen, Formulare, Internationalisierung und Styling.

## Was existiert

```
frontend/src/
├── Router.tsx        Routen, Lazy-Loading, Berechtigungsschutz
├── App.tsx           Provider und Layout
├── api/              React-Query-Client und Hooks (137 Dateien)
├── components/       Wiederverwendbare UI (130 Dateien)
├── modals/           Dialoge (113 Dateien)
├── pages/            Seiten (163 Dateien)
├── hooks/            eigene Hooks (60 Dateien)
├── context/          Auth-, Theme-, Locale-Kontext
├── locale/           i18n-Ressourcen und Sprachliste
├── modules/          AuthStore, Permissions, Validations
├── notifications/    Toast-Ausgabe
└── types/            gemeinsame Typen
```

## Wie es funktioniert

- **Routing:** `Router.tsx` lädt jede Seite per `React.lazy()`. Einzelne Routen
  sind mit `HasPermission` geschützt; ein zentraler `RouteErrorBoundary` um den
  Routenbaum fängt Fehler (`Router.tsx:20-120,233`).
- **Berechtigungen:** `src/modules/Permissions.ts` definiert Bereiche und Aktionen;
  `HasPermission` ersetzt Routen ohne Recht durch einen Fehler-Alert und blendet
  Aktionen mit `hideError` still aus.
- **Datenabruf:** ausschließlich über React-Query-Hooks in `src/api/`. Einzige
  Ausnahme: statische Hilfe-Markdown-Dateien lädt `modals/HelpContent.tsx:23`
  direkt per `fetch`.
- **Formulare:** Mischung aus Formik und React Hook Form + Zod; neue Formulare
  sollen React Hook Form + Zod nutzen (`.cursorrules:175`).
- **Animation:** `framer-motion`, Seitenübergänge über `AnimatePresence`.

## UI und Styling

- Tailwind CSS 4.3 mit shadcn/ui-Komponenten auf Radix-Basis.
- Icons aus `@tabler/icons-react` und `lucide-react`; keine weiteren Icon-Pakete.
- Theme-Umschalter und Farben: `frontend/src/components/ThemeSwitcher.tsx`,
  `frontend/src/index.css`.

## Internationalisierung

- 13 Sprachen: `bg, de, en, es, it, ja, ko, nl, pl, ru, sk, vi, zh`
  (`frontend/src/locale/lang/`).
- `lang-list.json` beschreibt die auswählbaren Sprachen.
- Neue UI-Texte brauchen mindestens einen Eintrag in `en.json`
  (`.cursorrules:190`).
- `frontend/check-locales.cjs` und `check-locales.test.ts` prüfen Vollständigkeit.

## Tests

- Vitest mit Testing Library, DOM-Umgebung `happy-dom`
  (`frontend/package.json:101,112,123`).
- Playwright für Browser-Smoke-Tests unter `frontend/e2e/`.
- Build-Prüfung: `yarn build` führt `tsc` und `vite build` aus
  (`frontend/package.json:21`).

## Risiken und Stolperfallen

- **Lazy-Loading:** Eine Seite ohne `React.lazy()` vergrößert das Startbundle und
  bricht die Bundle-Budget-Prüfung.
- **Direkter `fetch`:** umgeht Fehlerbehandlung, CSRF-Header und Query-Cache.
- **Fehlende Übersetzung:** `en.json` ist Pflicht, sonst zeigt die UI den Schlüssel.
- **Neue UI-Bibliothek:** nicht erlaubt; shadcn/ui und Radix erweitern.
- **Modal-Reste:** Dialoge müssen beim Schließen ihren Zustand zurücksetzen, sonst
  erscheint ein alter Entwurf erneut.

## Offene Fragen

- Unklar: Ob die Formik-Bestände mittelfristig vollständig auf React Hook Form
  migriert werden. `confidence: low`.

## Verwandte Seiten

- [Architektur](../architecture/overview.md)
- [API-Überblick](../api/overview.md)
- [Screens (Tiefe)](../reference/ui/screens.md)
- [Frontend-Internas (Tiefe)](../reference/ui/frontend-internas.md)
- [i18n (Tiefe)](../reference/ui/i18n.md)
