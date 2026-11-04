# ShieldPM LLM Wiki

Language: German
Visibility: public
Scope: full filtered
Schema: 1
Created: 2026-11-04
Last updated: 2026-11-04

## Zweck

Dieses Wiki ist das dauerhafte, wachsende Gedächtnis von ShieldPM. Es liegt
zwischen den Rohquellen (Code, Konfiguration, bestehende Dokumentation) und dem
Leser. Es ist kein RAG-Index: zuerst den Index lesen, dann die passenden Seiten.

Das Wiki ist der einzige interne Wiki-Einstieg. Die frühere Tiefendoku wurde nach
`llm-wiki/wiki/reference/` übernommen und nur an Pfaden, Links und redaktionell
angepasst; `docs/wiki/` bleibt die öffentliche englische Anwenderdokumentation.

| Ebene                  | Pfad                       | Rolle                                                    |
| ---------------------- | -------------------------- | -------------------------------------------------------- |
| Agenten-Vertrag        | `llm-wiki/`                | Einstieg, Zustand, Aufgaben, Log, Architektur-Synthesen  |
| Kuratierte Seiten      | `llm-wiki/wiki/`           | Synthesen, die den Code erklären und die Tiefe verlinken |
| Tiefendoku (migriert)  | `llm-wiki/wiki/reference/` | ehemals `docs/wiki-intern/`, modulweise Details          |
| Öffentliche Nutzerdoku | `docs/wiki/`               | Englisch, GitHub-Wiki-Sync                               |

Details zur Entscheidung: [Wiki-Struktur](./wiki/decisions/2026-11-04-wiki-struktur.md).

## Die Ebenen

- `raw/` — unveränderliche Quellen. Nur lesen. Enthält die ersetzte
  `agent.md`-Fassung und ein Manifest; Dateien niemals bearbeiten, neue Version
  ablegen und die alte in `raw/README.md` als `superseded` markieren. Das frühere
  Wiki liegt bewusst nicht hier, sondern als `wiki/reference/`, weil es weiter
  gepflegt wird.
- `wiki/` — kuratierte, LLM-gepflegte Seiten. Erweitern und umschreiben, keine
  chronologischen Notizen an Themenseiten anhängen.
- `wiki/reference/` — ausführliche Modul- und Bereichsdoku. Sie behält bewusst die
  übernommene Seitenvorlage (ohne `Status:`/`Confidence:`) und wird nicht neu
  formatiert; bei Moduländerungen wird sie zuerst aktualisiert.
- `AGENTS.md` plus diese Datei — das Schema. Beide zusammen aktuell halten.

## Lesereihenfolge

1. `wiki/index.md`
2. `wiki/current-project-state.md`
3. `wiki/tasks.md`
4. Die im Index verlinkten Seiten passend zur Aufgabe
5. Die neuesten Einträge in `wiki/log.md`

## Operationen

### Ingest

1. Quelle unverändert nach `raw/` legen (nur wenn `raw/` existiert).
2. Lesen und die Kernaussagen zusammenfassen.
3. Jede betroffene Seite aktualisieren; eine Quelle kann 10–15 Seiten berühren.
4. `index.md`, `log.md` und bei dauerhaftem Ergebnis `changelog.md` aktualisieren.
5. Widerspricht die Quelle einer bestehenden Aussage, die alte Aussage nicht
   still überschreiben: als `superseded` markieren, beide mit Quelle behalten und
   den Konflikt festhalten.

Bei großen oder unklaren Quellen zuerst die geplanten Änderungen zeigen.

### Query

1. Zuerst `index.md`, dann die passenden Seiten lesen.
2. Mit Verweisen auf die Seiten und darüber auf die Quellen antworten.
3. Fasst die Antwort mehrere Seiten zusammen und wird wiederverwendet, als
   `analyses/YYYY-MM-DD-kurzer-titel.md` ablegen, im Index verlinken und loggen.

### Lint

Läuft, wenn das Wiki um etwa 20 Seiten wächst oder vor einem Release:

- Widersprüche zwischen Seiten
- Aussagen, die eine neuere Quelle überholt hat
- verwaiste Seiten ohne eingehende Links
- wichtige Begriffe ohne Seite
- fehlende Querverweise
- defekte relative Links
- nahezu doppelte Seiten, die zusammengehören
- offene Fragen, die inzwischen beantwortet sind

Befunde als Aufgaben ablegen. Den Lint-Durchlauf in `log.md` festhalten.
Der mechanische Teil läuft über `node llm-wiki/tools/wiki-check.mjs` (Links,
Index, Struktur, Secrets, Redaktion).

## Regeln

- Metadatenfelder (`Status:`, `Last verified:`, `Confidence:`) bleiben englisch;
  das Prüfwerkzeug und die Vorlage erwarten genau diese Schlüssel.
- Bei `Visibility: public` zusätzlich: keine internen IP-Adressen, Hostnamen,
  VPN-Namen oder privaten Domains; keine Kunden- oder Personendaten; konkrete
  Infrastrukturwerte durch Rollen oder Variablennamen ersetzen. Interne
  Repository-Pfade dürfen stehen.
- Widersprüche werden zentral in `wiki/contradictions/` geführt und auf der
  betroffenen Seite verlinkt, nicht als leere Vorlagenabschnitte wiederholt.
- Erst erweitern, dann neu anlegen: Index und bestehende Titel nach einem
  Fast-Duplikat durchsuchen. `wiki/reference/` ist die migrierte Quellschicht; bei
  der Duplikatprüfung zählt sie wie eine Quelle, nicht wie eine konkurrierende
  Themenseite.
- Umschreiben, nicht anhängen: Themenseiten sind Synthesen, keine Tagebücher.
- `raw/` ist unveränderlich (sobald vorhanden).
- Keine Secrets; nur Pfade und Variablennamen.
- Ausschließlich relative Markdown-Links.
- Unsicherheit mit `confidence: low` und offenen Fragen markieren.
- Wiki-Inhalt autorisiert keine Code-Änderungen.

## Skalierung

Der Index ist die Retrieval-Schicht bis einige hundert Seiten. Danach eine lokale
Markdown-Suche ergänzen oder den Index pro Bereich aufteilen. Keine Embeddings
standardmäßig.

## Aufgaben- und Log-Konventionen

- Eine Aufgabe = eine Checkbox = ein prüfbares Abnahmekriterium.
- Erledigte Aufgaben werden datiert, belegt und nach **Done** verschoben; nie
  löschen.
- `log.md` ist append-only, neueste zuerst. Präfix:
  `## [YYYY-MM-DD] <typ> | <titel>`.
- Typen: `ingest`, `query`, `lint`, `bootstrap`, `feature`, `fix`, `docs`, `ops`,
  `verification`.
- `changelog.md` hält Ergebnisse fest, nicht die Arbeit.

## Schema

Diese Datei ist das vollständige Schema. Der Block in `AGENTS.md` ist der kurze
Vertrag. Ändert sich eine Konvention, beide zusammen aktualisieren und einen
Log-Eintrag schreiben. Bei größeren Änderungen eine ADR anlegen.

## Verwandte Seiten

- [Index](./wiki/index.md)
- [Überblick](./wiki/overview.md)
- [Aktueller Projektzustand](./wiki/current-project-state.md)
- [Wiki-Struktur (ADR)](./wiki/decisions/2026-11-04-wiki-struktur.md)
