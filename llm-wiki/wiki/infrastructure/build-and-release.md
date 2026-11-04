# Build und Release

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite beschreibt, wie das Docker-Image entsteht, welche CI-Workflows prüfen
und veröffentlichen und welche Regeln für Versionierung gelten.

## Dockerfile

Drei Stages (`Dockerfile`):

1. **frontend** — Debian Trixie slim, Node 26 über `scripts/setup-node-apt.sh`,
   Yarn 1.22.22, `yarn tsc && yarn vite build`. Die Datei
   `backend/templates/ip-blocked.html` wird mitkopiert, damit die Vorschau im
   Editor dieselbe Sperrseite nutzt.
2. **backend** — installiert Produktionsabhängigkeiten, lädt `anubis` und
   `oauth2-proxy` als Binaries, entfernt Sourcemaps und strippt native Module.
3. **final** — Basis `ghcr.io/shedowe19/shieldpm-nginx:master`, Node 26,
   Laufzeitpakete (GeoIP, WireGuard, DB-Clients), `rootfs/` als Overlay,
   Entrypoint `tini -g -- entrypoint.sh`, Healthcheck `healthcheck.sh`.

Wichtig: Die Basis und damit Nginx-Version, Module und Root-`nginx.conf` kommen
aus dem separaten Repository `shieldpm-nginx` (`GEMINI.md:99-108`).

## CI-Workflows

`.github/workflows/` enthält 13 Workflows:

| Workflow                     | Aufgabe                                            |
| ---------------------------- | -------------------------------------------------- |
| `docker.yml`                 | Image bauen und für `develop`/Tags veröffentlichen |
| `docker-latest.yml`          | Latest-Build mit Smoke-Tests                       |
| `dockerlint.yml`             | Dockerfile-Linting                                 |
| `caddy.yml`, `caddy-fmt.yml` | Caddy-Image und Formatprüfung                      |
| `codeql.yml`                 | statische Sicherheitsanalyse                       |
| `json.yml`                   | JSON-Validierung                                   |
| `lint-and-format.yml`        | Biome/Lint/Format, Wiki-Prüfung, Typprüfung, Tests |
| `npm-updates.yml`            | Abhängigkeitsaktualisierung                        |
| `shellcheck.yml`             | Shell-Skripte                                      |
| `spellcheck.yml`             | Rechtschreibung                                    |
| `tscanner.yml`               | projekt eigene AST-Regeln, read-only               |
| `wiki-sync.yml`              | `docs/wiki/**` ins GitHub-Wiki spiegeln            |

Der Job `quality` prüft zusätzlich das interne Wiki mit
`node llm-wiki/tools/wiki-check.mjs` (Links, Index, Struktur, Redaktion und
Secret-Muster). Der Schritt braucht keine installierten Abhängigkeiten.

Der Docker-Workflow baut bei Änderungen an `backend/**`, `frontend/**`,
`rootfs/**`, `Dockerfile`, `.version` und weiteren Pfaden
(`.github/workflows/docker.yml:7-24,29-46`).

## Lokaler Build

```bash
docker build -t shieldpm:local .
```

## Versionierung

- Quelle der Wahrheit sind drei Dateien: `.version`, `backend/package.json`,
  `frontend/package.json` (`GEMINI.md:346-356`).
- Vor dem Erhöhen wird der Umfang (Patch/Minor/Major) mit dem Nutzer geklärt.
- Danach alle drei Dateien ändern und den Commit taggen.
- Tags folgen `v*` (z. B. `v4.4.1`).

## Risiken und Stolperfallen

- **Arch-Tags:** Der Workflow verhindert, dass ein Lauf die Manifest-Tags eines
  anderen überschreibt (`concurrency: docker-publish-<ref>`).
- **Basis-Drift:** Ein neues Nginx-Modul erfordert eine Änderung in
  `shieldpm-nginx`; im Dockerfile allein passiert nichts.
- **Bundle-Budget:** Das Frontend hat ein komprimiertes Budget
  (`frontend/performance-budget.json`); neue große Abhängigkeiten brechen es.
- **Pfadfilter:** `docker.yml` filtert nur auf existierende Pfade; die früheren
  Einträge `global/certbot-dns-plugins.json` und `nginx-quic/**` wurden entfernt.
  Das Prüfwerkzeug kontrolliert das.

## Offene Fragen

- Keine offenen Fragen auf dieser Seite; der Pfadfilter-Punkt ist mit `T-003`
  erledigt (Prüfung 12 im Werkzeug).

## Verwandte Seiten

- [Laufzeit und Start](./runtime.md)
- [Konfiguration](./configuration.md)
- [Tests](../testing/overview.md)
- [Build (Tiefe)](../reference/entwicklung/build.md)
- [Deployment (Tiefe)](../reference/entwicklung/deployment.md)
