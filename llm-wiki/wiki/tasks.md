# Aufgaben

> Eine Aufgabe = eine Checkbox = ein prüfbares Abnahmekriterium.
> Erledigt heißt: geprüft, datiert und nach **Done** verschoben, mit Beleg.
> Aufgaben werden nie gelöscht, sondern verschoben.
> **Blocked** heißt: das Kriterium ist formuliert, aber nur außerhalb dieses
> Repositorys prüfbar. **Routinen** sind wiederkehrend und keine Checkboxen.

## Now

- Keine offenen Aufgaben.

## Blocked

- [ ] **T-007 OpenAppSec-Policy auf einer laufenden Instanz anwenden.** Abnahme:
      `open-appsec-ctl --apply-policy` meldet keinen Schemafehler und die aktive
      Policy entspricht `local_policy.yaml`. Blockiert: braucht einen laufenden
      OpenAppSec-Agent, der in dieser Umgebung nicht vorhanden ist. Die Policy
      selbst ist gegen das veröffentlichte v1beta1-Schema validiert und durch
      `backend/test/ci/openappsec-local-policy.spec.js` abgesichert.

## Backlog-Kandidaten (unbestätigt)

- `llm-wiki/wiki/reference/offene-fragen.md:17` — End-to-End-Beispiel für Authentik als
  Auth-Typ `AUTHENTIK_PROXY` fehlt.
- `llm-wiki/wiki/reference/offene-fragen.md:18` — IP-Ranges-Quellen für weitere CDNs prüfen.
- `llm-wiki/wiki/reference/offene-fragen.md:16` — Native/LXC-Pfad für das OpenAppSec-
  Advanced-Modell nachweisen.
- `backend/models/token.js:80` — Kommentar „Hack: some tokens out in the wild have
  a scope of 'all' instead of 'user'“. Kein Fehler, nur prüfen, ob die
  Sonderbehandlung noch nötig ist.
- `frontend/src/pages/Users/Table.tsx:78` — Kommentar „Hack to reuse domains
  formatter“. Aufräumkandidat ohne bekannten Fehler.

## Routinen

| Routine                         | Letzter Lauf | Nächster Auslöser                | Abnahme                                                                                                                                                                                    |
| ------------------------------- | ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M-001 Werkzeug-Lint**         | 2026-11-04   | etwa 20 neue Seiten oder Release | `node llm-wiki/tools/wiki-check.mjs` meldet PASS; Lauf im [Log](./log.md)                                                                                                                  |
| **M-002 Manuelle Lint-Prüfung** | 2026-11-04   | gleicher Auslöser                | Widersprüche, überholte Aussagen, verwaiste Seiten, Querverweise, Fast-Duplikate und die Tabelle „Selbstprüfung“ in [Abdeckung](./coverage.md) sind geprüft; Befunde als Aufgaben abgelegt |
| **M-003 Fragen-Triage**         | 2026-11-04   | gleicher Auslöser                | Jede Zeile in [Offene Fragen](./questions/open-questions.md) hat eine Prüfstelle und ist beantwortet, als Aufgabe verlinkt oder begründet geschlossen                                      |

## Done

- [x] **T-005 OpenAppSec-Policy an das v1beta1-Schema angepasst.** Done 2026-11-04.
      Beleg: Die vom Installer erzeugte Policy nutzt benannte Practice- und
      Log-Trigger-Ressourcen, validiert gegen das veröffentlichte v1beta1-Schema; der
      Installer ruft `open-appsec-ctl --apply-policy` auf; Regressionstest
      `backend/test/ci/openappsec-local-policy.spec.js`. Live-Anwendung: T-007.
- [x] **T-004 OpenAPI-Spezifikation vervollständigt.** Done 2026-11-04. Beleg:
      `backend/schema/swagger.json` enthält 19 neue Pfade mit 22 Operationen:
      Analytics 5, OIDC 3, GitOps 8 Pfade/9 Operationen, Upload-Relay 3 Pfade/5
      Operationen. Alle `$ref`s lösen auf, Operation-IDs sind eindeutig (120 Pfade,
      162 Operationen).
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
