# Aufgaben

> Eine Aufgabe = eine Checkbox = ein prüfbares Abnahmekriterium.
> Erledigt heißt: geprüft, datiert und nach **Done** verschoben, mit Beleg.
> Aufgaben werden nie gelöscht, sondern verschoben.

## Now

- Keine offenen Aufgaben. T-001 und T-002 sind erledigt (siehe **Done**).

## Next

- [ ] **T-005 OpenAppSec-Policy gegen den laufenden Agent prüfen.** Abnahme:
      `open-appsec-ctl --apply-policy` meldet auf einer laufenden Instanz keinen
      Schemafehler. Die erzeugte Policy entspricht seit 2026-11-04 dem
      v1beta1-Schema (benannte Practice und Log-Trigger). Kontext:
      [offene Fragen](./questions/open-questions.md).

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

## Maintenance

> Wiederkehrende Aufgaben bleiben offen; ihre Erfüllung steht im Feld
> „Letzter Lauf“ und im Log.

- [ ] **M-001 Werkzeug-Lint.** Letzter Lauf: 2026-11-04. Nächster Auslöser: etwa
      20 neue Seiten oder ein Release. Abnahme:
      `node llm-wiki/tools/wiki-check.mjs` meldet PASS; der Lauf ist in `log.md`
      vermerkt.
- [ ] **M-002 Manuelle Lint-Prüfung.** Letzter Lauf: 2026-11-04. Gleicher
      Auslöser. Abnahme: Widersprüche, überholte Aussagen, verwaiste Seiten,
      fehlende Querverweise, Fast-Duplikate und die Tabelle „Selbstprüfung“ in
      [Abdeckung](./coverage.md) sind geprüft; Befunde sind als Aufgaben abgelegt.
- [ ] **M-003 Offene Fragen triage.** Letzter Lauf: 2026-11-04. Abnahme: Jede
      Zeile in [Offene Fragen](./questions/open-questions.md) hat eine Prüfstelle
      und ist beantwortet, als Aufgabe verlinkt oder begründet geschlossen.
- [x] **M-004 Glossare zusammengeführt.** Done 2026-11-04. Beleg:
      `reference/projekt/begriffe.md` verweist nur noch auf `reference/glossar.md`;
      das kuratierte Glossar linkt dieselbe Quelle.

## Done

- [x] **T-004 OpenAPI-Spezifikation vervollständigt.** Done 2026-11-04. Beleg:
      `backend/schema/swagger.json` enthält 19 neue Pfade mit 22 Operationen:
      Analytics 5, OIDC 3, GitOps 8 Pfade/9 Operationen, Upload-Relay 3 Pfade/5
      Operationen. Alle `$ref`s lösen auf, Operation-IDs sind eindeutig (120 Pfade,
      162 Operationen).
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
