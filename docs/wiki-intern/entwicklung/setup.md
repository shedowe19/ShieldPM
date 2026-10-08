# Entwicklungs-Setup

## Zweck

Anleitung zur Einrichtung der lokalen Entwicklungsumgebung.

## Voraussetzungen

- Node.js v26+ (über das signierte NodeSource-APT-Repository)
- npm / yarn
- Git

Die Paketverwaltung bleibt bei Yarn Classic 1.22.22. `frontend/.yarnrc` deaktiviert dessen ungenutzte
Workspace-Verarbeitung; beide Anwendungspakete sind eigenständige Projekte. Das Dockerfile kopiert diese
Konfiguration bereits vor der Dependency-Installation. `csstype` ist im Frontend ein direkter Dev-Peer für
Goober; das Backend deklariert `@types/node` für seine Node-JSDoc-Typen und den TypeScript-Check. Mysql2s
verpflichtender Peer kann diese Typdefinitionen unter Yarn Classic auch in die Produktionsinstallation ziehen.

Die verbleibenden Backend-Resolution-Warnungen für Axios und Basic FTP stammen aus den noch älteren
Versionsanforderungen von Duo beziehungsweise `get-uri`. Die Sicherheits-Pins bleiben bei Axios 1.20.0 und
Basic FTP 6.2.2; der FTP-Kompatibilitätsadapter ist im [Deployment-Vertrag](./deployment.md) beschrieben.
Warnungen über `bare`, `bun`, `deno` oder `pnpm` als unbekannte Engines betreffen Metadaten von Drittpaketen:
Yarn Classic kennt diese Engine-Namen nicht. Die unterstützten Node-Versionen werden weiterhin geprüft;
`--ignore-engines` wird dafür nicht verwendet.

Der Solid-Lockeintrag verwendet 1.9.16 mit den von Upstream gemeinsam angeforderten Seroval- und
Plugin-Versionen 1.6.8. Der frühere Seroval-Override ist deshalb entfallen. Certbot verwendet für IDN-Domains
wie Nginx bereits die direkte Bibliothek `punycode.js`, damit Node 26 das veraltete eingebaute Modul nicht lädt.

## Frontend starten

```bash
cd frontend
yarn install
yarn dev     # Startet Vite Dev-Server
```

## Backend starten

```bash
cd backend
yarn install
yarn dev     # Startet backend/index-dev.js auf 127.0.0.1:3000
```

Der `dev`-Script in `backend/package.json` führt `node index-dev.js` aus. Nach dem Listen startet der Proxy-Host-Monitor-Scheduler; beim Beenden per `SIGINT` oder `SIGTERM` wird er gestoppt.

## Tests ausführen

```bash
# Backend
(cd backend && yarn test --run) # Vitest einmalig ausführen

# Frontend
(cd frontend && yarn test --run) # Vitest einmalig ausführen
```

Für die Infrastrukturregressionen wird zusätzlich Python 3 benötigt:

```bash
python3 -m unittest discover -s scripts/tests -v
```

Die Tests prüfen Datenmigration, Certbot-Verknüpfungen, Shell-Syntax, unveränderte Zugangsdaten nach dem Schreiben der Umgebungsdatei sowie den AIO-Authentifizierungsablauf mit simuliertem Backend. Hinzu kommen wiederholte Konfigurationswechsel, interne Standardzertifikate, OCSP-Deaktivierung, GoAccess-Abschaltung, sichere Wiki-Graph-Ausgabe und die begrenzte CrowdSec-Test-CLI. Sie führen keine Installation und keine Dienständerung durch; HTTP-Anfragen sind vollständig ersetzt. Der Graph-Test verwendet Node.js, das der Shellcheck-Workflow ausdrücklich bereitstellt.

## Wichtige Dateien für die Entwicklung

| Datei                         | Zweck                                             |
| ----------------------------- | ------------------------------------------------- |
| `backend/index-dev.js`        | Einstiegspunkt für Entwicklung                    |
| `backend/index.js`            | Einstiegspunkt für Produktion                     |
| `backend/knexfile.js`         | Knex-Konfiguration (DB-Verbindung)                |
| `backend/db.js`               | Datenbankinitialisierung                          |
| `backend/setup.js`            | Initial-Setup (Admin-User, Default-Einstellungen) |
| `frontend/vite.config.ts`     | Vite-Konfiguration                                |
| `frontend/tailwind.config.js` | Tailwind-Konfiguration                            |

## Datenbank (Entwicklung)

