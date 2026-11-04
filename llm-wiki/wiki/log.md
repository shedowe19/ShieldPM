# Log

Append-only, neueste zuerst. Ein Eintrag pro relevanter Aktion, mit allen Feldern.

## [2026-11-04] chore | Abhängigkeits-PR #159 geschlossen, #160 erstellt

- Command: „mach den alten zu und erstell ein neuen“.
- Type: chore
- Areas affected: GitHub-PR `#159`/`#160`, Workflow `npm-updates.yml`
- Files changed: keine im Repository; PR #160 ändert Abhängigkeiten,
  Lockfiles und `THIRD-PARTY-NOTICES.md`
- Wiki pages updated: current-project-state, log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine
- Open questions: unverändert (T-007)
- Next steps: #160 reviewen und mergen; danach läuft der tägliche Updater weiter
- Verification: PR #159 mit Begründung geschlossen und Branch gelöscht;
  Workflow-Lauf `41904085825` erfolgreich, PR #160 aus `update-all-deps`
  erstellt; alle 21 Prüfungen sind grün.

## [2026-11-04] security | Dependabot-Alarm minimatch geschlossen

- Command: Fortsetzung des Internet-Audits.
- Type: security
- Areas affected: `backend/package.json`, `backend/yarn.lock`, `backend/test/ci`
- Files changed: `backend/package.json` (`archiver/**/minimatch` 11.0.4),
  `backend/yarn.lock`, `dependabot-security-resolutions.spec.js`,
  `npm-package-constraints.spec.js`
- Wiki pages updated: security/overview, tasks, current-project-state, changelog,
  log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine
- Open questions: unverändert (T-007)
- Next steps: PR #159 prüfen/mergen; Patch-Updates dem täglichen Updater überlassen
- Verification: Advisory `minimatch >= 7.0.0, < 11.0.1`, feste Version 11.0.1;
  Lockfile auf 11.0.4; `yarn install --frozen-lockfile` besteht; 11 Tests in
  vier CI-Specs grün (Security-Resolutions, Package-Constraints,
  Archiver-ESM, OpenAppSec-Policy).

## [2026-11-04] security | Dependabot-Alarme qs und seroval geschlossen

- Command: „Aber nochmals komplett code mit internet checken ob noch was
  angepasst werden muss etc.“
- Type: security
- Areas affected: `backend/package.json`, `backend/yarn.lock`,
  `frontend/yarn.lock`, `backend/test/ci`
- Files changed: `backend/package.json` (qs-Resolution 6.16.1),
  `backend/yarn.lock`, `frontend/yarn.lock` (seroval 1.6.11),
  `dependabot-security-resolutions.spec.js` (CRLF-Normalisierung),
  `npm-package-constraints.spec.js` (erwarteter qs-Pin)
- Wiki pages updated: security/overview, reference/module/openappsec,
  reference/offene-fragen, tasks, changelog, log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine; v1beta1 bleibt maßgeblich, v1beta2 ist laut Doku Beta
- Open questions: T-007 unverändert; PR #159 bleibt offen
- Next steps: PR #159 prüfen/mergen; direkte Patch-Updates beim nächsten
  Updater-Lauf
- Verification: `yarn install --frozen-lockfile` für Backend und Frontend;
  `vitest run` für `openappsec-local-policy`, `dependabot-security-resolutions`
  und `npm-package-constraints` (9 Tests grün); Lockfile zeigt `qs@6.16.1` und
  `seroval@1.6.11`; Dependabot-API vor der Änderung: drei offene moderate
  Alarme (qs, seroval ×2).

## [2026-11-04] chore | Wiki-Prüfung in CI und portabler OpenAppSec-Test

- Command: „nochmals komplett checken ob noch was gemacht werden muss“.
- Type: chore
- Areas affected: `.github/workflows`, `backend/test/ci`, Wiki (Coverage,
  Infrastruktur, Zustand, Aufgaben)
