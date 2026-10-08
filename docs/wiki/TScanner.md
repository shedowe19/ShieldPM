# TScanner für ShieldPM

## Zweck und Umfang

TScanner ergänzt die vorhandenen Biome-, TypeScript-, Test-, Dependency-Audit- und CodeQL-Prüfungen um
ShieldPM-spezifische Entwicklungsregeln. Die Einrichtung umfasst einen lokalen CLI-Wrapper, Editor-Empfehlungen,
VSCode-Aufgaben, eine deterministische CI-Prüfung und drei AI-Reviews. AI kann lokal oder nach ausdrücklicher
Freischaltung auf einem eigenen Linux-Runner ausgeführt werden.

Der Scanner läuft als separates, privates Entwicklungspaket unter `.tscanner/`. Er gehört weder zum laufenden
ShieldPM-Backend noch zum Produktionsimage. `.tscanner/` und `.vscode/` sind vom Docker-Build-Kontext ausgeschlossen.

## Installation

Voraussetzungen sind Node.js 26 oder neuer und Yarn Classic **1.22.22**. Alle folgenden Befehle werden im
ShieldPM-Repository ausgeführt:

```bash
yarn --cwd .tscanner install --frozen-lockfile --ignore-scripts --production=false
node .tscanner/scripts/editor.mjs
node scripts/ci/tscanner.mjs --validate
node scripts/ci/tscanner.mjs
```

Das Paket pinnt TScanner auf **0.1.3** und die Babel-Parser-/Traverse-Abhängigkeiten auf **8.0.7**; die vollständige
Auflösung steht in `.tscanner/yarn.lock`. Installationsskripte werden nicht ausgeführt. TScanner benötigt außerdem seine
optionale native Plattformabhängigkeit: Linux x64/arm64, macOS x64/arm64 oder Windows x64. Daher nicht mit
`--ignore-optional` installieren.

Das Setup erfordert keine Installation der Backend- oder Frontend-Abhängigkeiten, solange ausschließlich die
Scanner-Regeln und deren eigene Tests ausgeführt werden.

## Prüfmodi

| Befehl                                                 | Umfang                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `node scripts/ci/tscanner.mjs`                         | Vollständiger deterministischer Quellscan mit sichtbarer Bestands-Baseline.               |
| `node scripts/ci/tscanner.mjs --branch origin/develop` | Geänderte Zeilen seit dem gemeinsamen Git-Vorfahren von `HEAD` und dem angegebenen Ref.   |
| `node scripts/ci/tscanner.mjs --staged`                | Geänderte Zeilen der vollständig gestagten Quelldateien.                                  |
| `node scripts/ci/tscanner.mjs --uncommitted`           | Geänderte Zeilen der getrackten, gestagten und ungestagten Arbeitskopie gegenüber `HEAD`. |
| `node scripts/ci/tscanner.mjs --validate`              | Konfiguration und referenzierte Prompt-Dateien prüfen.                                    |
| `node scripts/ci/tscanner.mjs --only-ai`               | Nur die drei AI-Regeln für den vollständigen konfigurierten Workspace.                    |
| `node scripts/ci/tscanner.mjs --include-ai`            | Deterministische Regeln und AI-Regeln für den vollständigen Workspace.                    |

Der Branch-Ref muss lokal auflösbar sein; bei Bedarf zuerst den gewünschten Ref regulär mit Git aktualisieren. Der
Wrapper berechnet den Merge-Base selbst. Er verwendet keinen Vergleich mit einem möglicherweise inzwischen
weiterentwickelten Branch-Endstand.

Pro Lauf ist nur einer der Git-Modi zulässig. AI-Modi lassen sich nicht mit Git-Modi kombinieren: Die veröffentlichte
TScanner-Version begrenzt AI-Eingaben nicht zuverlässig auf die ausgewählten geänderten Dateien. Deshalb bietet
ShieldPM AI-Reviews ausschließlich als vollständige Workspace-Prüfung an, auch auf dem eigenen Runner.

### Arbeitskopie und Index

