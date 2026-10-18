# Eigenständige WASI-Anwendungen

## Zweck

Administratoren können eigene WASI-Preview-1-Kommandoanwendungen hochladen und unabhängig von einem
Proxy Host ausführen. Argumente, explizite Umgebungsvariablen und Standardeingabe gehören zu einem
einzelnen Aufruf. Das Ergebnis enthält Status, ursprünglichen WASI-Exitcode, Standardausgabe,
Standardfehlerausgabe und Laufzeit. Eine Anwendung wird nicht automatisch an HTTP-Anfragen gebunden.
Die vorhandenen Proxy-Wasm-Filter bleiben eine getrennte Ausführungsart.

## Kontext

ShieldPM benötigt bereits Node.js 26. Der integrierte `node:wasi`-Adapter führt WASI Preview 1 aus;
ein zusätzliches CLI, Paket oder eine Änderung der Wasmtime-/Nginx-Binaries ist dafür nicht erforderlich.
Pro Aufruf startet der Backend-Prozess eine feste JavaScript-Datei mit demselben Node-Binary. Die
hochgeladenen Bytes werden ausschließlich als WebAssembly kompiliert und instanziiert.

## Wichtige Dateien

- `backend/internal/wasi-applications.js`: privater Katalog, Berechtigungen und Eingabeprüfung.
- `backend/routes/nginx/wasi-applications.js`: HTTP-API und Abbruch bei Verbindungsende.
- `backend/lib/wasi-runner.js`: Begrenzungen, eigener Kindprozess und Ergebnisaufbereitung.
- `backend/lib/wasi-runner-child.js`: feste WASI-Ausführung mit expliziten Fähigkeiten.
- `backend/test/lib/wasi-runner.spec.js`: tatsächliche Kindprozess- und WASI-Ausführungstests.
- `backend/test/fixtures/standalone-wasi.wat` und `.wasm`: unabhängiges Testkommando.
- `backend/test/fixtures/standalone-wasi-*.wat` und `.wasm`: Fehler- und Ressourcenfälle.
- `frontend/src/pages/Settings/WasiApplications.tsx`: Oberfläche unter `/settings/wasi`.

## Oberfläche, Katalog und API

Unter **Einstellungen → WASI-Anwendungen** können Administratoren eine `.wasm`-Datei bis 16 MiB
hochladen, auswählen, ausführen und aus dem Katalog entfernen. Argumente werden als JSON-Liste,
Umgebungswerte als JSON-Objekt und die Standardeingabe als Text eingegeben. Die Oberfläche überträgt
Umgebungsnamen als Werte in einer Liste, damit die API-Schlüsselkonvertierung ihre Schreibweise nicht
verändert. **Stoppen**, ein Wechsel der Anwendung oder das Verlassen der Seite bricht den HTTP-Aufruf ab.
Verspätete Ergebnisse überschreiben keine neuere Auswahl.

Der eigene Anwendungskatalog liegt unter `DATA_PATH/wasm/applications`, unveränderliche Bytecode-Dateien
unter `DATA_PATH/wasm/artifacts`. Metadaten enthalten SHA-256, Namen, Dateinamen, Größe, Runtime und
Erstellungszeit; die Liste ist auf 512 Anwendungen begrenzt. Dateizugriffe prüfen erlaubte Verzeichnisse,
Symlinks, reguläre einzelne Inodes und Inhalts-Hashes. Katalogoperationen sind serialisiert. Beim Löschen
bleiben die unveränderlichen Bytes für bereits akzeptierte Ausführungen und andere Verweise erhalten.

Alle Endpunkte erfordern `settings:update`; die Prüfung erfolgt vor dem binären Upload-Parser sowie
vor Kompilierung, Katalogzugriff und Ausführung. Uploads und Starts sind auf 20 Aufrufe pro Minute/IP
begrenzt. Die Antworten verwenden `Cache-Control: no-store`.

| Methode | Pfad                                                 | Verhalten                                                             |
| ------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| GET     | `/api/nginx/wasm/applications`                       | Anwendungsliste ohne interne Dateipfade                               |
| POST    | `/api/nginx/wasm/applications?name=...&filename=...` | Binärer Upload mit `application/wasm` oder `application/octet-stream` |
| DELETE  | `/api/nginx/wasm/applications/{applicationID}`       | Katalogeintrag entfernen                                              |
| POST    | `/api/nginx/wasm/applications/{applicationID}/run`   | Einmaliger Aufruf mit `{args, env, stdin, timeout_ms}`                |

