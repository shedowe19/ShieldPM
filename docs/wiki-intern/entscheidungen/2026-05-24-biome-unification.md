# ADR: Linter- & Formatter-Konsolidierung auf Biome

## Titel

Migration von ESLint/Prettier auf Biome als einheitliches Tooling für das gesamte Monorepo.

## Status

`Akzeptiert`

## Kontext

Das Projekt ShieldPM nutzte historisch eine heterogene Tooling-Landschaft für Code-Qualität:

- Frontend: ESLint + Prettier
- Backend: ESLint + Prettier
  Die Konfigurationen waren teilweise inkonsistent, die Ausführung (insbesondere im CI/CD-Prozess) war relativ langsam und erforderte zahlreiche Node-Module (ESLint-Plugins, Prettier-Konfigurationen).

## Entscheidung

Es wurde entschieden (PR #100 `feature/biome-unification`), sämtliche ESLint- und Prettier-Konfigurationen für TypeScript- und JavaScript-Code im Frontend und Backend durch **Biome** (`@biomejs/biome`) zu ersetzen.
Eine zentrale `biome.json` im Root-Verzeichnis steuert nun die Formatierung und das Linting für das gesamte Projekt.

_Ausnahme:_ Für Markdown-Dateien im `docs/wiki-intern/` wird weiterhin temporär Prettier verwendet, wie in den internen Wiki-Regeln definiert, da Biomes Markdown-Support noch nicht alle Projektanforderungen abdeckt.

## Begründung

- **Performance:** Biome (in Rust geschrieben) ist signifikant schneller beim Formatieren und Linten als die Node.js-basierten Vorgänger.
- **Konsistenz:** Eine einzige `biome.json` im Root reduziert die Komplexität gegenüber getrennten `.eslintrc` und `.prettierrc` Dateien im Frontend und Backend.
- **Wartbarkeit:** Weniger npm-Abhängigkeiten bedeuten weniger Sicherheitswarnungen (Dependabot) und schnellere `yarn install`-Zeiten (insbesondere in Kombination mit dem Wechsel auf Yarn v4).

## Alternativen

- Beibehalten von ESLint + Prettier: Wurde verworfen, da die Wartung von zwei getrennten Konfigurationssilos ineffizient wurde.
- Nutzung von Deno Linter / Rome: Rome ist das Vorgängerprojekt von Biome und nicht mehr aktiv.

## Konsequenzen

### Positiv

- Drastisch reduzierte CI-Zeiten für den Lint-Step.
- Einheitlicher Code-Style über Backend und Frontend hinweg.
- Weniger Dependencies im `package.json`.

### Negativ

- Entwickler müssen gegebenenfalls ihre IDE-Erweiterungen anpassen (Biome-Extension statt ESLint/Prettier).
- Biome unterstützt (noch) nicht alle Rand-Fälle von ESLint-Custom-Plugins, diese müssen im ShieldPM-Code umgangen oder refactored werden.

## Verwandte Seiten

- [ADR-Übersicht](./README.md)
- [Wiki-Pflege](../wiki-pflege.md) (Ausnahme: Prettier für Markdown)
