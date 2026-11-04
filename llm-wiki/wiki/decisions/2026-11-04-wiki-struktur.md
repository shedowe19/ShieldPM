# Wiki-Struktur: ein Wiki-Root mit Tiefendoku

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Entscheidung hält fest, wie die Dokumentation von ShieldPM organisiert ist:
ein interner Wiki-Root, eine kuratierte Ebene und eine migrierte Tiefendoku.

## Kontext

Das Repository hatte zwei Dokumentationsbestände für Entwickler:

- `docs/wiki-intern/` — umfangreiche deutsche Entwicklerdoku (über 100 Seiten,
  modulweise), in `AGENTS.md` als Langzeitgedächtnis vorgeschrieben. Die frühere
  `agent.md`-Fassung verwies dagegen auf `docs/wiki/`.
- `docs/wiki/` — englische Anwenderdoku im GitHub-Wiki-Format, gespiegelt durch
  `.github/workflows/wiki-sync.yml`.

Das Initialisierungsprompt fordert zusätzlich `llm-wiki/` mit `wiki/index.md`,
`overview.md`, `current-project-state.md`, `tasks.md`, `log.md` und `changelog.md`.
Zwei parallele interne Wikis wären dauerhaft auseinandergelaufen.

## Entscheidung

Es gibt genau **einen** internen Wiki-Root: `llm-wiki/`.

- `llm-wiki/wiki/` enthält die kuratierten Einstiegs- und Syntheseseiten
  (Überblick, Zustand, Aufgaben, Architektur, Backend, Frontend, API, Daten,
  Infrastruktur, Sicherheit, Tests, Module).
- `llm-wiki/wiki/reference/` enthält die aus `docs/wiki-intern/` übernommene
  Tiefendoku. Sie wurde inhaltlich übernommen und nur an Pfaden/Links sowie an
  sechs Seiten redaktionell korrigiert (Beleg: [Log](../log.md)).
- `docs/wiki/` bleibt die öffentliche englische Anwenderdoku; geändert wurde nur
  ein Pfadverweis in `docs/wiki/Development.md`.

`docs/wiki-intern/` existiert nicht mehr. Alle Agenten-Dokumente (`AGENTS.md`,
`GEMINI.md`, `.cursorrules`, `agent.md`, `README.md`) und die Hilfsskripte
verweisen auf den neuen Pfad.

## Alternativen

- **Zwei Wikis parallel betreiben:** hätte zwei Quellen der Wahrheit erzeugt.
- **Alte Doku als `raw/legacy-wiki` einfrieren:** hätte die Modultiefe zu einem
  unveränderlichen Archiv gemacht, obwohl sie weiter gepflegt werden muss.
- **Alte Doku löschen:** hätte über 100 Seiten Wissen vernichtet.

## Konsequenzen

- `llm-wiki/wiki/reference/` ist die migrierte Quellschicht und bewusst keine
  zweite Themenseite: Bei der Duplikatprüfung zählt sie wie eine Quelle. Neue
  Modultiefe gehört hierher, neue Synthesen nach `llm-wiki/wiki/`.
- `llm-wiki/raw/` enthält nur ersetzte Dokumente (derzeit die frühere
  `agent.md`-Fassung) samt Manifest und bleibt unverändert.
- `scripts/wiki-graph.py`, `scripts/sync-verified-dependency-docs.js` und die
  Spellcheck-Ausnahmen zeigen auf `llm-wiki/`.
- Der [Index](../index.md) bleibt der einzige Einstiegspunkt; die Tiefendoku ist
  über [reference/index.md](../reference/index.md) erreichbar.
- `llm-wiki/wiki/reference/` ist bewusst nicht neu formatiert worden, damit der
  Umzug als reine Verschiebung nachvollziehbar bleibt.

## Offene Fragen

- TODO: Nach etwa 20 neuen Seiten prüfen, ob die Grenze zwischen Synthese und
  Tiefe noch sinnvoll liegt (siehe Aufgabe `M-001`).

## Verwandte Seiten

- [Entscheidungen](./README.md)
- [Index](../index.md)
- [Tiefendoku-Index](../reference/index.md)
- [Projektüberblick (Tiefe)](../reference/projekt/ueberblick.md)
- [Wiki-Pflege (Tiefe)](../reference/wiki-pflege.md)