- Files changed: `lint-and-format.yml`, `openappsec-local-policy.spec.js`,
  `coverage.md`, `infrastructure/build-and-release.md`,
  `current-project-state.md`, `tasks.md`, `changelog.md`, `log.md`,
  `llm-wiki/README.md`
- Wiki pages updated: coverage, infrastructure/build-and-release,
  current-project-state, tasks, changelog, log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine (gefundene Lücke direkt geschlossen)
- New decisions: keine
- Open questions: unverändert; T-007 bleibt extern blockiert
- Next steps: T-007 auf einer laufenden Instanz; Routinen beim nächsten Auslöser
- Verification: `node llm-wiki/tools/wiki-check.mjs` → PASS; Regex-Match nach
  CRLF-Normalisierung geprüft (vorher auf Windows-Checkout falsch); Workflow-YAML
  mit PyYAML geparst; `node --check` für den Test; Prettier `--check` ohne
  Abweichung; CI-Lauf `41894222573` für `1b5acadd` grün, inklusive Schritt
  „Check internal LLM wiki“, Backend-Tests und Frontend-Build.

## [2026-11-04] verification | OpenAppSec-Policy gegen v1beta1 validiert

- Command: „Komplett machen“ (Rest abschließen).
- Type: verification
- Areas affected: `scripts/install.sh`, OpenAppSec-Policy, Aufgaben-Board
- Files changed: `backend/test/ci/openappsec-local-policy.spec.js` (neu),
  `tasks.md`, `current-project-state`, `questions`, `changelog`, `log`
- Wiki pages updated: tasks, current-project-state, questions, changelog, log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine
- Open questions: OpenAppSec-Zeile auf T-007 umgestellt
- Next steps: T-007 auf einer laufenden Instanz; M-001–M-003 beim nächsten Auslöser
- Verification: Policy-YAML gegen das veröffentlichte v1beta1-Schema mit
  `jsonschema` validiert („POLICY VALID“); Referenzen
  `shieldpm-default-practice`/`shieldpm-log-trigger` vorhanden; Regressionstest
  angelegt und `node --check` OK; `install.sh` mit `bash -n` auf LF-Kopie geprüft.

## [2026-11-04] feature | T-004, T-005-Vorbereitung und M-001–M-004

- Command: „Mach den rest komplett fertig“.
- Type: feature
- Areas affected: `backend/schema`, `scripts/install.sh`, Wiki (Fragen, Glossar,
  Aufgaben, Coverage)
- Files changed: `backend/schema/swagger.json`, 22 neue Pfad-JSONs,
  `scripts/install.sh`, `reference/projekt/begriffe.md`, `reference/index.md`,
  kuratierte Seiten (api, glossary, questions, tasks, coverage, changelog, log)
- Wiki pages updated: `api/overview`, `api/schemas`, `glossary`, `questions`,
  `tasks`, `coverage`, `changelog`, `log`, `current-project-state`,
  `reference/index`, `reference/projekt/begriffe`
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine
- Open questions: Triage abgeschlossen; beantwortete Fragen ausgelagert
- Next steps: T-005 (Live-Beleg); M-001/M-002/M-003 beim nächsten Auslöser
- Verification: `node llm-wiki/tools/wiki-check.mjs` → PASS; `swagger.json`
  geparst (120 Pfade, 162 eindeutige Operation-IDs, keine fehlenden `$ref`s);
  Policy-YAML mit PyYAML geparst (Referenzen `shieldpm-default-practice` und
  `shieldpm-log-trigger`); `install.sh` mit `bash -n` auf LF-Kopie geprüft;
  Graph neu erzeugt.

## [2026-11-04] release | Wiki-Migration committet

- Command: „Mach“ (Commit-Freigabe).
- Type: release
- Areas affected: gesamtes Repository
- Files changed: Commit `443d764f` (159 Dateien: 109 Löschungen, 11 geänderte
  Dateien, `llm-wiki/` neu, Renames erkannt)
