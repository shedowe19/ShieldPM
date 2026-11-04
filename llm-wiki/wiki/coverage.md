# Abdeckung, Inventar und Selbstprüfung

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite hält fest, welche Teile des Repositories für dieses Wiki gelesen,
nur stichprobenartig geprüft oder bewusst übersprungen wurden. Sie ist der Beleg
für Vollständigkeitsaussagen in diesem Wiki und wird bei jedem Lint nachgezogen.

## Methode

- Grundlage sind `git ls-files` und Verzeichnislisten, nicht der Arbeitsbaum mit
  Abhängigkeiten. `llm-wiki/` ist seit Commit `443d764f` versioniert.
- Lesestatus: `full` (vollständig bzw. alle genutzten Teile), `sampled` (Struktur,
  Einstiegspunkte und Schlüsseldateien), `skipped` (bewusst nicht gelesen).
- Zählbasis ist, wo nicht anders angegeben, rekursiv. Abweichungen stehen in der
  Spalte „Dateien“.

## Register

| Pfad                                | Kategorie   | Modul             |                  Dateien | Status  | Grund / Umfang                                                                 |
| ----------------------------------- | ----------- | ----------------- | -----------------------: | ------- | ------------------------------------------------------------------------------ |
| `backend/internal/`                 | code        | Backend-Fachlogik |                       53 | sampled | Nginx-Engine, Host-Module, Timer, Firewall, Auth gelesen; Rest über Modulliste |
| `backend/routes/`                   | code        | API               |                       34 | full    | Mount-Punkte und Unter-Router vollständig erfasst                              |
| `backend/models/`                   | code        | Daten             |       33 Dateien (31 DB) | full    | 31 Objection-Modelle mit `tableName`, dazu `token.js` und `now_helper.js`      |
| `backend/lib/`                      | code        | Backend-Hilfen    |        58 (51 Top-Level) | sampled | access, config, error, db-migrate, Firewall-Renderer                           |
| `backend/lib/access/`               | config      | Auth              |                       80 | sampled | Schemadateien gezählt, Aufbau an Beispielen                                    |
| `backend/templates/`                | config      | Nginx             |                       19 | full    | Vorlagenliste und Aufbau                                                       |
| `backend/migrations/`               | data        | Daten             |                       91 | sampled | Kette, Namensschema, letzte Migrationen gelesen                                |
| `backend/schema/`                   | data        | API               | 3 Top-Level / 226 gesamt | full    | OpenAPI-Aufbau; Unterordner nur gezählt                                        |
| `backend/test/`                     | test        | Tests             |    287 (279 Testdateien) | sampled | Verzeichnisse, Beispiele und CI-Verträge                                       |
| `backend/` (Wurzel)                 | code/config | Backend-Start     |                       20 | full    | app, index, db, config, setup, Start                                           |
| `frontend/src/`                     | code        | Frontend          |                      799 | sampled | Router, Permissions, API-Struktur, package.json                                |
| `frontend/e2e/`                     | test        | Tests             |                        2 | full    | Smoke-Tests benannt                                                            |
| `frontend/` (Konfiguration)         | config      | Frontend-Build    |                       12 | full    | Vite, Playwright, Locale-Check, Budget                                         |
| `rootfs/`                           | infra       | Infrastruktur     |                       32 | full    | Startkette, Units, statische Seiten                                            |
| `scripts/`                          | infra       | Infrastruktur/CI  |                       37 | sampled | Installer, CI-Hilfen, Tests inventarisiert                                     |
| `caddy/`                            | infra       | Infrastruktur     |                        2 | sampled | Umfang klar aus Workflow und Dateinamen                                        |
| `.github/`                          | infra       | CI                |                       15 | full    | 13 Workflows, CodeQL-Konfiguration, Branch-Cleanup                             |
| `.tscanner/`                        | config      | Tooling           |                       11 | sampled | Projektregeln, Pin-Version                                                     |
| `.vscode/`                          | config      | Tooling           |                        2 | skipped | reine Editor-Konfiguration, kein Projektwissen                                 |
| `docs/wiki/`                        | docs        | Dokumentation     |                       50 | sampled | öffentliche Doku; nur verlinkt, nicht dupliziert                               |
| `docs/planning/`                    | docs        | Dokumentation     |                        1 | full    | Zweck des Ordners                                                              |
| `llm-wiki/`                         | docs        | Dokumentation     |                      148 | full    | dieses Wiki inkl. Prüfwerkzeug (seit `443d764f` versioniert)                   |
| `llm-wiki/raw/`                     | docs        | Quellen           |                        2 | full    | Manifest und ersetzte `agent.md`-Fassung, unveränderlich                       |
| Repository-Wurzel                   | docs/config | Projekt           |                       18 | full    | README, GEMINI, AGENTS, .cursorrules, compose, Dockerfile                      |
| `node_modules/`, Lockfiles          | generated   | Abhängigkeiten    |                        – | skipped | Abhängigkeiten, nicht Quellcode                                                |
| Binaries, Bilder, Fonts             | asset       | Assets            |                        – | skipped | kein Projektwissen                                                             |
| `llm-wiki/wiki/reference/**/*.json` | generated   | Analyseartefakte  |                        5 | skipped | Snapshots der Code-Prüfungen; interne Sandbox-Pfade beim Umzug entfernt        |

