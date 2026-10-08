# Build

## Zweck

Beschreibung des Build-Prozesses für Docker und Native.

## Docker Build

### Multi-Stage Build

Das `Dockerfile` verwendet drei Stages:

#### Stage 1: Frontend

- **Basis**: Debian Trixie mit dem eingecheckten NodeSource-APT-Setup für Node.js 26
- **Aktion**: installiert Yarn Classic `1.22.22` und baut die React-App aus dem eingefrorenen Lockfile mit TypeScript + Vite
- **Ausgabe**: `/app/dist` (statische Dateien)

#### Stage 2: Backend

- **Basis**: dieselbe Debian-Trixie-NodeSource-APT-Runtime mit Node.js 26
- **Aktion**: installiert Node-Dependencies aus dem eingefrorenen Lockfile und lädt Anubis + OAuth2-Proxy herunter
- **Abhängigkeiten**: Es werden ausschließlich Produktionsabhängigkeiten des Backends installiert; Vitest, Biome und TypeScript gelangen nicht mehr aus dieser Stage in das Laufzeitimage.
- **Optimierungen**: Entfernt Source-Maps, strippt native Module
- **Ausgabe**: `/app` (Backend-Anwendung)

#### Stage 3: Final

- **Basis**: `ghcr.io/shedowe19/shieldpm-nginx:master`
- **Aktion**: Kopiert Backend + Frontend + rootfs-Overlay + WireGuard-Tools
- **Entrypoint**: `tini -g -- entrypoint.sh` (Exec-/JSON-Syntax; Stoppsignale an die Prozessgruppe)
- **Healthcheck**: `healthcheck.sh` (Exec-/JSON-Syntax, ohne zusätzliche Shell-Hülle)

### Befehl

```bash
docker build -t shieldpm:local .
```

`.dockerignore` schließt lokale `node_modules`, Builds, Git-Metadaten und eigene `.env`-Dateien aus. Die eingecheckte Standarddatei `rootfs/data/.env` und `rootfs/.env.example` bleiben ausdrücklich im Build-Kontext. Die Frontend-Abhängigkeiten werden vor dem Kopieren des übrigen Quellcodes installiert, damit reine Quellcodeänderungen den Dependency-Cache erhalten.

### GitHub-Actions-Builds bei Pull Requests

Pull Requests aus demselben Repository melden sich mit dem vorhandenen `GITHUB_TOKEN` bei GHCR an, damit die finale Stage das Nginx-Basisimage laden kann. Das Package muss dem Workflow-Repository Lesezugriff gewähren. Ohne Anmeldung lieferte GHCR im PR-Build HTTP 401 beim Abruf des Basisimages.

PR-Builds laden das fertige Image nur in den lokalen Docker-Daemon des Runners (`load: true`, `push: false`); Registry-Push, Multiarch-Veröffentlichung und Releases bleiben auf Ereignisse außerhalb von Pull Requests begrenzt. Fork-PRs erhalten über den Login-Schritt keine Registry-Zugangsdaten und benötigen ein anonym zugängliches Basisimage für den vollständigen Build.

Vom Docker-Workflow erfasste Pushes auf `develop` veröffentlichen nach erfolgreichen Builds beider Architekturen das Multiarch-Image `ghcr.io/shedowe19/shieldpm:develop` und erstellen für eine noch unveröffentlichte `.version` ein GitHub-Release mit den nativen Installern und LXC-Templates. Der Workflow besitzt für Branch-Pushes einen Pfadfilter; reine Wiki-Änderungen lösen diesen Build nicht aus. Ein Push des passenden `v<version>`-Tags kann dasselbe Release auslösen; ein manueller Workflow-Start erstellt kein Release. Der erste Release-Lauf legt einen fehlenden Versions-Tag auf dem tatsächlich gebauten Commit an. Ein bereits vorhandenes Release bleibt bei weiteren Builds derselben Version unverändert; ein vorhandener Tag auf einem anderen Commit verhindert die Veröffentlichung, bis `.version` erhöht ist.

Vor dem isolierten Anwendungstest ruft der Docker-Workflow in beiden Architektur-Jobs `scripts/ci/geoip-update-smoke.sh` auf. Dieser separate Test führt den echten GeoIP-Helfer des gebauten Images mit Netzwerkzugriff zweimal auf demselben temporären Datenvolume aus: zunächst für alle drei fehlenden Datenbanken, danach für eine erneute Latest-Release-Prüfung. Bei unverändertem Release müssen SHA-256, Größe, Inode und Änderungszeit erhalten bleiben und erneute Asset-Downloads ausbleiben; ein inzwischen geänderter Release-Snapshot darf entsprechend aktualisierte Dateien liefern. Dabei werden keine Anwendungsdienste gestartet.