TScanner liest Quelldateien aus der Arbeitskopie. Ein `--staged`-Lauf lehnt deshalb scannbare Dateien ab, die sowohl
gestagte als auch weitere ungestagte Änderungen enthalten. Entweder die vollständigen gewünschten Änderungen
stagen oder den vollständigen Scan ausführen; ein Teil-Commit darf nicht anhand einer anderen Dateifassung geprüft werden.

`--branch` und `--uncommitted` lehnen ungetrackte scannbare Quelldateien ab, weil der native Git-Zeilenvergleich sie
auslassen würde. Neue Dateien zuerst stagen oder den vollständigen Scan verwenden. Ein reiner Staged-Scan prüft nur
den vorgesehenen Commitumfang.

Der Wrapper bietet bewusst keine beliebigen positionalen Datei-/Glob-Scans an. Native Skriptregeln können unabhängig
von einer solchen Dateiauswahl alle passenden Projektdateien lesen; die Git-Modi filtern ihre Befunde anschließend
auf geänderte Zeilen. Die native Kennzahl `scanned_files` zählt diese Skripteingaben nicht separat.

## Aktive Regeln

### Deterministische Regeln

Neun eingebaute Regeln prüfen unerreichbaren Code, konstante Bedingungen, nutzlose Catch-Blöcke, leere Klassen und
Interfaces, Funktionsumfang, Parameterzahl sowie im Frontend unbehandelte Promises und unnötige Typzusicherungen.

`max-function-length` verwendet **100 direkte Statements im Funktionsblock**, keine Zeilenanzahl oder rekursive
Komplexitätsmessung. `max-params` verwendet **8 Parameter**. Die Promise-Prüfung ist ein Hinweis aus statischer
Quellanalyse und ersetzt die TypeScript-Prüfung nicht. Unerreichbarer Code ist ein Fehler; die übrigen eingebauten
Regeln liefern Hinweise.

Vier lokale AST-Regeln verwenden den gepinnten Babel-Parser statt bloßer Textmuster:

| Regel                       | Projektvertrag                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `backend-esm`               | Produktive Backend-Module verwenden ESM; deklarierte `.cjs`-Bootstrap-Dateien bleiben zulässig. |
| `structured-backend-errors` | Backend-Routen und interne Services verwenden die zentrale Fehlerfactory für ihre Fehler.       |
| `component-api-hooks`       | Komponenten, Seiten und Modals nutzen die API-/Hook-Schicht für Netzwerkanfragen.               |
| `centralized-nginx-reload`  | Backend-Reloads laufen über den zentralen Nginx-Konfigurationsservice.                          |

Tests, generierte Dateien, Dependencies, Builds, Datenverzeichnisse und das Scanner-Paket sind keine produktive
Quellscan-Fläche. Die konkreten Dateimuster und begründeten Ausnahmen stehen in `.tscanner/config.jsonc` und dem
AST-Regelskript. Diese Regeln ersetzen keine vollständige Autorisierungs-, Datenfluss- oder Sicherheitsanalyse.

### Fehler, Hinweise und Baseline

Neue Fehler blockieren den Lauf. Warnungen und Informationsbefunde bleiben sichtbar und beratend. Dagegen gelten
**Scanner-Warnungen** wie eine fehlgeschlagene Skriptregel als Ausführungsfehler: ungültige Berichte, Konfigurationen,
Parser-/Skriptfehler und native Scannerfehler dürfen keinen erfolgreichen Qualitätslauf vortäuschen.

Bei der Einführung wurden **57 vorhandene Befunde zu rohen Backend-Fehlern** in `.tscanner/baseline.json` erfasst.
Das sind sichtbare Altbefunde, keine durch diese Einrichtung behobenen Fehler. Der vollständige JSON-Bericht enthält
sie weiterhin; die Zusammenfassung trennt sie von neuen blockierenden Fehlern.

Die Baseline bindet Ausnahmen an Datei, Regel, Meldung und Quellzeile sowie die zulässige Anzahl. Sie erlaubt weder
pauschal eine Datei noch unbegrenzt weitere gleiche Fehler. **Geänderte-Zeilen-Scans wenden die Baseline nicht an**:
Ein entsprechender Befund auf einer geänderten Zeile muss korrigiert werden.

