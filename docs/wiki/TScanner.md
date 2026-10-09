# TScanner für ShieldPM

## Zweck und Umfang

TScanner ergänzt die vorhandenen Biome-, TypeScript-, Test-, Dependency-Audit- und CodeQL-Prüfungen um
ShieldPM-spezifische Entwicklungsregeln. Die Einrichtung umfasst einen lokalen CLI-Wrapper, Editor-Empfehlungen,
VSCode-Aufgaben und eine deterministische CI-Prüfung mit eingebauten Regeln und lokalen AST-Prüfungen.

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
| `node scripts/ci/tscanner.mjs --validate`              | Konfiguration und referenzierte Skriptregeln prüfen.                                      |

Der Branch-Ref muss lokal auflösbar sein; bei Bedarf zuerst den gewünschten Ref regulär mit Git aktualisieren. Der
Wrapper berechnet den Merge-Base selbst. Er verwendet keinen Vergleich mit einem möglicherweise inzwischen
weiterentwickelten Branch-Endstand.

Pro Lauf ist nur einer der Git-Modi zulässig.

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
beurteilen. Der Befehl ist ausschließlich für einen vollständigen Scan zulässig; Git-Modi oder
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
und danach den Helper aus. Weitere Aufgaben starten vollständigen Scan, Staged-Scan und Uncommitted-Scan.
Die Installationsaufgabe verwendet ebenfalls Yarn 1.22.22 mit eingefrorenem
Lockfile und deaktivierten Installationsskripten.

Die Helper-Tests prüfen die echte native Binärversion und die sichere JSONC-Bearbeitung. Die tatsächliche
VSCode-Oberfläche wird durch diese CLI-Tests nicht abgedeckt.

Die Extension zeigt native Befunde, einschließlich bestehender Fehler. Die Baseline-Entscheidung des ShieldPM-Gates
findet im Wrapper statt; dessen Aufgaben und CI-Berichte sind deshalb maßgeblich für den Gate-Status. Der reguläre
Startscan ist aktiviert. Automatische KI-Scans sind ausgeschaltet; der vom gepinnten Schema verlangte Eintrag
`aiRules` ist leer.

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
weder Schreibrechte noch zusätzliche Zugangsdaten. Auch bei einem fehlgeschlagenen Scan werden bereits erzeugte
Berichte aufbewahrt.

## Tests und Wartung

```bash
yarn --cwd .tscanner test
```

Die eigenen Tests prüfen AST-Regeln, Wrapper-/Baseline-Verhalten und den echten nativen Scanner einschließlich
Fehlerfällen. Normale Backend-/Frontend-Tests, Biome, TypeScript, Builds, Dependency-Audits und Docker-Smokes laufen
weiterhin über ihre bestehenden Befehle und Workflows.

Bei einem Scanner-Upgrade Paket, Lockfile, Schema-URL, Regeln und Integrationsprüfungen gemeinsam aktualisieren.
Hinweise zuerst im Kontext prüfen; keine Sicherheits-Pins, Prüfschritte oder Ressourcenbudgets zum Verdecken von
Warnungen entfernen. Projektregeln müssen aktuelle Quellen berücksichtigen: etwa unterstütztes SQLite, begründete
parametrisierte SQL-Abfragen und serialisierte Nginx-Änderungen ohne erfundene globale Debounce-Pflicht.

## Verwandte Seiten

- [Entwicklung](./Development.md)
- [Architektur](./Architecture.md)
- [Sicherheit](./Security.md)
- [Wiki-Startseite](./Home.md)