- Wiki pages updated: `current-project-state`, `coverage`, `changelog`, `log`
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine
- Open questions: keine
- Next steps: T-004, T-005; M-001 bis M-004
- Verification: `git status --short` leer; `git log -1` = `443d764f`;
  `node llm-wiki/tools/wiki-check.mjs` → PASS.

## [2026-11-04] docs | T-001 und T-002 umgesetzt

- Command: „Mach“ auf die Empfehlung, die beiden Doku-Widersprüche zu beheben.
- Type: docs
- Areas affected: `AGENTS.md`, `.cursorrules`, Widerspruchsseiten, Aufgaben
- Files changed: `AGENTS.md`, `.cursorrules`, 2 Widerspruchsseiten, `tasks.md`,
  `index`, `current-project-state`, `changelog`, `log`
- Wiki pages updated: contradictions (2 + Index), tasks, current-project-state,
  changelog, log
- New wiki pages: keine
- New TODOs: keine
- New bugs: keine
- New decisions: keine
- Open questions: keine
- Next steps: T-004, T-005; M-001 bis M-004
- Verification: `grep -i "sqlite in dev only" AGENTS.md` → keine Treffer;
  `grep -in "debounc" .cursorrules` → nur Docker-Discovery; beide
  Widerspruchsseiten auf `superseded`; `node llm-wiki/tools/wiki-check.mjs` → PASS.

## [2026-11-04] lint | Vierte Prüfrunde mit achtzehn Gutachtern

- Command: „nochmals komplett mit 18 Sub-Agenten“.
- Type: lint
- Areas affected: alle kuratierten Seiten, Tiefendoku, Prüfwerkzeug, Wiki-Graph
- Files changed: 24 kuratierte Seiten, 2 Referenzseiten, `wiki-check.mjs`,
  `reference/wiki-graph.html`, `agent.md`
- Wiki pages updated: overview, index, current-project-state, tasks, log,
  changelog, glossary, analyses/README, architecture (5), backend, api (2),
  data (2), frontend, infrastructure (3), modules, testing, contradictions (2),
  questions, decisions/adr-template
- New wiki pages: keine
- New TODOs: keine (bestehende präzisiert)
- New bugs: keine bestätigten; `/api`-Routing, Timer-Guard, Stream-Hosts,
  Model cardinalities, OpenAppSec-Verortung, Demo/Pagination, Datenpfad und
  Zählungen korrigiert
- New decisions: keine
- Open questions: Socket-Pfad, GeoIP-Reihenfolge und Release-Zyklus beantwortet
- Next steps: T-001, T-002, T-004, T-005; M-001 bis M-004
- Verification: `node llm-wiki/tools/wiki-check.mjs` → PASS (141 Markdown-Dateien,
  35 kuratiert, 103 reference, 147 Textassets, 148 Dateien); Selbsttest 25/25;
  `prettier --check` sauber; `node --check` OK; `docker.yml` YAML-gültig;
  Graph neu erzeugt (103 Knoten, 733 Kanten).
- Werkzeug: scannt jetzt auch `.txt/.yml/.sh/.mjs/.js` (außer `tools/`),
  validiert `<img src>`, unbenutzte Referenz-Links und Same-Page-Anker,
  prüft doppelte Metadaten, `.md`-unabhängige Manifeste und nur echte
  `paths:`-Einträge in `docker.yml`.

## [2026-11-04] lint | Dritte Prüfrunde mit acht Gutachtern

- Command: „nochmals komplett mit der Max anzahl an Sub-Agents“.
- Type: lint
- Areas affected: kuratierte Seiten, Tiefendoku, Prüfwerkzeug, `.github/workflows/docker.yml`
- Files changed: 20 kuratierte Seiten, 2 Referenzseiten, ein Analyse-JSON,
  `llm-wiki/tools/wiki-check.mjs`, `docker.yml`, `agent.md`, `current-project-state`
- Wiki pages updated: overview, backend, modules, testing, frontend, api (2), data (2),
  architecture (3), security, infrastructure (2), coverage, index, tasks, log,
  changelog, decisions, contradictions, questions, reference/wiki-pflege