Eine Aktualisierung ist eine bewusste, zu reviewende Änderung, kein automatischer Reparaturbefehl:

```bash
node scripts/ci/tscanner.mjs --update-baseline
git diff -- .tscanner/baseline.json
```

Zuerst die vollständigen Befunde prüfen und neue Fehler beheben. Anschließend die Baseline-Änderung einzeln
beurteilen. Der Befehl ist ausschließlich für einen vollständigen deterministischen Scan zulässig; AI-/Git-Modi oder
Scanner-Ausführungsfehler können keine neue Baseline erzeugen.

## VSCode

`.vscode/extensions.json` empfiehlt **`lucasvtiradentes.tscanner-vscode`**. Die Extension benötigt VSCode 1.93 oder
neuer. ShieldPM im Repository-Root öffnen, die Scanner-Dependencies installieren und die empfohlene Extension
installieren. Upstream sucht lokale Pakete ausgehend vom Workspace-Root; das eigenständige Paket unter `.tscanner/`
benötigt deshalb eine explizite Binärzuordnung:

```bash
node .tscanner/scripts/editor.mjs
# Alternativ:
yarn --cwd .tscanner editor:setup
```

Der Helper ermittelt das installierte native Plattform-Binary der gepinnten Version und trägt seinen Pfad als
`tscanner.lsp.bin` in die lokale `.vscode/settings.json` ein. Bestehende JSONC-Kommentare und andere Einstellungen
bleiben erhalten; ungültige oder mehrdeutige Konfigurationen sowie Symlink-Ziele werden abgelehnt. Die Settings-Datei
bleibt privat und Git-ignoriert; Extension-Empfehlung und Aufgaben sind versioniert. So verwendet die Extension den
Scanner aus `.tscanner/` statt einer zufällig vorhandenen globalen Version.

Über **Tasks: Run Task** führt **TScanner: Set up local editor** zunächst die Installation der gepinnten Dependencies
und danach den Helper aus. Weitere Aufgaben starten vollständigen Scan, Staged-Scan, Uncommitted-Scan und einen
manuell ausgelösten lokalen AI-Review. Die Installationsaufgabe verwendet ebenfalls Yarn 1.22.22 mit eingefrorenem
Lockfile und deaktivierten Installationsskripten.

Die Helper-Tests prüfen die echte native Binärversion und die sichere JSONC-Bearbeitung. Die tatsächliche
VSCode-Oberfläche wird durch diese CLI-Tests nicht abgedeckt.

Die Extension zeigt native Befunde, einschließlich bestehender Fehler. Die Baseline-Entscheidung des ShieldPM-Gates
findet im Wrapper statt; dessen Aufgaben und CI-Berichte sind deshalb maßgeblich für den Gate-Status. Der reguläre
Startscan ist aktiviert, automatische AI-Intervalle und AI-Startscans sind ausgeschaltet.

## Lokale AI-Reviews

Die konfigurierte Vorgabe ist **Codex** über den lokalen `custom`-Provider. Die offizielle CLI wird separat auf dem
eigenen Rechner installiert und angemeldet:

```bash
npm install -g @openai/codex
codex login
node scripts/ci/tscanner.mjs --only-ai
# Alternativ: deterministische Regeln und AI-Reviews gemeinsam
node scripts/ci/tscanner.mjs --include-ai
```

Die Scanner-Installation und ShieldPM-Benutzeranmeldung erzeugen keine Codex-Zugangsdaten. Der Adapter verwendet
das in der lokalen Codex-Konfiguration gewählte Modell; ShieldPM erzwingt kein eigenes Modell.

`.tscanner/config.jsonc` setzt `ai.provider` auf `custom` und `ai.command` auf
`./.tscanner/providers/codex`. Der ausführbare Launcher startet `.tscanner/providers/codex.mjs`; der getrennte
`.tscanner/providers/codex-worker.mjs` führt Codex aus und überwacht Timeout und Bereinigung. Codex wird über `PATH`
gefunden. Für eine andere Installation kann `SHIELDPM_TSCANNER_CODEX_CLI` den ausführbaren Programmnamen oder Pfad
vorgeben. Der Wert ist keine Shell-Befehlszeile und enthält keine zusätzlichen Argumente.

