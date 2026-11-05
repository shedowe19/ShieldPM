# Aufgaben

> Eine Aufgabe = eine Checkbox = ein prüfbares Abnahmekriterium.
> Erledigt heißt: geprüft, datiert und nach **Done** verschoben, mit Beleg.
> Aufgaben werden nie gelöscht, sondern verschoben.
> **Blocked** heißt: das Kriterium ist formuliert, aber nur außerhalb dieses
> Repositorys prüfbar. **Routinen** sind wiederkehrend und keine Checkboxen.

## Now

- Keine offenen Aufgaben.

## Next

- [ ] **T-020 Sicherheits-Härtung.** Abnahme: CSP ohne Inline-Skripte, SRI für
      Terminal-CDN, Docker-Socket im Demo-Compose, Entwickler-Adminpasswort,
      Chat-Token-Exposition, Cloudflared-Decrypt und Login-Drosselung sind
      behoben oder begründet geschlossen.
- [ ] **T-021 CI und Release.** Abnahme: Version-Stamping wirkt, Hadolint und
      Nginx-Basis sind gepinnt, Tags bereinigt, `caddy-fmt` rebased, Shell-EOL
      festgelegt.
- [ ] **T-022 Schema-Verträge.** Abnahme: die 87 Schema-Warnungen sind geprüft;
      Vertragstests grün, Restabweichungen dokumentiert.
- [ ] **T-023 Migrationen.** Abnahme: jede Migration vorwärts und rückwärts auf
      SQLite, MariaDB und PostgreSQL geprüft.
- [ ] **T-024 Dokumentation.** Abnahme: die 55 verbleibenden Doku-Warnungen sind
      korrigiert oder als historisch markiert.
- [ ] **T-025 Lokalisierung.** Abnahme: keine englischen Reststrings in `bg`,
      `es`, `it` und `de`; Locale-Check grün.
- [ ] **T-026 Portabilität.** Abnahme: `.tscanner`-Tests plattformneutral,
      Backend-Typecheck umfasst `routes/` und `migrations/`.
- [ ] **T-027 Konfigurations-Hygiene.** Abnahme: Biome, `.yarnrc.yml`,
      Notices-Header und CodeQL-Begründung sind konsistent.

## Blocked

- [ ] **T-028 Echte Traffic-Flow-Kantenraten.** Abnahme: laufende Downloads,
      Uploads und WebSockets mit bekannter Datenmenge belegen aktuelle Raten pro
      Verbindung; gemeinsame Skala und Glättung sind gegen diese Messung geprüft.
      HTTP/1-/HTTP/2-/WebSocket-/HTTP/3-Live-Raten sind mit nativem Modul und realen Transfers belegt.
      Offen bleibt Veröffentlichung der
      abhängigen Nginx-Basis. Siehe
      [Messentscheidung](./decisions/2026-11-05-traffic-flow-messgrenzen.md).

- [ ] **T-007 OpenAppSec-Policy auf einer laufenden Instanz anwenden.** Abnahme:
      `open-appsec-ctl --apply-policy` meldet keinen Schemafehler und die aktive
      Policy entspricht `local_policy.yaml`. Blockiert: braucht einen laufenden
      OpenAppSec-Agent, der in dieser Umgebung nicht vorhanden ist. Die Policy
      selbst ist gegen das veröffentlichte v1beta1-Schema validiert und durch
      `backend/test/ci/openappsec-local-policy.spec.js` abgesichert.
- [ ] **T-017 Advanced-Modell auf einem laufenden Agent verifizieren.** Abnahme:
      `open-appsec-ctl --status` zeigt das Advanced Model. Blockiert: braucht
      einen laufenden OpenAppSec-Agent; Installation und Extraktion sind
      umgesetzt und durch `backend/test/ci/openappsec-advanced-model.spec.js`
      abgesichert.

## Backlog-Kandidaten (unbestätigt)

- Keine offenen Kandidaten; die fünf früheren Punkte sind als T-012 bis T-016
  erledigt.

## Routinen

