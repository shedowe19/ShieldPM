# Wiki-Changelog

Ergebnisse für Menschen, neueste zuerst. Die Arbeit selbst steht im [Log](./log.md).
Dieses Changelog betrifft das Wiki, nicht Produkt-Releases.

## 2026-11-04

- Dependabot-Alarme geschlossen: `qs` auf 6.16.1 (Resolution) und `seroval` im
  Frontend-Lock auf 1.6.11 gehoben; Lockfiles und Schutztests bestehen.
  ([Log](./log.md))
- Wiki-Prüfung läuft jetzt in der CI (`.github/workflows/lint-and-format.yml`);
  der OpenAppSec-Regressionstest normalisiert Zeilenenden und läuft damit auch
  auf Windows-Checkouts. ([Log](./log.md))
- OpenAppSec-Policy gegen das veröffentlichte v1beta1-Schema validiert und mit
  einem Regressionstest abgesichert; der Live-Beleg bleibt als blockierte Aufgabe
  T-007. ([Log](./log.md))
- T-004 erledigt: OpenAPI kennt jetzt Analytics, OIDC, GitOps und Upload-Relay
  (19 Pfade, 22 Operationen); `swagger.json` bleibt dereferenzierbar.
- T-005 vorbereitet: Die Installer-Policy entspricht dem OpenAppSec-v1beta1-Schema
  (benannte Practice und Log-Trigger) und wird nach dem Schreiben angewendet; der
  Live-Beleg auf einer laufenden Instanz steht noch aus.
- M-003/M-004: Offene Fragen triagiert, Glossare auf eine Quelle reduziert.
  ([Log](./log.md))
- Wiki-Migration committet (`443d764f`); der Arbeitsbaum ist sauber.
  ([Log](./log.md))
- T-001 und T-002 behoben: `AGENTS.md` und `.cursorrules` beschreiben SQLite und
  das Nginx-Reload-Verhalten jetzt korrekt; beide Widersprüche sind als behoben
  markiert. ([Log](./log.md))
- Vierte Prüfrunde mit achtzehn Gutachtern: `/api`-Routing, Timer-Guard,
  Stream-Hosts, Modell-Kardinalitäten, OpenAppSec-Verortung und mehrere
  Datenpfad-/Zählangaben korrigiert; Werkzeug prüft zusätzlich Nicht-Markdown-
  Dateien, `<img>`-Ziele, Referenz-Links und Anker; Graph neu erzeugt.
  ([Log](./log.md))
- Dritte Prüfrunde mit acht Gutachtern: Modellbeziehungen, OpenAppSec-Verortung,
  Demo-, Pagination- und Schema-Aussagen korrigiert; Analysen-Ordner und Glossar
  ergänzt; tote `docker.yml`-Pfade entfernt; Prüfwerkzeug auf 25 Selbsttestfälle
  erweitert und interne Sandbox-Pfade aus den Audit-JSONs entfernt.
  ([Log](./log.md))
- Zweite Prüfrunde: Modulbeschreibungen (Traffic-Policy, Turbo-Loader), Passwort-
  Hashing, Startkette und mehrere Zählungen korrigiert; offene Fragen zusammengeführt
  und mit Prüfstelle versehen. ([Log](./log.md))
- Das Prüfwerkzeug ist jetzt selbstprüfend: Redaktionsverstöße lassen es scheitern,
  Geheimwerte werden nicht ausgegeben, Links werden case-sensitiv geprüft und
  fehlende Dateien erzeugen FAIL statt Absturz. ([Werkzeug](../tools/wiki-check.mjs))
- Fünf unabhängige Prüfungen durchgeführt und die Befunde eingearbeitet:
  Zeilenverweise, Zählungen und zwei Sicherheitsaussagen korrigiert — die
  CSRF-Ausnahme für Duo war falsch, das `SKIP_IP_RANGES`-Flag war invertiert
  beschrieben —, Seiten auf das Vorlagen-Statusformat gebracht, Prüfwerkzeug und
  Raw-Archiv ergänzt. ([Log](./log.md))
- Das frühere interne Wiki `docs/wiki-intern/` vollständig nach
  `llm-wiki/wiki/reference/` übernommen. Es gibt jetzt genau einen internen
  Wiki-Root; `docs/wiki/` bleibt die öffentliche englische Anwenderdoku.
  ([ADR](./decisions/2026-11-04-wiki-struktur.md), [Log](./log.md))
- `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `agent.md` und `README.md` verweisen
  auf `llm-wiki/`; der frühere Pfad existiert nicht mehr.
- Hilfsskripte und CI folgen der neuen Struktur: Wiki-Graph, Abhängigkeits-Sync
  und Spellcheck-Ausnahmen.
- Einstieg, Projektzustand, Aufgaben-Board, Log und Changelog neu aufgebaut; sie
  ergänzen die Tiefendoku, statt sie zu kopieren.
  ([ADR](./decisions/2026-11-04-wiki-struktur.md), [Log](./log.md))
- Architektur, Backend, Frontend, API, Daten, Infrastruktur, Sicherheit, Tests und
  eine Modullandkarte dokumentiert; jede Seite nennt Quellen und verlinkt die
  Tiefendoku.
- Zwei Widersprüche zwischen Agenten-Dokumenten und Code festgehalten
  ([SQLite](./contradictions/2026-11-04-sqlite-in-produktion.md),
  [Reload](./contradictions/2026-11-04-nginx-reload-debounce.md)) und als Aufgaben
  `T-001`/`T-002` aufgenommen.
- Der `AGENTS.md`-Block „LLM Wiki“ ergänzt, damit künftige Agenten den Einstieg
  finden.
