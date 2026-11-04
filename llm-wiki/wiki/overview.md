# Überblick

Status: active
Last verified: 2026-11-04
Confidence: high

## Zweck

Diese Seite beantwortet in der gebotenen Kürze, was ShieldPM ist, für wen es
gedacht ist, woraus es besteht und wie man es startet, testet und baut. Sie ist
der erste Einstieg nach dem Index.

## Was das Projekt ist

ShieldPM (Shedowe's Shield Proxy Manager) ist ein sicherheitsfokussierter Fork
von Nginx Proxy Manager, der über NPMplus von Nginx Proxy Manager abstammt
(`README.md:12,133`, Name `GEMINI.md:15`). Es stellt eine Web-Oberfläche bereit, mit der
sich ein Nginx-Reverse-Proxy verwalten lässt: Proxy-Hosts, Redirects, TCP/UDP-
Streams, TLS-Zertifikate, Access-Lists, IP-Firewall, WAF/IPS, Tunnels und DDNS.

- **Version:** `4.4.1` (`.version`, `backend/package.json:3`)
- **Lizenz:** proprietär; das Badge nennt „Proprietary“, die Pakete `UNLICENSED`
  (`README.md:5`, `backend/package.json:6`)
- **Primäre Ausgaben:** Docker-Image `ghcr.io/shedowe19/shieldpm:develop` und
  nativer Installer `scripts/install.sh` (`README.md:14`, `GEMINI.md:20`)

## Für wen

- Betreiber, die Reverse Proxies über eine Oberfläche statt per Hand konfigurieren.
- Sicherheitsorientierte Installationen, die WAF (ModSecurity, OpenAppSec),
  IPS (CrowdSec), mTLS und 2FA integriert brauchen.
- Agenten und Entwickler, die den Code ändern: sie starten hier und arbeiten sich
  über [Architektur](./architecture/overview.md) und [Module](./modules/overview.md) vor.

## Stack und Laufzeit

| Ebene               | Technik                                                            | Quelle                          |
| ------------------- | ------------------------------------------------------------------ | ------------------------------- |
| Backend-Laufzeit    | Node.js `>=26`, ESM, Yarn Classic 1.22.22                          | `backend/package.json:9-13`     |
| Backend-Framework   | Express `5.3`                                                      | `backend/package.json:29`       |
| Datenzugriff        | Objection.js `4.4.1` / Knex `3.3`                                  | `backend/package.json:38-42`    |
| Datenbank           | SQLite (`better-sqlite3`) standardmäßig, MySQL/MariaDB, PostgreSQL | `backend/package.json:24,41,46` |
| Frontend            | React `19.3` + TypeScript, Vite `8.3`                              | `frontend/package.json:72,121`  |
| UI                  | Tailwind CSS `4.3`, shadcn/ui auf Radix, TanStack Query `5.105`    | `frontend/package.json:47,118`  |
| Nginx-Konfiguration | LiquidJS-Templates                                                 | `backend/package.json:39`       |
| Webserver           | eigener OpenResty-basierter Nginx-Build aus `shieldpm-nginx`       | `GEMINI.md:68-75,99-108`        |

## Grobe Teile

| Pfad                       | Inhalt                                                                        |
| -------------------------- | ----------------------------------------------------------------------------- |
| `backend/`                 | Express-API, Fachlogik (`internal/`), Modelle, Routen, Migrations, Templates  |
| `frontend/`                | React-SPA, Seiten, Modals, API-Hooks, i18n                                    |
| `rootfs/`                  | Overlay für das Container-Image: Startskripte, systemd-Units, CrowdSec-Config |
| `scripts/`                 | Nativer Installer, CI-Hilfen, Tests der Infrastruktur                         |
| `caddy/`                   | Caddy-Konfiguration für den optionalen HTTP→HTTPS-Redirector                  |
| `docs/wiki/`               | öffentliche englische Anwenderdoku                                            |
| `llm-wiki/wiki/reference/` | Tiefendoku (ehemals `docs/wiki-intern`)                                       |
| `.github/workflows/`       | 13 CI-Workflows                                                               |

## Starten, testen, bauen

```bash
# Container
docker compose up -d          # UI danach auf https://<host>:81
```

Beim ersten Aufruf zeigt die UI ein selbstsigniertes Zertifikat; die
Browser-Warnung bestätigen. Es gibt keine Standard-Zugangsdaten: Das Setup-Wizard
legt den Admin an, alternativ `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD`
(`README.md:31-33`).

```bash
# Entwicklung (zwei Terminals)
yarn --cwd frontend install --frozen-lockfile && yarn --cwd frontend dev
yarn --cwd backend  install --frozen-lockfile && yarn --cwd backend  dev

# Prüfen (aus dem Repository-Wurzelordner)
yarn --cwd backend test --run
yarn --cwd frontend test --run && yarn --cwd frontend build
node scripts/ci/tscanner.mjs
```

Quellen: `README.md:23-31`, `README.md:102-123`, `frontend/package.json:19-26`.
Details: [Laufzeit und Start](./infrastructure/runtime.md),
[Build und Release](./infrastructure/build-and-release.md),
[Tests](./testing/overview.md).

## Aktueller Status

Aktive Entwicklung auf Branch `develop`. Der letzte gemergte Stand ist
`9c434181` („Merge pull request #158 …“, 2026-10-27). Die letzte Release-Marke ist
`v4.4.1`. Was gerade fertig ist und was offen ist, steht im
[aktuellen Projektzustand](./current-project-state.md) und in den
[Aufgaben](./tasks.md).

## Ausdrücklich außerhalb des Umfangs

- **Nginx-Binaries, Module und die Root-`nginx.conf`** liegen im separaten
  Repository `shieldpm-nginx`, nicht hier (`GEMINI.md:99-108`).
- `docs/wiki/` ist die öffentliche Anwenderdoku und überwiegend englisch;
  `docs/wiki/TScanner.md` ist deutsch. Sie wird hier nur verlinkt:
  [öffentliche Doku](../../docs/wiki/Home.md).

## Unbekanntes

- Unklar: Es gibt keine Angabe im Repository, ob und wann ein öffentliches
  Release außerhalb von `develop` geplant ist. `confidence: low`.
- Unklar: Ob die Tiefendoku unter `llm-wiki/wiki/reference/` und die öffentliche
  Doku unter `docs/wiki/` denselben Release-Zyklus haben; beide werden unabhängig
  aktualisiert. `confidence: low`.

## Verwandte Seiten

- [Index](./index.md)
- [README des Repositories](../../README.md)
- [Aktueller Projektzustand](./current-project-state.md)
- [Architektur](./architecture/overview.md)
- [Aufgaben](./tasks.md)
- [Tiefendoku: Projektüberblick](reference/projekt/ueberblick.md)