- New wiki pages: `analyses/README.md`, `glossary.md`
- New TODOs: M-001 bis M-004 (Lint aufgeteilt)
- New bugs: keine bestätigten Fehler; falsche Modellbeziehungen, OpenAppSec-Verortung,
  Demo-/Pagination-/Schema-Aussagen, Zählungen und Beziehungen korrigiert
- New decisions: keine
- Open questions: Release-Zyklus beantwortet; übrige Fragen mit Prüfstelle
- Next steps: T-001, T-002, T-004, T-005; M-001 bis M-004
- Verification: `node llm-wiki/tools/wiki-check.mjs` → PASS (141 Markdown-Dateien,
  35 kuratiert, 103 reference, 147 Textassets, 148 Dateien inkl. Werkzeug); Werkzeug-Selbsttest mit 25 Fällen
  (private/public IPs, IPv6 ULA, E-Mail, interne Hostnamen, Build-Pfade, Secrets,
  Bearer, Credential-URL, HTML-/Referenz-Links, Anker, CRLF, Fenced-Metadaten,
  doppelter Status, Manifest-Präfix und -Ghost, Wikilink im Kommentar, Fence-Link,
  Dateiname) → alle erwartungsgemäß; `node --check` OK.
- Sicherheit: interne Sandbox-Pfade (Arbeitsbereich und Home-Verzeichnis der
  Prüfumgebung) aus dem Audit-JSON 2026-10 entfernt; Manifest nennt jetzt den
  Git-Blob.
- Behoben: tote `docker.yml`-Pfadfilter entfernt (T-003) und Prüfung 12 im Werkzeug
  ergänzt.

## [2026-11-04] lint | Zweite Prüfrunde: fünf Gutachter, Werkzeug gehärtet

- Command: „nochmals von mehreren Subagents prüfen lassen“.
- Type: lint
- Areas affected: kuratierte Seiten, Prüfwerkzeug, `agent.md`, Referenzebene
- Files changed: 18 kuratierte Seiten, `agent.md`, `llm-wiki/tools/wiki-check.mjs`,
  `llm-wiki/README.md`, drei Referenzseiten
- Wiki pages updated: modules, api/endpoints, security, infrastructure/runtime,
  testing, architecture (overview, nginx-engine, request-lifecycle), backend,
  frontend, data (overview), coverage, overview, questions, tasks, index, log,
  changelog, decisions/README, adr-template
- New wiki pages: keine
- New TODOs: keine (bestehende T-001 bis T-005 präzisiert)
- New bugs: keine bestätigten Fehler; falsche Modulbeschreibungen, Zählungen und
  Zeilenverweise korrigiert
- New decisions: keine
- Open questions: bereichsübergreifend zusammengeführt und mit Prüfstelle versehen;
  Python-CI-Frage beantwortet
- Next steps: T-001 bis T-005, M-001
- Verification: `node llm-wiki/tools/wiki-check.mjs` → PASS (139 Dateien);
  Werkzeug-Selbsttest mit 13 injizierten Fehlern (darunter private IP, E-Mail,
  Wikilink, Dateiname, Secret, Case-Mismatch, fehlende Kernseite, Raw-Waisen,
  gefencetes `## Zweck`) → alle erwartet erkannt; Geheimwert wird nicht ausgegeben;
  `node --check` für das Werkzeug OK.
- Hinweis: Referenzseiten behalten ihre übernommene Vorlage; das ist jetzt in
  Schema und ADR ausdrücklich festgehalten.

## [2026-11-04] lint | Fünf unabhängige Prüfungen, Befunde korrigiert

- Command: „nochmals von mehreren Subagents prüfen lassen“.
- Type: lint
- Areas affected: `llm-wiki/wiki` (kuratiert und reference), `llm-wiki/raw`,
  Prüfwerkzeug
- Files changed: 20 kuratierte Seiten, 6 reference-Seiten,
  `llm-wiki/tools/wiki-check.mjs` (neu), `llm-wiki/raw/README.md` (neu),
  `llm-wiki/raw/legacy-agent-md-2026-11-04.md` (neu), `AGENTS.md` (letzte Zeile)
