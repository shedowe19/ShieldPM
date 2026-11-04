# Aktueller Projektzustand

Status: active
Last verified: 2026-11-04
Confidence: high

Last updated: 2026-11-04

Dies ist eine rollierende Momentaufnahme, keine Historie. Ältere Details gehören
in den [Log](./log.md) oder in die passende Bereichsseite.

## Zweck

Diese Seite sagt einem Agenten in unter einer Minute, welcher Stand gilt, was
zuletzt fertig wurde, was bewusst fehlt und welche Risiken gerade aktiv sind.

## Stand

- Branch `develop`, Arbeitsbaum sauber und synchron mit `origin/develop`.
- Letzte Version `4.4.1` in `.version`, `backend/package.json` und
  `frontend/package.json`.
- Wiki versioniert seit `443d764f`; die Nacharbeiten dieser Sitzung betreffen
  OpenAPI, OpenAppSec, die Wiki-Prüfung in CI und zwei Dependabot-Alarme.

## Was zuletzt fertig wurde

| Datum      | Ergebnis                                                                                                        | Quelle                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 2026-11-04 | Dependabot-Alarme für `qs`, `seroval` und `minimatch` geschlossen                                               | [Log](./log.md)                                               |
| 2026-11-04 | Wiki-Prüfung in der CI verankert; OpenAppSec-Regressionstest CRLF-robust                                        | [Log](./log.md)                                               |
| 2026-11-04 | Internes Wiki auf `llm-wiki/` konsolidiert; `docs/wiki-intern/` nach `llm-wiki/wiki/reference/` übernommen      | [ADR](./decisions/2026-11-04-wiki-struktur.md)                |
| 2026-10-27 | Sicherheitsupdates für Redirect-, URI- und IP-Parser-Abhängigkeiten (PR #158)                                   | Commit `2324db48`                                             |
| 2026-10-27 | Referenzkorrektur und Entfernung der Wasm/WASI-Ausführung                                                       | [ADR](./decisions/2026-10-27-entfernung-der-wasm-laufzeit.md) |
| 2026-10-27 | Abhängigkeiten in Frontend und Backend aktualisiert (PR #157)                                                   | Commit `afec2978`                                             |
| 2026-10    | Host-Versionen mit Rollback, Instanzbackups, Störungszentrale, IP-Firewall, Proxy-Host-Überwachung und Diagnose | [Interne Feature-Doku](reference/features/README.md)          |

## Was funktioniert

Die folgenden Aussagen stammen aus Dokumentation und Code, nicht aus einem
Testlauf dieser Sitzung:

- Konfigurationserzeugung über Liquid-Templates mit `nginx -tq`-Validierung und
  Rollback bei Fehlern (`backend/internal/nginx.js:110-226`).
- Serielle Schreibvorgänge über `withConfigurationLock` (`backend/internal/nginx.js:77`).
- API-Validierung über JSON Schema/AJV und Swagger UI unter `/docs`.
- Multi-Datenbank-Betrieb über Knex/Objection.
- Die Wiki-Prüfung läuft in der CI (`lint-and-format.yml`, Schritt
  „Check internal LLM wiki“); Lauf `41894222573` war grün.

## Was bewusst fehlt

- Wasm/WASI-Ausführung, Kataloge und zugehörige UI/API wurden entfernt; die
  Migration `20261027150000_remove_retired_host_runtime.js` räumt Reste auf.
- Die „Host-Workspace“-Oberfläche wurde auf Wunsch des Nutzers zurückgezogen; die
  Migration `20261017190600_host_workspace.js` bleibt aus Kompatibilitätsgründen.
  Quelle: `GEMINI.md:24`.

## Nächste Schritte

- **Nächster Lint:** bei etwa 20 neuen Seiten oder vor einem Release; letzter
  Durchlauf 2026-11-04 ([Aufgaben](./tasks.md), Routinen `M-001` bis `M-003`).
- Offene Punkte aus der internen Doku abarbeiten:
  [offene Fragen](./questions/open-questions.md).

## Bekannte Defekte und offene Aufgaben

- Keine bestätigten Produktdefekte in dieser Sitzung.
- Offene Arbeiten: `T-007` (blockiert, braucht laufenden OpenAppSec-Agent)
  ([Aufgaben](./tasks.md)).
- Offener Pull Request #160 („chore(deps): update npm dependencies“): ersetzt den
  geschlossenen #159 und aktualisiert alle direkten Abhängigkeiten. Alle 21
  Prüfungen sind grün.

## Aktive Risiken

- **Synthese gegen Tiefe:** `llm-wiki/wiki/` und `llm-wiki/wiki/reference/` können
  auseinanderlaufen. Gegenmaßnahme: dieses Wiki fasst zusammen und verlinkt, statt
  zu kopieren; Moduländerungen aktualisieren zuerst `reference/`; Details siehe
  [ADR](./decisions/2026-11-04-wiki-struktur.md).
- **Veraltete Policy-Texte:** Mehrere Agenten-Dokumente enthalten Aussagen, die
  der Code überholt hat ([Widersprüche](./contradictions/README.md)).
- **Kein lokaler Testlauf in dieser Sitzung:** `backend/node_modules` und
  `frontend/node_modules` fehlen, die Laufzeit ist Node 24 statt der geforderten
  Node-26-Version.

## Verwandte Seiten

- [Index](./index.md)
- [Überblick](./overview.md)
- [Aufgaben](./tasks.md)
- [Log](./log.md)
