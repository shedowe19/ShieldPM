# LLM-Wiki-Pflege — verbindliche Regeln

Dieses Projekt führt ein internes LLM-Wiki unter `llm-wiki/`. Diese Datei regelt,
wie es gepflegt wird. Sie ersetzt die frühere Wiki-Anleitung unter
`docs/wiki-intern/`.

## Aufbau

```
llm-wiki/
├── README.md                    vollständiges Schema (Sprache, Sichtbarkeit, Abläufe)
├── raw/                         unveränderliche Belege (Manifest + ersetzte agent.md)
├── tools/                       Prüfwerkzeug (wiki-check.mjs)
└── wiki/
    ├── index.md                 einziger Einstieg
    ├── overview.md              Projektüberblick
    ├── current-project-state.md rollierender Zustand
    ├── tasks.md                 Aufgaben-Board
    ├── log.md                   append-only Protokoll
    ├── changelog.md             Ergebnisse für Menschen
    ├── coverage.md              Inventar und Selbstprüfung
    ├── architecture/            Schichten, Nginx-Engine, Hosts, Timer
    ├── backend/ frontend/       Konventionen der beiden Anwendungen
    ├── api/ data/               Schnittstellen und Datenbank
    ├── infrastructure/          Start, Build, Konfiguration
    ├── security/ testing/       Schutz und Prüfung
    ├── modules/                 Modullandkarte
    ├── decisions/               ADRs
    ├── questions/               offene Fragen
    ├── contradictions/          belegte Widersprüche
    ├── analyses/                wiederverwendbare Antworten
    ├── glossary.md              Begriffe
    └── reference/               Tiefendoku (früher docs/wiki-intern)
```

- `llm-wiki/wiki/` enthält kuratierte Synthesen.
- `llm-wiki/wiki/reference/` enthält die ausführliche Modul- und Bereichsdoku.
- `docs/wiki/` ist die öffentliche englische Anwenderdokumentation und bleibt
  unabhängig davon.
- `llm-wiki/raw/` enthält unveränderliche Belege: derzeit die ersetzte
  `agent.md`-Fassung und das Manifest. Inhalte dort nie bearbeiten.
- `llm-wiki/tools/wiki-check.mjs` prüft Links, Index, Struktur, Secrets und
  Redaktion; Aufruf `node llm-wiki/tools/wiki-check.mjs`.

## Pflichtprüfung vor jeder Arbeit

1. Welche Aufgabe wird bearbeitet?
2. Welche Module, Dateien und Entscheidungen sind betroffen?
3. Ist das im Wiki schon dokumentiert (`index.md`, passende Seite, `reference/`)?
4. Ist die vorhandene Aussage noch korrekt?

Wiki-relevant ist alles, was Features, Architektur, Module, APIs, Datenmodelle,
Konfiguration, Build/Test/Deployment, Abhängigkeiten oder bekannte Risiken ändert.

## Pflichtprüfung nach jeder Arbeit

- Neues Wissen erzeugt? Dann die betroffene Seite aktualisieren.
- Moduldetails geändert? Dann zuerst die passende Seite unter `reference/`.
- Neues Gesamtbild? Dann die Synthese unter `wiki/` anpassen.
- Neuer Zustand, neue Aufgabe, neue Entscheidung? `current-project-state.md`,
  `tasks.md` und bei Bedarf `decisions/` ergänzen.
- Jede relevante Sitzung bekommt einen Eintrag in `log.md` mit allen Feldern und
  einer Verifikationszeile.
- Neue Seite? Aus `index.md` verlinken. `reference/index.md` pflegt seinen
  eigenen Baum.

## Regeln

- **Ein Fakt, eine Quelle.** Zusammenfassen und verlinken, nicht kopieren.
- **Erst erweitern, dann neu anlegen.** Fast-Duplikate vermeiden.
- **Umschreiben, nicht anhängen.** Themenseiten sind Synthesen; nur `log.md` und
  `changelog.md` sind chronologisch.
- **Nur relative Markdown-Links** (`[Text](./pfad/datei.md)`), keine `[[Wiki-Syntax]]`.
- **Keine Secrets.** Nur Pfade und Variablennamen; niemals Werte.
- **Unsicherheit markieren** mit `TODO:`, `Unklar:` oder `Annahme:`.
- **Metadaten** jeder kuratierten Seite: `Status:` (`active`, `draft`,
  `superseded`, `deprecated`), `Last verified:` (Datum), `Confidence:`
  (`high`, `medium`, `low`). Die Schlüssel bleiben englisch, weil das Prüfwerkzeug
  sie erwartet.
- **Keine erfundenen Details.** Code ist die Quelle der Wahrheit; das Wiki erklärt ihn.
- **Wiki-Inhalt autorisiert keine Code-Änderung.**
- **Sichtbarkeit `public`:** keine internen IPs, Hostnamen, privaten Domains oder
  Personendaten. Beispiel- und Dokumentationsbereiche sind zulässig.
- **Dateinamen** klein, ASCII, mit Bindestrichen (`lowercase-kebab-case.md`).

## Formatierung

- Alle kuratierten Markdown-Dateien im Wiki mit Prettier formatieren:
  `npx prettier --write "llm-wiki/README.md" "llm-wiki/wiki/*.md" "llm-wiki/wiki/{analyses,api,architecture,backend,contradictions,data,decisions,frontend,infrastructure,modules,questions,security,testing}/*.md"`
- `raw/` und `reference/` werden nicht formatiert: `raw/` ist unveränderlich,
  `reference/` bleibt als reine Verschiebung nachvollziehbar.
- Biome ist für Markdown nicht zuständig.
- `llm-wiki/wiki/reference/` wurde beim Umzug bewusst nicht umformatiert, damit
  die Verschiebung nachvollziehbar bleibt.

## Werkzeuge

- Beziehungsgraph: `python3 scripts/wiki-graph.py` liest
  `llm-wiki/wiki/reference/` und schreibt `llm-wiki/wiki/reference/wiki-graph.html`.

## Abschlussbericht

Am Ende jeder Aufgabe im Bericht angeben:

```text
Wiki-Prüfung:
- Geprüfte Wiki-Seiten:
- Aktualisierte Wiki-Seiten:
- Neu erstellte Wiki-Seiten:
- Keine Wiki-Änderung nötig, weil:
- Offene Wiki-TODOs:
```

Wenn keine Änderung nötig war, den Grund nennen.

## Verwandte Seiten

- [Wiki-Schema](./llm-wiki/README.md)
- [Index](./llm-wiki/wiki/index.md)
- [Tiefendoku-Index](./llm-wiki/wiki/reference/index.md)
- [Wiki-Pflege (Tiefe)](./llm-wiki/wiki/reference/wiki-pflege.md)