## Selbstprüfung

Der mechanische Teil läuft über `node llm-wiki/tools/wiki-check.mjs`. Die
folgenden Zeilen bilden die Prüftabelle der Wiki-Vorgabe ab.

| Prüfung                | Weg                                                                                                                                                                      | Ergebnis                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Index-Vollständigkeit  | Werkzeug: jede kuratierte Seite direkt, reference über `reference/index.md`                                                                                              | PASS                          |
| Link-Auflösung         | Werkzeug: alle relativen Links, ausgenommen unveränderliche Raw-Dateien                                                                                                  | PASS                          |
| Kernseiten             | Werkzeug                                                                                                                                                                 | PASS                          |
| Seitenstruktur         | Werkzeug: Titel, Status, Datum, Confidence, `## Zweck`, `## Verwandte Seiten` (kuratiert; Kernseiten/ADR-Vorlage ausgenommen, `reference/` behält die migrierte Vorlage) | PASS                          |
| Aufgabenqualität       | manuell: jede offene Aufgabe hat ein Abnahmekriterium                                                                                                                    | PASS                          |
| Log-Qualität           | manuell: alle Felder und Verifikationszeile in jedem Eintrag                                                                                                             | PASS                          |
| Changelog-Seed         | manuell                                                                                                                                                                  | PASS                          |
| AGENTS-Block           | Werkzeug: genau ein Markerpaar                                                                                                                                           | PASS                          |
| Sprache persistiert    | Werkzeug: `Language: German`                                                                                                                                             | PASS                          |
| Wartungsvertrag        | manuell: Ingest, Query, Lint in Schema und Block                                                                                                                         | PASS                          |
| Fast-Duplikate         | manuell: Synthese- und Referenzebene sind getrennte Schichten; Glossare zusammengeführt                                                                                  | PASS                          |
| Raw-Unveränderlichkeit | manuell: Manifest und `git hash-object` stimmen mit der Quelle überein                                                                                                   | PASS                          |
| Secrets                | Werkzeug: Mustererkennung über alle Wiki-Dateien                                                                                                                         | PASS                          |
| Public-Redaktion       | Werkzeug: IPv4/IPv6, E-Mail, interne Hostnamen, Build-Pfade über alle Textassets                                                                                         | PASS                          |
| Raw-Manifest           | manuell: jede Datei unter `raw/` steht in der Tabelle                                                                                                                    | PASS                          |
| Quellcode unberührt    | `git status --short` gegen die erwartete Pfadliste                                                                                                                       | PASS (Ausnahmen dokumentiert) |
| CI-Erzwingung          | `.github/workflows/lint-and-format.yml` ruft `node llm-wiki/tools/wiki-check.mjs` im Job `quality` auf                                                                   | PASS                          |
| Scratch-Verzeichnis    | `llm-wiki/.init/` existiert nicht                                                                                                                                        | PASS                          |

## Was daraus folgt

- Aussagen über nicht vollständig gelesene Bereiche (z. B. einzelne
  `backend/internal`-Module) stammen aus der Tiefendoku oder aus der Modulliste
  und sind dort verlinkt.
- Das Wiki erhebt keinen Anspruch auf Zeilenabdeckung. Es erhebt Anspruch darauf,
  für jede Aussage eine prüfbare Quelle zu nennen.
- Ändert sich die Struktur deutlich, werden Register und Selbstprüfung beim
  nächsten Lint (`M-001`) nachgezogen.

## Offene Fragen

- TODO: Beim nächsten Lint prüfen, ob `frontend/src` und `scripts/` eine detaillierte
  Modulseite brauchen, die über die Stichprobe hinausgeht.

## Verwandte Seiten

- [Index](./index.md)
- [Überblick](./overview.md)
- [Module](./modules/overview.md)
- [Tiefendoku](./reference/index.md)
