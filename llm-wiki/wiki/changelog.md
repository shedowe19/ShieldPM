# Wiki-Changelog

Ergebnisse für Menschen, neueste zuerst. Die Arbeit selbst steht im [Log](./log.md).
Dieses Changelog betrifft das Wiki, nicht Produkt-Releases.

## 2026-11-05 — HTTP/2 und WebSocket-Raten

- Validierte native Stream-/Upgrade-Zähler werden akzeptiert; HTTP/3 bleibt unbekannt.
- Opt-in-Direktive in Standardhost-Server verschoben und echtes Templaterendering geprüft.

## 2026-11-05 — Native HTTP/1-Live-Raten

- Native kumulative Zähler werden während laufender Transfers ausgewertet;
  Berechtigungen, Präfixmaskierung, Stale-/Reset- und unbekannte Gruppen bleiben explizit.
- Gemeinsame logarithmische Skala, EMA und exakte Richtungs-/Zeitfenster-Tooltips.
- Echter Nginx→Collector-Test belegt aktive Upload-/Downloadraten; HTTPS, Retries,
  Keepalive und Reloads zusätzlich nativ geprüft. Andere Protokolle bleiben T-028.

## 2026-11-05 — Live-Messquelle weiter eingegrenzt

- Reproduzierbarer Test zeigt den Vorsprung von Lua-Bodyfilter-Bytes vor dem
  gedrosselten Client und die fehlende Requestvariablen-Sicht in Lua-Timern.
- Nativen Instrumentationsvertrag für echte Kantenraten präzisiert; T-028
  bleibt offen, die bestehende Vorschau meldet weiterhin unbekannte Raten.

## 2026-11-05 — Experimentelle Traffic-Flow-Vorschau

- Vorhandene Analytics-Seite um eine opt-in Flow-Ansicht ergänzt: maskierte
  Clientgruppen, schematisches Internet, einzelne Hosts und getrennte
  konfigurierte/beobachtete Upstreams; Pause, Suche, Liste und Fehlerzustände.
- Kurzlebiges UDP-Abschlusssample mit aktuellen Hostberechtigungen; keine neuen
  Datenbankwrites und keine erfundenen Kantenraten. Echte Live-Raten bleiben T-028.
- [Messgrenzen](./decisions/2026-11-05-traffic-flow-messgrenzen.md) und Rückweg
  dokumentiert. Feature-Branch, kein Deployment.

## 2026-11-05

- T-019: 350 Warnungen triagiert, 16 sicherheits- und fehlerrelevante Punkte
  sofort behoben, Rest als T-020 bis T-027 gruppiert.
  ([Triage](./analyses/2026-11-05-warnungs-triage.md))
- Vollständiger Datei-Audit mit 173 Agents: 2.066/2.066 Dateien, 22 Fehler und
  350 Warnungen. 21 Fehler behoben, ein Fehlalarm bestätigt; die Warnungen sind
  als T-019 zur Triage erfasst. ([Analyse](./analyses/2026-11-05-datei-audit.md))

## 2026-11-04

- Backlog abgearbeitet: Authentik-Beispiel dokumentiert, Fastly-IP-Ranges
  ergänzt, OpenAppSec-Advanced-Modell im Installer umgesetzt, Legacy-Token-Scope
  gekapselt, Users-Tabellen-Kommentar entfernt. ([Log](./log.md))
- Abschlussprüfung: OpenAPI-Metadaten ergänzt (sechs Tags, sechs DDNS-
  Operation-IDs), zwei veraltete Wiki-Stellen korrigiert, Graph neu erzeugt.
  ([Log](./log.md))
- CodeQL-Funde behoben: Wiki-Checker bereinigt Kommentare und Tags über
  Scanner; der generierte Offline-Graph ist von der Analyse ausgenommen.
  ([Log](./log.md))
- Abhängigkeits-PR #159 geschlossen; der neue PR #160 aktualisiert alle direkten
  Abhängigkeiten und ist vollständig grün. ([Log](./log.md))
- Dependabot-Alarme geschlossen: `qs` auf 6.16.1 (Resolution), `seroval` im
  Frontend-Lock auf 1.6.11 und `minimatch` auf 11.0.4 gehoben; Lockfiles und
  Schutztests bestehen. ([Log](./log.md))
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