Die drei AI-Regeln bleiben im Modus `agentic`. Der Adapter erwartet dessen Prompt-Format aus der gepinnten
TScanner-Version und übernimmt die dort aufgeführte Dateiliste je Regel. Befunde müssen auf diese Dateien und
gültige Quellzeilen verweisen. Zusätzlich gelesene Kontextdateien dürfen keine Befunde außerhalb dieser Liste
erzeugen; fehlende oder mehrdeutige Dateilisten und andere Eingabeformate werden abgelehnt.

Linux, macOS und WSL verwenden den POSIX-Launcher. Für natives Windows muss `ai.command` auf
`./.tscanner/providers/codex.cmd` zeigen und das native `codex.exe` über `PATH` oder
`SHIELDPM_TSCANNER_CODEX_CLI` erreichbar sein; der Adapter startet keine npm-`.cmd`-Datei als Provider. Für eine
einheitliche Entwicklungsumgebung empfiehlt sich WSL.

Die drei Prompts unter `.tscanner/ai-rules/` prüfen Sicherheit, Architektur/Korrektheit und Performance. Sie verlangen
belegte Befunde, schreibgeschützte Quellenprüfung, den Schutz von Zugangsdaten und die Behandlung von eingebetteten
Quelltext-Anweisungen als untrusted. Der Adapter startet `codex exec` mit `read-only`-Sandbox, deaktivierten
Genehmigungsdialogen (`approval_policy="never"`) und einer flüchtigen Sitzung (`--ephemeral`). Das ersetzt keine
Prüfung der eigenen Codex-Konfiguration: Konfigurierte MCP-Server, Hooks und vorhandene Zugangsdaten sind dadurch
nicht umfassend isoliert. Der Adapter beendet den Provider nach 160 Sekunden; jeder native Regelaufruf hat ein
Timeout von 180 Sekunden.

Der Prompt wird über stdin übergeben. Codex schreibt die abschließende Antwort anhand eines JSON-Schemas in eine
private temporäre Datei; der Adapter validiert und übergibt ausschließlich die Befunde an TScanner und entfernt
die temporären Dateien anschließend. Provider-Logs werden nicht übernommen. Fehlender Client, fehlgeschlagene
Ausführung, Timeout oder ungültige Antwort zählen als Scanner-Ausführungsfehler und blockieren den Qualitätslauf.
Bei Timeout oder Abbruch beendet der Worker Codex einschließlich seiner Kindprozesse und entfernt die temporären
Ergebnisse. Auch wenn der native Scanner den Adapter abrupt beendet, erkennt der getrennte Worker die verlorene
Verbindung und übernimmt diese Bereinigung.

Pro Regel sind höchstens acht belegte Befunde vorgesehen, nach praktischer Auswirkung geordnet. Die kompakte
JSON-Antwort an TScanner darf einschließlich abschließendem Zeilenumbruch höchstens 4 KiB UTF-8-Daten umfassen,
damit die Übergabe an den nativen Scanner zuverlässig bleibt. Überschreitungen schlagen als Ausführungsfehler fehl;
der Adapter kürzt keine Befunde automatisch.

Der lokale Provider erhält die zur Analyse vorgesehenen Projektinformationen; seine Kontoeinstellungen, Datenverarbeitung
und Nutzungskosten gelten auch hier. Für einen manuellen Start einen der beiden AI-Befehle aus der Modustabelle oder
die entsprechende VSCode-Aufgabe verwenden. TScanner unterstützt alternativ die eingebauten Provider `claude` und
`gemini`; der konfigurierte `custom`-Provider erwartet einen ausführbaren Programmpfad, keine Shell-Befehlszeile mit
Argumenten.