SQLite wird automatisch verwendet. Die Datei wird bei lokalem Start unter `backend/data/shieldpm/database.sqlite` angelegt (`DATA_PATH` ist standardmäßig `${process.cwd()}/data`). Im Container liegt sie unter `/data/shieldpm/database.sqlite`. Migrationen laufen beim Start automatisch.

## Code-Qualität

```bash
# Biome Linting & Formatting
npx biome check .
npx biome check --write .
```

Konfiguration: `backend/biome.json` und `frontend/biome.json`. Die jeweilige `$schema`-URL muss zur per Lockdatei
installierten Biome-Version passen, damit der Linter keine Schema-Diagnose ausgibt.

### TScanner-Projektregeln

Das unabhängige private Paket `.tscanner/` ergänzt neun eingebaute Regeln und vier lokale AST-Prüfungen. Es benötigt
Node 26 und Yarn Classic 1.22.22, ohne die Anwendungsabhängigkeiten zu installieren:

```bash
yarn --cwd .tscanner install --frozen-lockfile --ignore-scripts --production=false
node .tscanner/scripts/editor.mjs
node scripts/ci/tscanner.mjs --validate
node scripts/ci/tscanner.mjs
```

Die VSCode-Empfehlung und Aufgaben liegen unter `.vscode/`. Vorgabe der drei AI-Reviews ist der Codex-Adapter.
Für lokale Aufrufe auf dem eigenen Rechner `npm install -g @openai/codex` und
`codex login` ausführen, anschließend `node scripts/ci/tscanner.mjs --only-ai` für die drei AI-Regeln starten.
Der Adapter verwendet das lokal konfigurierte Codex-Modell und eine `read-only`-Sandbox ohne Genehmigungsdialoge.
Bei einer abweichenden Installation bezeichnet `SHIELDPM_TSCANNER_CODEX_CLI` den ausführbaren Client, keine
Shell-Befehlszeile.

Der gesonderte Workflow `.github/workflows/tscanner-codex.yml` unterstützt nach ausdrücklicher Freischaltung einen
eigenen Linux-Runner mit den Labels `self-hosted`, `linux`, `shieldpm-codex`. Für diesen Runner die geprüfte CLI mit
`npm install -g @openai/codex@0.161.0` einmalig auf dem Server installieren; der Workflow installiert sie nicht.
Die verpflichtende Vorprüfung testet das Berechtigungsprofil mit `codex sandbox`, ohne einen AI-Aufruf. Systemweite
Codex-Dateien `/etc/codex/config.toml` und `/etc/codex/managed_config.toml` sind in dieser Umgebung unzulässig.
Anmeldung und Runner-Dienst müssen denselben Benutzer ohne
Root-Rechte verwenden. Ein privates persistentes `CODEX_HOME` außerhalb des Checkouts, standardmäßig
`/var/lib/shieldpm-codex`, besitzt Modus `0700`, seine `auth.json` Modus `0600`. Der Betreiber meldet sich dort mit
`codex -c 'cli_auth_credentials_store="file"' login --device-auth` an, nachdem er diesen Pfad als `CODEX_HOME`
exportiert hat. Es werden keine API-Keys oder Anmeldecaches an GitHub übertragen. Die Abo-Nutzungsgrenzen gelten.

Erst nach Registrierung, Anmeldung und Prüfung des Dienstbenutzers setzt der Betreiber die Repository-Variable
`SHIELDPM_CODEX_RUNNER_ENABLED=true`; `SHIELDPM_CODEX_HOME` kann den Standardpfad ersetzen. Der Job läuft nur für
`develop` im ursprünglichen Repository, nach einem Push oder manuell durch `shedowe19`, ohne PR-/Fork- oder
Zeitplan-Ausführung. Bots und andere Mitwirkende starten diesen AI-Job nicht.
Er ignoriert die Codex-Benutzerkonfiguration und zusätzliche CLI-Regeln, erzwingt ChatGPT-/OpenAI-Anmeldung und
verwendet das CLI-Standardmodell. Dieses Verhalten gilt nur für den freigeschalteten Runner-Modus.

OpenAIs Anleitung zur Kontoanmeldung in CI rät ausdrücklich von öffentlichen/Open-Source-Repositories ab; der
Betreiber hat diesen Weg für seinen eigenen vertrauenswürdigen Runner gewählt. Setup-Befehle, die konkrete
Dokumentationseinschränkung, Runner-Abgrenzung, Windows-Hinweise, Git-Modi und Berichte stehen in der
[vollständigen TScanner-Anleitung](../../wiki/TScanner.md#codex-auf-einem-eigenen-github-actions-runner).

## Verwandte Seiten

- [Build](./build.md)
- [Tests](./tests.md)
- [Lokale Entwicklung](./lokale-entwicklung.md)