Ein HTTP-Verbindungsabbruch wird zum `AbortSignal` des tatsächlichen Kindprozesses. Audit-Einträge
enthalten nur Anwendung, Aktion, Status und Exitcode; Argumente, Umgebungswerte, Standardeingabe und
Ausgaben werden nicht gespeichert. Die erzeugte Ausgabe bleibt ausschließlich Teil der aktuellen Antwort.

## Verhalten

Der Aufrufvertrag lautet `{args, env, stdin, timeout_ms}`. `args` enthält höchstens 32 Zeichenketten;
ShieldPM stellt den festen Programmnamen `application.wasm` als erstes Argument voran. `env` ist eine
Liste aus höchstens 32 Objekten `{name, value}` mit eindeutigen Namen. Namen entsprechen
`^[A-Za-z_][A-Za-z0-9_]*$` und sind höchstens 128 Zeichen lang. Argumente und Umgebungswerte enthalten
keine NUL-Bytes und sind einzeln auf 4.096 UTF-8-Bytes begrenzt; zusammen mit Umgebungsnamen und
Trennbytes gelten höchstens 64 KiB. Die Standardeingabe hat separat höchstens 64 KiB. Fehlende
Argumente, Variablen und Eingabe werden durch leere Werte ersetzt.

Das Kommando erhält nur die explizit angegebenen WASI-Umgebungsvariablen. Der Kindprozess selbst
erbt keine Umgebungsvariablen, `NODE_OPTIONS`, Preload-Hooks oder Inspector-Argumente. Es gibt keine
vorgeöffneten Verzeichnisse (`preopens: {}`) und keine zusätzlich bereitgestellten Hostfunktionen.
Standardeingabe, Standardausgabe und Standardfehlerausgabe sind getrennte Pipes; die Steuerdaten
laufen über einen separaten IPC-Kanal. Der WASI-Dateideskriptorraum erhält dadurch kein geöffnetes
Verzeichnis für den internen IPC-Kanal.

`wasi.start()` benötigt einen exportierten Speicher namens `memory` und eine Funktion `_start`.
Ein `_initialize`-Reactor ist kein Kommando. Preview-2-/Component-Model-Anwendungen, beliebige
JavaScript-Imports und ein allgemeiner WASI-HTTP-Server werden durch diesen Runner nicht implementiert.
Die Kommandoanwendung wird pro manuellem Aufruf einmal ausgeführt und anschließend beendet.

Das Ergebnis enthält:

| Feld          | Bedeutung                                                                           |
| ------------- | ----------------------------------------------------------------------------------- |
| `status`      | `completed`, `failed`, `timed_out`, `output_limit` oder `cancelled`                 |
| `exit_code`   | Ursprünglicher WASI-Exitcode oder `null`, wenn kein vollständiges Ergebnis vorliegt |
| `stdout`      | Als UTF-8 dekodierte Standardausgabe                                                |
| `stderr`      | Als UTF-8 dekodierte Standardfehlerausgabe                                          |
| `duration_ms` | Gemessene Gesamtdauer einschließlich Prozessstart                                   |
| `signal`      | Beendigungssignal des Kindprozesses oder `null`                                     |
| `truncated`   | Ausgabe wurde an der gemeinsamen Ausgabegrenze abgeschnitten                        |

WASI-Exitcode 0 führt zu `completed`; ein anderer ursprünglicher Exitcode führt zu `failed`.
`returnOnExit: true` erhält auch Exitcodes außerhalb des acht Bit breiten Betriebssystem-Exitcodes.
Ein Trap liefert `failed` ohne interne Engine-Diagnose. Die vom Programm ausdrücklich geschriebenen
Ausgaben bleiben sichtbar; sie werden nicht in Audit- oder Enginefehlertext kopiert.

## Ressourcen und Vertrauensgrenze

- Höchstens zwei Kindprozesse laufen gleichzeitig. Eine Kapazität wird erst nach dem tatsächlichen
  Prozessende und dem Schließen der Ausgabepipes wieder freigegeben.
- Der Elternprozess erzwingt das Zeitlimit mit `SIGKILL`: standardmäßig 10.000 Millisekunden,
  konfigurierbar zwischen 100 und 60.000 Millisekunden. Ein `AbortSignal` beendet einen laufenden Aufruf.
