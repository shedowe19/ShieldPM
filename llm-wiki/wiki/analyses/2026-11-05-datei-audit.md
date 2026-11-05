# Datei-Audit 2026-11-05

Status: active
Last verified: 2026-11-05
Confidence: high

## Zweck

Ergebnis des vollständigen Datei-Audits mit mehreren Agents: Jede der 2.066
getrackten Dateien wurde einem Batch zugeordnet, von einem Agenten gelesen und
mit einem eigenen Urteil versehen; auffällige Dateien wurden von einem zweiten
Modell nachgeprüft.

## Methode

- 152 Batches à 14 Dateien, explizite Dateiliste pro Batch im Manifest.
- 1 Inventar-Agent, 152 Prüf-Agents (`deepseek-flash`), 20 Nachprüf-Agents
  (`gpt-6.1-sol`), insgesamt 173 Agents.
- Abdeckung: 2.066 von 2.066 Dateien, 0 unvollständige Batches.

## Ergebnis

| Urteil  | Anzahl |
| ------- | -----: |
| sauber  |  1.687 |
| Warnung |    350 |
| Fehler  |     22 |

## Behobene Fehler

| Datei                                                                            | Befund                                                                                                             | Behebung                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `llm-wiki/tools/wiki-check.mjs`                                                  | Bild-Regex im `while`-Kopf neu erzeugt → Endlos-Loop bei `<img>`                                                   | Regex konstant gehalten und `lastIndex` zurückgesetzt                  |
| `backend/internal/ai/executor.js`                                                | `update_user_permissions` reichte verschachteltes `permissions` weiter, `setPermissions` erwartet flache Schlüssel | verschachtelte Werte werden flach übernommen                           |
| `backend/schema/paths/analytics/series/get.json`                                 | `start`/`end` als Integer, Route nutzt ISO-Strings; `interval` ungenutzt                                           | `date-time`, `interval` entfernt                                       |
| `backend/schema/paths/analytics/summary/get.json`                                | `start`/`end` als Integer                                                                                          | `date-time`                                                            |
| `backend/schema/paths/analytics/top-hosts/get.json`                              | Integer-Typen, ignoriertes `limit`, fehlendes `sort`                                                               | `date-time`, `limit` entfernt, `sort` ergänzt                          |
| `backend/schema/paths/nginx/proxy-hosts/hostID/upload-relay/uploadID/patch.json` | 200 statt 204, keine Parameter/Body/TUS-Header                                                                     | Pfad-/Header-Parameter, Binär-Body, 204/409/412                        |
| `backend/schema/paths/nginx/tor-onion/get.json`                                  | Array, Route liefert `{services, tor}`                                                                             | Objekt-Schema                                                          |
| `docs/wiki/Backup-Restore.md`                                                    | `docker compose logs -f app`                                                                                       | `shieldpm`                                                             |
| `docs/wiki/OpenAppSec.md`                                                        | alte Inline-Policy und alter Advanced-Model-Pfad                                                                   | v1beta1-Policy und `/advanced-model`                                   |
| `docs/wiki/Proxy-Hosts.md`                                                       | Rate-Limit-Einheit `hour`, nicht existierender Connect-Shortcut                                                    | `second`/`minute`, Shortcut entfernt                                   |
| `frontend/src/locale/README.md`                                                  | `HelpDoc/index.tsx` existiert nicht                                                                                | `index.ts`                                                             |
| `llm-wiki/wiki/contradictions/2026-11-04-sqlite-in-produktion.md`                | behauptete weiterhin, der alte Satz stehe in `AGENTS.md`                                                           | als behoben formuliert                                                 |
| `llm-wiki/wiki/current-project-state.md`                                         | PR #160 als offen geführt                                                                                          | als gemergt (`f60a14f1`) geführt                                       |
| `llm-wiki/wiki/reference/api/schemas.md`                                         | Analytics-Routen fehlten angeblich                                                                                 | als seit T-004 vorhanden korrigiert                                    |
| `llm-wiki/wiki/reference/architektur/datenfluss.md`                              | 23 Stunden im Startskript                                                                                          | Backend-Default 72 Stunden                                             |
| `llm-wiki/wiki/reference/entwicklung/feature-implementation-2026-10-17.md`       | Median 83,48 statt 8,00 ms                                                                                         | 8,00 statt 83,48 ms                                                    |
| `llm-wiki/wiki/reference/module/2fa-service.md`                                  | `2fa_token_required`                                                                                               | `requires_2fa`                                                         |
| `llm-wiki/wiki/reference/module/certbot.md`                                      | Registrierung im Startskript, falsche Dateigröße                                                                   | lazy im Backend, 13,7 KB                                               |
| `llm-wiki/wiki/reference/module/ip-firewall.md`                                  | falscher GitOps-Pfad und falsche Funktion                                                                          | `/data/gitops/shieldpm-config/...`, `bulkGenerateConfigGroupsUnlocked` |
| `llm-wiki/wiki/reference/ui/i18n.md`                                             | 9 HelpDoc-Dateien                                                                                                  | 10 inklusive `WireguardTunnels.md`                                     |
| `scripts/ci/fixtures/README.md`                                                  | falscher SHA-256                                                                                                   | tatsächlicher Hash `d3e941bb...`                                       |

Ein Befund war ein Fehlalarm: `CertificateInUseFormatter.tsx:61` verwendet die
gültige JSX-Kurzform `value` (`value={true}`); `tsc --noEmit` ist grün.

## Zusätzlich bereinigt

- `.cursorrules`: Vitest-Version 5.1 statt 5.0.
- `AGENTS.md`: `$afterFind()` statt `$afterGet()`.
- `GEMINI.md`: SQLite als Default in allen Umgebungen.
- `.github/workflows/spellcheck.yml`: toter `REFACTOR_ROADMAP.md`-Skip entfernt.
- `renovate.json`: nicht existierender `php`-Base-Branch entfernt.
- `frontend/package.json`: `lint-staged` führt nur noch `biome check --write` aus.
- `.gitignore`: Yarn-`install-state.gz` ignoriert; beide Dateien aus dem Index entfernt.

## Offen

Die 350 Warnungen sind triagiert, aber nicht alle behoben. Schwerpunkte:
Sicherheits-Härtung (CSP, Demo-SSRF, Cookies), CI-Reproduzierbarkeit
(Docker-Digests, Hadolint-Pin, Version-Stamping), Schema-Verträge außerhalb der
22 Fehler, Migrations-Rollbacks und Übersetzungsvollständigkeit. Aufgabe:
`T-019`.

## Verwandte Seiten

- [Aufgaben](../tasks.md)
- [Abdeckung](../coverage.md)
- [Aktueller Projektzustand](../current-project-state.md)
- [Index](../index.md)