- Wiki pages updated: architecture (overview, request-lifecycle, background-jobs,
  nginx-engine), api (overview, endpoints), data (overview, migrations),
  backend, frontend, testing, coverage, overview, current-project-state,
  contradictions (2 + Index), decisions (2), tasks, questions, index, log
- New wiki pages: `llm-wiki/tools/wiki-check.mjs`,
  `llm-wiki/raw/README.md`, `llm-wiki/raw/legacy-agent-md-2026-11-04.md`
- New TODOs: keine
- New bugs: keine bestätigten Fehler; falsche Aussagen und Zählungen korrigiert
- New decisions: keine; ADR präzisiert (reference als Quellschicht, raw-Inhalt)
- Open questions: keine neuen
- Next steps: T-001 bis T-005, M-001
- Verification: `node llm-wiki/tools/wiki-check.mjs` → PASS; Zählungen neu erhoben
  (53 internal, 34 routes, 33 modelldateien, 58 lib-Dateien, 91 Migrations, 286
  Testdateien davon 278 Tests, 219 Frontend-Tests, 13 Workflows, 14 Python-Tests,
  799 Frontend-Dateien, 3 Schema-Top-Level) und Zeilenverweise am Code nachgeprüft;
  `git status --short` unverändert im erwarteten Rahmen.
- Hinweis: Prüfwerkzeug und `raw/` entstanden in dieser Runde; die Verifikationen
  der früheren Einträge nutzten ein temporäres Skript und sind mit dem heutigen
  Werkzeug reproduzierbar.

## [2026-11-04] verification | PROMPT-Abgleich, Altpfad entfernt, Abdeckung dokumentiert

- Command: „das alte Wiki entfernen und nochmals komplett gegen PROMPT.md prüfen“.
- Type: verification
- Areas affected: `docs/wiki-intern` (bestätigt entfernt), `llm-wiki`, `tasks`
- Files changed: `llm-wiki/wiki/coverage.md` (neu), `llm-wiki/wiki/index.md`,
  `llm-wiki/README.md`, `llm-wiki/wiki/tasks.md`
- Wiki pages updated: `index`, `tasks`, Schema
- New wiki pages: [Abdeckung und Inventar](./coverage.md)
- New TODOs: keine; zwei „Hack“-Kommentare als Backlog-Kandidaten aufgenommen
- New bugs: keine
- New decisions: keine
- Open questions: keine neuen
- Next steps: T-001 bis T-005, M-001
- Verification: Prüfskript (damals temporär, nicht im Repo abgelegt; reproduzierbar
  mit `llm-wiki/tools/wiki-check.mjs`) → PASS (139 Markdown-Dateien:
  33 kuratiert, 103 reference, 1 Schema-README, 2 raw); `prettier --check` auf den
  kuratierten Seiten sauber;
  `python -c yaml.safe_load` für den Spellcheck-Workflow OK;
  `docs/wiki-intern` nicht mehr vorhanden; vollständiger TODO/FIXME/HACK-Scan
  durchgeführt.
- Hinweis: `llm-wiki/wiki/reference/` wurde bewusst nicht umformatiert; sie zählt
  bei der Duplikatprüfung als Quellschicht.

## [2026-11-04] docs | Altes Wiki nach `llm-wiki` migriert und Verweise umgestellt

- Command: Nutzerwunsch „das Neue in AGENTS/GEMINI etc. aufnehmen und das Alte
  ersetzen“.
- Type: docs
- Areas affected: `docs/wiki-intern`, `llm-wiki`, `AGENTS.md`, `GEMINI.md`,
  `.cursorrules`, `agent.md`, `README.md`, `docs/wiki/Development.md`,
  `scripts/wiki-graph.py`, `scripts/sync-verified-dependency-docs.js`,
  `backend/test/ci/sync-verified-dependency-docs.spec.js`, Spellcheck-Workflow