Der Online-Smoke erhält den vorhandenen Workflow-Token als `GEOIP_GITHUB_TOKEN` ausschließlich für die Release-Metadatenanfrage; das Skript übergibt Docker nur den Variablennamen. Dadurch nutzt dieser Check nicht die anonyme GitHub-API-Quote der gemeinsam genutzten Runner-IP. Asset-Downloads bleiben öffentlich. Ein gültiger Altbestand nach einem Anbieterfehler reicht für diesen Check weiterhin nicht: Beide Durchläufe müssen die Latest-Metadaten erfolgreich prüfen. Ein HTTP 403 beim zweiten x86_64-Durchlauf von PR #150 ließ am 8. Oktober 2026 den Image-Build bestehen, aber den Smoke mit dieser Prüfung korrekt scheitern; die damaligen Logs enthielten keine Response-Header und belegen die genaue Ursache des 403 nicht.

Anschließend führt `scripts/ci/docker-smoke.sh` in beiden Architektur-Jobs einen echten Containerstart mit PUID/PGID `0` und `1000` aus: Bei Pull Requests aus dem lokal geladenen Image, bei Pushes aus dem veröffentlichten Architekturbild. Die Runner `ubuntu-latest` und `ubuntu-24.04-arm` passen nativ zu ihren Images; QEMU ist dafür nicht erforderlich. Jeder Container erhält ein eigenes temporäres Datenvolume und `--network none`. `TZ=UTC`, deaktiviertes IPv6, `SKIP_IP_RANGES=true` und der ausdrückliche GeoIP-Opt-out `GEOIP_AUTO_UPDATE=false` halten diesen Anwendungstest unabhängig von externen Diensten.

Ein ausdrücklich als Testfixture gekennzeichneter Marker im ACME-Account-Verzeichnis überspringt ausschließlich die sonst vor dem Dienststart versuchte Registrierung. Er enthält keine Zugangsdaten und ist kein nutzbarer ACME-Account. Die Prüfung wartet höchstens 180 Sekunden pro Container auf den vorhandenen Healthcheck. Anschließend prüft sie als jeweilige Service-UID den Backend-Socket, schreibt in die generierte Standardkonfiguration und das Certbot-Plugin-Verzeichnis, führt `nginx -tq`, Reload und Healthcheck aus und kontrolliert, dass `/run`, `/tmp` und `/usr/local` weiterhin Root gehören. Bei Fehlern werden Status und begrenzte Containerlogs ausgegeben; Container, Volumes und lokale Fixtures werden auch im Fehlerfall entfernt. Der Workflow-Schritt ist zusätzlich auf zehn Minuten begrenzt.

Die isolierte gRPC-/Stream-/HTTP-Vorlagenprüfung reserviert alle IPv4-TCP-/UDP-Listener bis nach Konfigurationserzeugung und `nginx -t`, damit spätere Portzuteilungen ihre eigenen früheren Listener nicht wiederverwenden. TCP-Reservierungen schließen versehentliche Verbindungen sofort. `nginx-smoke-endpoints.mjs` gibt die Reservierungen erst unmittelbar vor dem Start frei und verlangt anschließend einen echten HTTP/2-Settings-Austausch als Bereitschaftsnachweis. Nur die konkrete Nginx-Meldung `bind() ... (98: Address already in use)` an einem IPv4-Testlistener erlaubt neue Ports mit erneuter Syntaxprüfung; insgesamt gibt es höchstens drei Startversuche. Upstream-Adressen und -Ports bleiben bei diesem Wechsel erhalten. Syntaxfehler, andere Startfehler, Bereitschafts-Timeouts und fehlerhafte Antworten bleiben fatal. Lokale Regressionstests verwenden echte TCP-/UDP-Sockets und Kindprozesse; der tatsächliche Image-/Nginx-Nachweis läuft weiterhin im Docker-Job.

Lokal verwendet `bash scripts/ci/docker-smoke.sh IMAGE` ausschließlich ein bereits geladenes Image derselben Architektur. `scripts/tests/test_docker_smoke.py` prüft Erfolg, Health-Timeout und Schreibfehler einschließlich Cleanup mit einem simulierten Docker-CLI; der Docker-Build-Job führt den tatsächlichen Docker-Lauf aus.

## Frontend Build (standalone)

```bash
cd frontend
yarn install --production=false
yarn tsc          # TypeScript-Prüfung
yarn vite build   # Produktions-Build
```

### Modulpfade

`frontend/vite.config.ts` aktiviert Vites nativen Resolver mit `resolve.tsconfigPaths: true`. Damit gelten die
Alias-Pfade aus `frontend/tsconfig.json` (`src/*`, `@/*` und `test/*`) im Entwicklungsserver, in Vitest und im
Produktions-Build ohne das zusätzliche Plugin `vite-tsconfig-paths`.