| Routine                         | Letzter Lauf | Nächster Auslöser                | Abnahme                                                                                                                                                                                    |
| ------------------------------- | ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M-001 Werkzeug-Lint**         | 2026-11-04   | etwa 20 neue Seiten oder Release | `node llm-wiki/tools/wiki-check.mjs` meldet PASS; Lauf im [Log](./log.md)                                                                                                                  |
| **M-002 Manuelle Lint-Prüfung** | 2026-11-04   | gleicher Auslöser                | Widersprüche, überholte Aussagen, verwaiste Seiten, Querverweise, Fast-Duplikate und die Tabelle „Selbstprüfung“ in [Abdeckung](./coverage.md) sind geprüft; Befunde als Aufgaben abgelegt |
| **M-003 Fragen-Triage**         | 2026-11-04   | gleicher Auslöser                | Jede Zeile in [Offene Fragen](./questions/open-questions.md) hat eine Prüfstelle und ist beantwortet, als Aufgabe verlinkt oder begründet geschlossen                                      |

## Done

- [x] **T-019 Warnungen aus dem Datei-Audit triagiert.** Done 2026-11-05.
      Beleg: 355 Einträge nach Bereich und Schwere sortiert; 16 sicherheits- und
      fehlerrelevante Punkte sofort behoben; der Rest ist als T-020 bis T-027
      gruppiert. Details:
      [Warnungs-Triage 2026-11-05](./analyses/2026-11-05-warnungs-triage.md).
- [x] **T-018 Vollständiger Datei-Audit mit mehreren Agents.** Done 2026-11-05.
      Beleg: 2.066/2.066 Dateien in 152 Batches, 173 Agents, 0 unvollständige
      Batches; 1.687 sauber, 350 Warnungen, 22 Fehler. 21 Fehler behoben, ein
      Fehlalarm bestätigt. Details:
      [Datei-Audit 2026-11-05](./analyses/2026-11-05-datei-audit.md).
- [x] **T-016 Users-Tabellen-Kommentar aufgeräumt.** Done 2026-11-04. Beleg:
      `pages/Users/Table.tsx` nutzt den generischen Formatter ohne Hack-Kommentar.
- [x] **T-015 Legacy-Token-Scope gekapselt.** Done 2026-11-04. Beleg:
      `lib/token-scope.js` normalisiert `all` zu `user`; Test
      `test/internal/token-scope-compat.spec.js`.
- [x] **T-014 OpenAppSec-Advanced-Modell im Native-Installer.** Done 2026-11-04.
      Beleg: Ablage unter `/advanced-model/...`, Extraktion nach
      `/etc/cp/conf/waap`, `--stop-agent`/`--start-agent`/`--status`; Test
      `test/ci/openappsec-advanced-model.spec.js`. Live-Prüfung: T-017.
- [x] **T-013 Fastly-IP-Ranges ergänzt.** Done 2026-11-04. Beleg:
      `internal/ip_ranges.js` lädt `api.fastly.com/public-ip-list`, validiert
      IPv4/IPv6 und behandelt Fastly-Ausfälle nicht fatal; Tests in
      `test/internal/ip-ranges.spec.js`. Akamai ist als nicht verfügbar dokumentiert.
- [x] **T-012 Authentik-Forward-Auth-Beispiel dokumentiert.** Done 2026-11-04.
      Beleg: `reference/module/oauth2-proxy.md` beschreibt Provider,
      Application, Outpost, `authentik_host`, gerenderte Nginx-Locations und den
      Testablauf.
- [x] **T-011 Abschlussprüfung aller geänderten Dateien.** Done 2026-11-04.
      Beleg: 52 geänderte Dateien geprüft; OpenAPI-Metadaten um sechs fehlende Tags
      und sechs DDNS-Operation-IDs ergänzt; zwei veraltete Wiki-Stellen korrigiert;
      Graph neu erzeugt. Prüfungen: Wiki-Werkzeug PASS, Prettier PASS, 15 YAML-Dateien
      valide, 11 gezielte Tests grün, Lockfiles frozen, CodeQL 0, Dependabot 0.