Reguläre GitHub-CI-Jobs lehnen AI-Aufrufe ab. Die einzige CI-Ausnahme ist der unten beschriebene, ausdrücklich
freigeschaltete eigene Runner. Es gibt keine geplanten AI-Läufe. Provider-Sitzungen, native Scanner-Caches und
temporäre AI-Prompts sind nicht Bestandteil der CI-Artefakte. Die Integrationsprüfung verwendet eine simulierte
Provider-CLI und prüft reguläre CI-Ablehnung, Runner-Voraussetzungen, Codex-Adapter und native Scanner-Anbindung.
Dazu gehören die Dateilistenprüfung und die Bereinigung nach Timeout oder abruptem Beenden des Adapters.
Sie führt keinen echten AI-Aufruf aus und prüft weder die Anmeldung noch die Modellverfügbarkeit oder Abo-Auslastung.
Die Prozess- und Pipeline-Prüfungen laufen unter Linux; der bereitgestellte native Windows-Launcher ist durch diese
Prüfläufe nicht abgedeckt.

## Codex auf einem eigenen GitHub-Actions-Runner

`.github/workflows/tscanner-codex.yml` ergänzt die deterministische Prüfung um einen gesonderten AI-Job. Er ist
zunächst ausgeschaltet und wird erst mit der Repository-Variable `SHIELDPM_CODEX_RUNNER_ENABLED=true` aktiv.
Der Job ist an `shedowe19/ShieldPM`, `develop` und die Labels `self-hosted`, `linux`, `shieldpm-codex` gebunden.
Er läuft nach einem Push auf `develop` oder einem manuellen Start auf `develop` durch den Kontoinhaber
`shedowe19`, ohne Pull-Request-, Fork- oder Zeitplan-Trigger. Pushes durch Bots oder andere Mitwirkende starten
diesen AI-Job nicht. AI-Befunde sind beratend; Provider-/Scanner-Ausführungsfehler lassen den Job fehlschlagen.