### Komprimiertes Bundle-Budget

Nach jedem Frontend-Build prüft `frontend/scripts/ci/check-bundle-budget.cjs` die mit zlib bei höchster Stufe
komprimierten JavaScript- und CSS-Assets. Die versionierte Datei `frontend/performance-budget.json` begrenzt den
größten JavaScript-Chunk, alle JavaScript-Chunks zusammen und alle Stylesheets zusammen. Das Quality-Gate führt die
Prüfung nach `yarn build` aus. Ein lokaler Lauf lautet:

```bash
(cd frontend && node scripts/ci/check-bundle-budget.cjs --dist dist --budget performance-budget.json)
```

Die Budgets sind keine Core-Web-Vitals-Messung; sie verhindern reproduzierbar Größenregressionen. Änderungen an ihnen
erfordern eine gemessene neue Baseline und eine begründete Anpassung.

Nach dem Dependency-Update in PR #144 maß der CI-Build 1.246.277 Byte für alle
gzip-komprimierten JavaScript-Assets zusammen. Das Gesamtbudget wurde dafür von 1.242.000 auf 1.255.000 Byte
angepasst; der neue Grenzwert lässt rund 8,7 KB Spielraum über der gemessenen Baseline. Die Limits für den größten
JavaScript-Chunk und die Stylesheets blieben unverändert.

Für IP-Firewall einschließlich Länder- und ASN-Regeln in PR #149 wurde der `develop`-Vergleichsstand mit 1.246.243 Byte und der
erweiterte Build mit 1.275.682 Byte gemessen: 29.439 Byte beziehungsweise rund 2,4 % zusätzliche komprimierte
JavaScript-Assets. Das Gesamtbudget wurde deshalb von 1.255.000 auf 1.285.000 Byte angepasst. Die Grenzwerte für
den größten JavaScript-Chunk und die Stylesheets blieben unverändert; die gemessenen 284.537 beziehungsweise
16.310 Byte liegen weiterhin innerhalb dieser Grenzen.

Das Dependency-Update in PR #150 wurde gegen den abschließenden `develop`-Stand von PR #149 gemessen:
1.284.756 Byte vor und 1.285.712 Byte nach dem Update, also 956 Byte beziehungsweise rund 0,074 % zusätzliche
komprimierte JavaScript-Assets. Beide Quality-Läufe des Update-Commits bestätigten die neue Baseline. Das bisherige
Gesamtbudget hatte vor dem Update nur 244 Byte Spielraum; es wird deshalb von 1.285.000 auf 1.290.000 Byte
angepasst. Der neue Grenzwert lässt 4.288 Byte Spielraum über der verifizierten Baseline. Der größte
JavaScript-Chunk (284.601 Byte) und die Stylesheets (16.325 Byte) bleiben innerhalb ihrer unveränderten Limits.

## Native / LXC Build

Vor dem Export des LXC-Rootfs entfernt der Workflow SSH-Hostkeys und leert die Maschinen-ID. Ein aktivierter Systemd-Dienst erzeugt fehlende SSH-Hostkeys vor dem SSH-Start pro Instanz. Bereinigungs-Globs werden innerhalb des Builder-Containers ausgewertet, damit sie dessen Dateisystem erfassen.

Der Installer erwartet das entpackte native Release-Paket mit `app/`, `html/`, `usr/` und `rootfs/`. Dieses Paket enthält die zuvor gebauten Anwendungsdateien und Nginx-Binaries; der Installer klont das Repository nicht. Ein Aufruf der einzelnen `scripts/install.sh` aus einem normalen Checkout ersetzt das native Paket nicht.

```bash
tar -xzf shieldpm-install-linux-amd64.tar.gz
sudo bash install.sh
```

## Build-Artefakte

Die aktuelle Version wird in `.version` gespeichert (Plain Text, z.B. `4.4.1` ohne `v`). Diese Version synchronisiert sich mit `backend/package.json` und `frontend/package.json`.

| Artefakt            | Pfad                          | Beschreibung           |
| ------------------- | ----------------------------- | ---------------------- |
| Frontend-Bundle     | `frontend/dist/`              | Kompiliertes React SPA |
| Anubis Binary       | `/usr/local/bin/anubis`       | PoW-Gate               |
| OAuth2-Proxy Binary | `/usr/local/bin/oauth2-proxy` | SSO-Proxy              |
| rootfs-Overlay      | `/` (im Container)            | System-Konfiguration   |

## Verwandte Seiten

- [Deployment](./deployment.md)
- [Setup](./setup.md)