- [x] **T-010 CodeQL-Funde im Wiki-Werkzeug und Graphen beheben.** Done 2026-11-04.
      Beleg: `wiki-check.mjs` entfernt HTML-Kommentare und Tags über Scanner statt
      Einzel-Regex; `wiki-graph.html` (generiert, eingebettete Minified-Bundles) ist
      in `.github/codeql/codeql-config.yml` von der Analyse ausgenommen.
- [x] **T-009 Offene Dependabot-Alarme für `qs` und `seroval` geschlossen.**
      Done 2026-11-04. Beleg: `express/**/qs` von 6.16.0 auf 6.16.1, `seroval` im
      Frontend-Lock von 1.6.8 auf 1.6.11 (inzwischen 1.6.12), `archiver/**/minimatch` auf 11.0.4;
      `yarn install --frozen-lockfile` und die CI-Tests
      `dependabot-security-resolutions`/`npm-package-constraints` bestehen.
- [x] **T-008 Wiki-Prüfung in CI verankern und Test portabel machen.** Done
      2026-11-04. Beleg: `.github/workflows/lint-and-format.yml` führt im Job
      `quality` `node llm-wiki/tools/wiki-check.mjs` aus;
      `backend/test/ci/openappsec-local-policy.spec.js` normalisiert CRLF, damit der
      Test auch auf Windows-Checkouts läuft. CI-Lauf `41894222573` grün, inklusive
      Wiki-Schritt und Backend-Tests.
- [x] **T-005 OpenAppSec-Policy an das v1beta1-Schema angepasst.** Done 2026-11-04.
      Beleg: Die vom Installer erzeugte Policy nutzt benannte Practice- und
      Log-Trigger-Ressourcen, validiert gegen das veröffentlichte v1beta1-Schema; der
      Installer ruft `open-appsec-ctl --apply-policy` auf; Regressionstest
      `backend/test/ci/openappsec-local-policy.spec.js`. Live-Anwendung: T-007.
- [x] **T-004 OpenAPI-Spezifikation vervollständigt.** Done 2026-11-04. Beleg:
      `backend/schema/swagger.json` enthält 19 neue Pfade mit 22 Operationen:
      Analytics 5, OIDC 3, GitOps 8 Pfade/9 Operationen, Upload-Relay 3 Pfade/5
      Operationen. Alle `$ref`s lösen auf, Operation-IDs sind eindeutig (120 Pfade,
      169 Operationen, 168 IDs, 26 Tags).
- [x] **M-004 Glossare zusammengeführt.** Done 2026-11-04. Beleg:
      `reference/projekt/begriffe.md` verweist nur noch auf `reference/glossar.md`;
      das kuratierte Glossar linkt dieselbe Quelle.
- [x] **T-001 Widerspruch „SQLite nur in Entwicklung“ aufgelöst.** Done 2026-11-04.
      Beleg: `AGENTS.md` nennt SQLite als unterstützte Produktionsoption,
      `.cursorrules` unterscheidet Default/Alternativen; der alte Satz kommt nicht
      mehr vor.
- [x] **T-002 Reload-Beschreibung in `.cursorrules` präzisiert.** Done 2026-11-04.
      Beleg: `.cursorrules` beschreibt serielle Schreibvorgänge und den
      Docker-Debounce; kein Satz behauptet ein verzögertes Engine-Reload.
- [x] **T-003 Tote Pfadfilter in `docker.yml` bereinigen.** Done 2026-11-04. Beleg:
      Beide Einträge entfernt; `node llm-wiki/tools/wiki-check.mjs` prüft seitdem, dass
      jeder literale `paths`-Filterpfad existiert, und meldet PASS.
- [x] **T-006 Alt-Wiki in `llm-wiki` integriert.** Done 2026-11-04. Beleg:
      `docs/wiki-intern/` existiert nicht mehr; 103 Seiten liegen unter
      `llm-wiki/wiki/reference/`, Prüfskript meldet keine defekten Links.
      Siehe [Log](./log.md).
- [x] **T-000 LLM-Wiki initialisieren.** Done 2026-11-04. Beleg: `llm-wiki/` mit
      sechs Kernseiten und Bereichsseiten; Selbstprüfung per Link- und
      Index-Prüfskript ohne Befund (siehe [Log](./log.md)).