Die Anmeldung verwendet das ChatGPT-Konto des Betreibers und dessen gültige Codex-Nutzungsgrenzen. Ein API-Key
oder automatischer API-Fallback wird nicht verwendet. OpenAIs
[Anleitung zur Kontoanmeldung in CI](https://learn.chatgpt.com/docs/auth/ci-cd-auth) beschreibt diesen Weg für
vertrauenswürdige private Automatisierung und rät ausdrücklich von öffentlichen oder Open-Source-Repositories ab.
ShieldPM ist öffentlich; die hier ausdrücklich vom Betreiber gewählte Einrichtung ist deshalb keine von dieser
Anleitung empfohlene öffentliche CI-Konfiguration. Die Einschränkung wird durch einen eigenen Runner nicht aufgehoben.

### Server vorbereiten und anmelden

1. Einen ausschließlich dafür verwendeten Linux-Runner mit einem eigenen Benutzer ohne Root-Rechte bereitstellen.
   Diesen Benutzer nicht für die produktive ShieldPM-Instanz verwenden und ihm keinen Docker-Socket oder
   passwortlosen Root-Zugriff geben. Auf demselben Server mit derselben Anmeldung keine öffentlichen PR-Jobs
   oder sonstigen nicht vertrauenswürdigen Workflows ausführen.
2. Die für den Runner geprüfte CLI mit `npm install -g @openai/codex@0.161.0` installieren; dafür Node.js 26+
   bereitstellen. Diese Versionsvorgabe betrifft nur den Runner, nicht die lokale Installation oben.
   `codex` muss im `PATH` des Runner-Dienstes liegen; eine nur in der interaktiven Shell vorhandene Installation
   reicht nicht. Die CLI muss das Berechtigungsprofil und die direkte Sandbox-Prüfung unterstützen;
   die verpflichtende Vorprüfung bricht andernfalls vor einem AI-Aufruf ab. CLI-Upgrades erst nach gemeinsamer
   Prüfung von Profil, Sandbox und Provider-Protokoll außerhalb eines Review-Jobs durchführen.
   Der Workflow stellt Node 26 bereit
   und installiert die Scanner-Dependencies mit der gepinnten Yarn-Version 1.22.22.
3. Ein persistentes Codex-Verzeichnis außerhalb des Runner-Checkouts vorbereiten. Der Standard ist
   `/var/lib/shieldpm-codex`; Eigentümer muss derselbe Benutzer sein, unter dem der Runner-Dienst ausgeführt wird.
   Das Verzeichnis muss Modus `0700` haben, `auth.json` Modus `0600`; beide dürfen keine Symlinks sein.
4. Als dieser Runner-Benutzer anmelden:

```bash
export CODEX_HOME=/var/lib/shieldpm-codex
umask 077
codex -c 'cli_auth_credentials_store="file"' login --device-auth
chmod 600 "$CODEX_HOME/auth.json"
```

Falls die Geräteanmeldung noch deaktiviert ist, sie in den ChatGPT-Sicherheitseinstellungen freigeben und den
von Codex angezeigten Link und Einmalcode verwenden. Weitere Hinweise stehen in der
[Codex-Anmeldedokumentation](https://learn.chatgpt.com/docs/auth). Anmeldecodes und `auth.json` gehören nicht
in Repository, GitHub-Secrets, Logs, Tickets oder Artefakte. Die Anmeldung auf dem Server ausführen, nicht als
anderer Benutzer auf dem Entwicklungsrechner. `auth.json` bleibt auf dem Server und wird von Codex bei Bedarf
erneuert; sie nicht bei jedem Job aus einer alten Kopie überschreiben.

### Runner registrieren und freischalten

Den Runner unter **Settings → Actions → Runners → New self-hosted runner** für ShieldPM registrieren und das
zusätzliche Label **`shieldpm-codex`** vergeben. Der Runner-Dienst muss als der zuvor angemeldete Benutzer laufen.
Unter **Settings → Secrets and variables → Actions → Variables** anschließend diese Repository-Variablen setzen:

| Variable                        | Wert und Zweck                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `SHIELDPM_CODEX_RUNNER_ENABLED` | Erst nach vollständigem Setup auf `true` setzen; ohne diesen Wert bleibt AI aus. |
| `SHIELDPM_CODEX_HOME`           | Optionaler absoluter Pfad; Standard `/var/lib/shieldpm-codex`.                   |

Der Workflow übernimmt den gewählten Pfad als `CODEX_HOME`. `scripts/ci/tscanner-runner.mjs` prüft vor dem ersten AI-Aufruf die
Runner-/Repository-/Branch-/Kontoinhaber-Bindung, Besitz und Rechte des privaten Verzeichnisses sowie eine gespeicherte
ChatGPT-Anmeldung. API-Zugangsdaten in der Umgebung oder im Anmeldecache werden abgelehnt. Der Codex-Aufruf
erzwingt ChatGPT-Anmeldung, den OpenAI-Provider und dateibasierten Zugangsdaten-Speicher. Er ignoriert die
Benutzerkonfiguration und zusätzlichen CLI-Regeln; daher verwendet der Runner das CLI-Standardmodell.
Eine Modellauswahl im Benutzerprofil gilt für diesen Aufruf nicht. Repository- oder Elternverzeichnis-Konfiguration unter
`.codex/config.toml` ist für diesen Modus unzulässig. Ebenso werden systemweite Codex-Konfigurationen unter
`/etc/codex/config.toml` und `/etc/codex/managed_config.toml` abgelehnt, damit sie das Profil nicht überschreiben.
Die eigene Runner-Umgebung darf diese Dateien nicht enthalten. Die lokale Verwendung bleibt davon unberührt.

Der Runner verwendet das eingeschränkte Berechtigungsprofil `shieldpm-review`, keine Genehmigungsdialoge und
flüchtige Sitzungen. Das Profil erlaubt schreibgeschützte Quellen im Checkout, verweigert den Zugriff auf
`CODEX_HOME` aus Befehlen in der Sandbox und deaktiviert deren Netzwerkzugriff. Hooks, Apps und Websuche sind aus;
die Shell erhält eine bereinigte Umgebung. Die Vorprüfung kontrolliert die tatsächliche Verweigerung des
Zugriffs auf den Anmeldecache, ohne ihn zu protokollieren. Dazu verwendet sie den direkten CLI-Unterbefehl
`codex sandbox -P shieldpm-review …`, keinen AI-Aufruf. Der Runner-Aufruf aktiviert das Profil über
`default_permissions`; ein zusätzliches `--sandbox` würde die Profilwahl überschreiben und wird deshalb nicht
verwendet. Die Prompts erlauben Quellenlesen und schreibgeschützte
Suche, verbieten aber die Ausführung von Projektcode, Installationen und Netzwerkbefehlen. Der Provider-Prozess
selbst braucht weiterhin Netzwerk und Anmeldung. Das ist keine vollständige Isolation des Servers. Der Betreiber
muss die vertrauenswürdigen Quellen und den Zugriff auf die Runner-Maschine selbst absichern.

Eine gemeinsame Warteschlange ohne Abbruch eines laufenden Jobs verhindert konkurrierende Nutzung der Anmeldung.
`RAYON_NUM_THREADS=1` führt die drei nativen AI-Regeln nacheinander aus; jede hat das oben beschriebene
Provider-Zeitlimit. Andere Maschinen und manuelle Codex-Aufrufe dürfen denselben Anmeldecache nicht gleichzeitig
verwenden. Nach der Freischaltung lässt sich **TScanner Codex** in Actions manuell auf `develop` starten.
Bei erschöpftem Kontingent oder ungültiger Anmeldung schlägt der Job fehl; es erfolgt kein Wechsel auf bezahlte API-Nutzung.

## CI und Berichte

`.github/workflows/tscanner.yml` läuft bei Pushes, Pull Requests und manuellem Workflow-Start. Pushes prüfen den gesamten
Workspace; Pull Requests die geänderten Zeilen seit dem gemeinsamen Git-Vorfahren. Der Job installiert nur die gepinnten
Scanner-Dependencies, prüft sie mit `yarn audit --level high`, führt die eigenen Tests aus und verwendet ausschließlich
`contents: read`.

Der Wrapper schreibt standardmäßig nach `.tscanner/reports/`:

| Datei                   | Inhalt                                                              |
| ----------------------- | ------------------------------------------------------------------- |
| `tscanner-results.json` | Vollständige native Befunde und Scanner-Statistik.                  |
| `gate-results.json`     | Gate-Status, neue Fehler, Altbefunde und Scanner-Ausführungsfehler. |
| `summary.md`            | Lesbare Zusammenfassung; in GitHub zusätzlich als Job Summary.      |

`--report-dir PFAD` erlaubt ein anderes Berichtsverzeichnis. GitHub erhält bis zu 30 Inline-Annotationen; das Artefakt
enthält den vollständigen Bericht und wird **7 Tage** aufbewahrt. Der Workflow postet keine PR-Kommentare und benötigt
weder Schreibrechte noch Provider-Secrets. Auch bei einem fehlgeschlagenen Scan werden bereits erzeugte Berichte
aufbewahrt. Der gesonderte Codex-Workflow verwendet dieselben Berichtsformate und die Aufbewahrung von sieben
Tagen; sein privates `CODEX_HOME` ist von den Artefakten ausgeschlossen. Die deterministischen Prüfungen laufen
weiterhin auf GitHub-Runnern und benötigen keine Codex-Anmeldung.

## Tests und Wartung

```bash
yarn --cwd .tscanner test
```

Die eigenen Tests prüfen AST-Regeln, Wrapper-/Baseline-Verhalten und den echten nativen Scanner einschließlich
Fehlerfällen. Normale Backend-/Frontend-Tests, Biome, TypeScript, Builds, Dependency-Audits und Docker-Smokes laufen
weiterhin über ihre bestehenden Befehle und Workflows.

Bei einem Scanner-Upgrade Paket, Lockfile, Schema-URL, Regeln und Integrationsprüfungen gemeinsam aktualisieren.
Hinweise zuerst im Kontext prüfen; keine Sicherheits-Pins, Prüfschritte oder Ressourcenbudgets zum Verdecken von
Warnungen entfernen. Architektur-Reviews berücksichtigen aktuelle Quellen: etwa unterstütztes SQLite, begründete
parametrisierte SQL-Abfragen und serialisierte Nginx-Änderungen ohne erfundene globale Debounce-Pflicht.

## Verwandte Seiten

- [Entwicklung](./Development.md)
- [Architektur](./Architecture.md)
- [Sicherheit](./Security.md)
- [Wiki-Startseite](./Home.md)