- Die gemeinsam sichtbare UTF-8-Ausgabe ist auf 1 MiB begrenzt. Auch ungültige UTF-8-Bytes können
  durch Ersatzzeichen diese Grenze nicht umgehen. Ein Ausgabelimit beendet den Prozess.
- `--wasm-max-mem-pages=4096` begrenzt jeden Wasm-Speicher auf 256 MiB. Eine größere Anfangsbelegung
  scheitert; Wachstum über das Limit liefert den Wasm-Fehlerwert `-1`.
- Weitere feste V8-Grenzen sind 96 MiB alter JavaScript-Heap, 1.024 KiB Stack, 100.000 Tabelleneinträge
  sowie 16 MiB Modulgröße. Diese Einstellungen sind **keine Begrenzung des gesamten Prozess-RSS**;
  nativer Compilerspeicher und mehrere Wasm-Speicher zählen nicht vollständig zum JavaScript-Heap.

Dies ist die Ausführung von vertrauenswürdigem Administratorcode. Node.js dokumentiert ausdrücklich,
dass `node:wasi` keine Sicherheits-Sandbox für feindlichen Code bereitstellt. Der eigene Prozess und
die expliziten Fähigkeiten begrenzen Betriebsfehler; sie ersetzen keine zusätzliche Betriebssystem-
oder Container-Isolation für fremden Code. Backend-Dienstkennung und Containergrenzen gelten weiter.

## Abhängigkeiten und Primärquellen

- Node.js 26, integrierte Module `node:wasi`, `node:child_process` und `node:string_decoder`.
- [Offizielle WASI-Dokumentation für Node.js 26](https://github.com/nodejs/node/blob/v26.x/doc/api/wasi.md):
  Aufrufvertrag, `start`, `returnOnExit`, Preview 1 und die ausdrücklich dokumentierte Vertrauensgrenze.
- Die festen V8-Grenzen sind mit `node --v8-options` auf Node.js 26.12.0 verifiziert.
- Die unabhängigen Fixture-Binaries wurden aus ihren WAT-Quellen mit der Wasmtime-C-API 49.0.2
  `wasmtime_wat2wasm` erzeugt; die Anwendung benötigt diese Bibliothek für WASI-Kommandos nicht.

## Tests und Nachweise

```sh
cd backend
node node_modules/vitest/vitest.mjs run test/lib/wasi-runner.spec.js --maxWorkers=1
```

Die echte 795-Byte-Fixture liest Argumente, Umgebungsvariablen und die Standardeingabe, schreibt auf
beide Ausgabe-Pipes und ruft `proc_exit(7)` auf. Ein weiterer Fall verarbeitet die vollständigen
64 KiB Standardeingabe. Ein zusätzlicher Fall erhält den vollständigen Exitcode `4294967295`.
Weitere unabhängige Binaries belegen einen Trap, einen endlosen Wasm-Loop,
einen Ausgabefluss mit ungültigem UTF-8 auf beiden Pipes, die Anfangs- und Wachstumsgrenze des
Wasm-Speichers sowie das Fehlen vorgeöffneter Verzeichnisse und geerbter Umgebungsvariablen.
Die Tests prüfen außerdem Parallelitätsgrenze, Abbruch, tatsächliches Prozessende und anschließende
erneute Ausführbarkeit. Das sind reale Node-/WASI-Ausführungen; die Bytes werden nicht durch
vorgegebene Runner-Antworten ersetzt.

Zusätzlich prüfen 38 Katalogfälle echte Compiler-/WASI-Prozesse und 6 HTTP-Fälle den vollständigen
Upload-/Start-/Löschablauf. Der HTTP-Abbruchtest beobachtet das tatsächliche `SIGKILL` und den
abgeschlossenen Prozess. Der zehnte Chromium-Ablauf prüft die Bedienung mit gemockten API-Antworten;
er ersetzt ausdrücklich nicht die tatsächlichen Backend-Laufzeitprüfungen.

## Offene Fragen

Keine offenen Implementierungsfragen zum beschriebenen Preview-1-Kommandovertrag. Dauerhafte
Anwendungsdienste, Dateimounts und WASI Preview 2 sind eigenständige Erweiterungen.

## Verwandte Seiten

- [Wasm-Filter in Nginx](./wasm-filter.md)
- [Tests](../entwicklung/tests.md)
- [Nginx-Engine](./nginx-engine.md)