- Files changed: `docs/wiki-intern/**` (verschoben), `llm-wiki/**`,
  `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `agent.md`, `README.md`,
  `docs/wiki/Development.md`, `scripts/wiki-graph.py`,
  `scripts/sync-verified-dependency-docs.js`,
  `backend/test/ci/sync-verified-dependency-docs.spec.js`,
  `.github/workflows/spellcheck.yml`
- Wiki pages updated: `README.md`, `index`, `overview`, `current-project-state`,
  `tasks`, `decisions/*`, `reference/index`, `reference/wiki-pflege`
- New wiki pages: `llm-wiki/wiki/reference/**` (109 Dateien übernommen); das
  Raw-Archiv entstand erst in der Lint-Runde danach
- New TODOs: keine
- New bugs: keine
- New decisions: aktualisierte [Wiki-Struktur](./decisions/2026-11-04-wiki-struktur.md)
- Open questions: keine neuen
- Next steps: T-001 bis T-003; `python3 scripts/wiki-graph.py` neu laufen lassen
- Verification: Prüfskript (damals temporär, nicht im Repo abgelegt; reproduzierbar
  mit `llm-wiki/tools/wiki-check.mjs`) über `llm-wiki/**` (Links,
  Index, Struktur, Secrets, Redaktion) ohne Befund; `git status --short` zeigt nur
  die erwarteten Pfade.

## [2026-11-04] bootstrap | LLM-Wiki initialisiert

- Command: Nutzerauftrag „Mach das llm-wiki-init-PROMPT.md“; Intake nachgeholt
  (Projekt ShieldPM, Zweck aus README, Sichtbarkeit public, Sprache Deutsch,
  Umfang full filtered).
- Type: bootstrap
- Areas affected: gesamtes Repository, insbesondere `README.md`, `GEMINI.md`,
  `.cursorrules`, `backend/`, `frontend/`, `rootfs/`, `scripts/`, `docs/wiki-intern/`
- Files changed: `llm-wiki/**`, `AGENTS.md` (nur der markierte Block)
- Wiki pages updated: alle Seiten unter `llm-wiki/wiki/`
- New wiki pages: `index`, `overview`, `current-project-state`, `tasks`, `log`,
  `changelog`; `architecture/{overview,request-lifecycle,nginx-engine,host-lifecycle,background-jobs}`;
  `backend/overview`; `frontend/overview`; `api/{overview,endpoints,schemas}`;
  `data/{overview,migrations}`; `infrastructure/{runtime,build-and-release,configuration}`;
  `security/overview`; `testing/overview`; `modules/overview`;
  `decisions/{README,adr-template,2026-11-04-wiki-struktur,2026-10-27-entfernung-der-wasm-laufzeit}`;
  `questions/open-questions`; `contradictions/{README,2026-11-04-sqlite-in-produktion,2026-11-04-nginx-reload-debounce}`
- New TODOs: T-001, T-002, T-003, T-004, T-005, M-001
- New bugs: keine bestätigten Fehler; zwei Dokumentationswidersprüche und zwei
  tote CI-Pfadfilter festgehalten
- New decisions: [Wiki-Struktur](./decisions/2026-11-04-wiki-struktur.md),
  [Wasm-Entfernung](./decisions/2026-10-27-entfernung-der-wasm-laufzeit.md)
- Open questions: siehe [offene Fragen](./questions/open-questions.md)
- Next steps: T-001 bis T-003 entscheiden und umsetzen; M-001 nach etwa 20 Seiten
- Verification: Prüfskript (damals temporär, nicht im Repo abgelegt; reproduzierbar
  mit `llm-wiki/tools/wiki-check.mjs`) für Links, Index, Struktur,
  Secrets und Redaktion ohne Befund; `prettier --check` sauber; `git status --short`
  zeigt ausschließlich `llm-wiki/` und `AGENTS.md`.
- Hinweis Sichtbarkeit: `public` verlangt Redaktion. Die Seiten nennen keine
  internen IPs, Hostnamen, Domains oder Personendaten; Beispielwerte aus
  `compose.yaml`/`.env.example` wurden nicht übernommen.
