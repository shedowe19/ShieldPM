# WASI-Anwendungen in Proxy Hosts vom 18. Oktober 2026

## Zweck und Ausgangsfehler

Der Host-Upload meldete bei gültigen eigenständigen Anwendungen
`A Proxy-Wasm ABI 0.2.1 module with an HTTP callback is required`. Er verwendete ausschließlich den
Proxy-Wasm-Katalog. Die bisherigen getrennten Laufzeiten waren korrekt geprüft, aber die gewünschte
Host-Einbindung für WASI-Kommandos fehlte. Die Änderung erkennt den Bytecode-Typ und ergänzt den
HTTP-Adapter, anstatt die Proxy-Wasm-ABI-Prüfung zu umgehen.

## Umsetzung

- Gemeinsamer Artefakt-Upload und Katalog mit explizitem Laufzeittyp; alte Endpunkte bleiben erhalten.
- Anwendungen pro Host als Anfragefilter oder antwortender Handler; normale stdio-Kommandos benötigen
  keine besonderen Proxy-Callbacks. Für Header, Status und binäre Bodies gibt es `http-json-v1`.
- Argumente, Umgebungsvariablen und Zeitlimit werden verschlüsselt und schreibgeschützt gespeichert.
- Eigener authentifizierter Unix-Adapter, unveränderliche Inhalts-Hashes und feste Ausführungsdateien.
- Vorherige Proxy-Wasm-Bodycallbacks laufen vollständig vor einer nachfolgenden Anwendung. Ein Handler
  darf keine frühere Body-Prüfung überspringen. Die vorhandenen Aktivierungs-/Worker-Leases bleiben gültig.
- Kataloglöschung schützt aktuelle Hosts, Revisionen und erhaltene Worker-Chains; Restore validiert
  historische Anwendungseinstellungen und führt aktive Policies in isolierten Daten erneut aus.
- Ein korrigierter JSON-Entwurf bereinigt den vollständigen Formik-Fehlerbaum, sodass Speichern wieder
  verfügbar ist. Der Browser hat diesen Fehler aufgedeckt; der neue Test prüft die echte Schaltfläche.

Der aktuelle Vertrag, Beispielprogrammeingaben und Grenzen stehen zentral unter
[WASI-Anwendungen](../module/wasi-runtime.md). Der private Ausführungsadapter ist kein öffentlicher API-Endpunkt.

## Validierung und Grenzen

Die Nachweise trennen echte Ausführung, Verträge und gemockte Oberflächenantworten:

| Prüfung                     | Nachweis                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Vollständige Backend-Suite  | Node 26.12.0: 2.891 bestanden, 96 explizite Umgebungs-/Runtime-Skips; 277 Dateien bestanden, 12 ausgelassen.          |
| Vollständige Frontend-Suite | Node 26.12.0: 1.058 Tests in 228 Dateien bestanden.                                                                                   |
| Echter Chromium-Browser     | 11 Abläufe bestanden, keine ausgelassenen/flaky Fälle; neuer Hostablauf mit gemockter API und Axe ohne Verstöße.                      |
| Produktions-Bundle          | Unveränderte Grenzwerte bestanden: größtes JS 106.550/299.000, JS gesamt 1.211.756/1.290.000 und CSS 16.461/16.600 Bytes komprimiert. |
| Echte HTTP-/WASI-Einbindung | 58/58 ausgewählte Nginx-Laufzeitfälle unter Node 26 bestanden, darunter 19/19 neue Host-WASI-Fälle mit echten Kindprozessen.          |
| Privater Adapter            | Authentifizierung, Pfade, Hashes, Manipulationen, Body-/Header-Grenzen, echter Abbruch und Wiederanlauf geprüft.                      |
| Image-Smokes                | Dedizierter produktiver Unix-Socket-Nachweis als Root und UID 1000 in beiden Architektur-Builds; GitHub-Ergebnis maßgeblich.          |

Die zwölf Listener-Lebenszyklustests prüfen ausdrücklich, dass der Start auf die Initialisierung der
Bridge und das Beenden auf deren Abschluss wartet. Die isolierte Service-Testgrenze ersetzt dort
tatsächliche Socket- und Datenschreibzugriffe; Adaptertests und Image-Smokes prüfen diese separat.

Diese lokale Ausführungsumgebung erlaubt keine Unix-Sockets und keinen zusätzlichen UID-Wechsel.
Die lokalen echten Nginx-/WASI-Läufe verwenden deshalb ausschließlich den ausdrücklich begrenzten
TCP-Testmodus; sie beweisen weder Unix-Berechtigungen noch einen UID-1000-Lauf. Das produktive Smoke-
Skript erzwingt Unix und kann diesen Testmodus nicht verwenden. Die GitHub-Image-Smokes sind dafür die
zusätzliche unabhängige Prüfung. Browser-Mocks werden nicht als Beleg für die Programmausführung gezählt.

Preview 1 bleibt ein Kommandovertrag. Dauerhafte Server, Preview 2, Dateimounts und asynchrone
Upstream-Response-Transformationen sind nicht implementiert. Ressourcenbegrenzungen machen Node WASI
nicht zu einer Sandbox für feindlichen Code. Es wurden keine Paketabhängigkeiten oder Versionen geändert.

## Wichtige Dateien und Wiederholung

- `backend/internal/wasm-artifacts.js`, `backend/internal/wasi-host-bridge.js` und `backend/internal/wasm.js`.
- `backend/lib/wasi-http-contract.js`, `backend/lib/wasi-runner.js` und `backend/lib/trusted-host-policies.js`.
- `rootfs/usr/local/share/lua/5.1/shieldpm/wasm.lua` und `wasi.lua`.
- `frontend/src/modals/ProxyHostWasmTab.tsx` und `ProxyHostWasiConfiguration.tsx`.
- `backend/test/integration/wasi-host-runtime.spec.js` und lesbare `.wat`-/`.wasm`-Paare.
- `backend/test/internal/wasi-host-bridge.spec.js`, `wasm-host-applications.spec.js` sowie Vertrags-/Runner-Tests.
- `scripts/ci/wasi-host-smoke.mjs` und `scripts/ci/docker-smoke.sh`.

```sh
cd backend
node node_modules/vitest/vitest.mjs run test/internal/wasm-artifacts.spec.js test/internal/wasm-host-applications.spec.js test/internal/wasi-host-bridge.spec.js --maxWorkers=1
```

Die Nginx-Integrationssuite benötigt die tatsächlichen ShieldPM-Nginx-/Lua-/Wasmtime-Pfade entsprechend
dem [Wasm-Testvertrag](../module/wasm-filter.md#tests-und-wiederholbarkeit).

## Wiki-Prüfung

- Geprüfte Wiki-Seiten: Wasm-Filter, WASI-Runtime, Host-Revisionen, API-Routen, Tests, Modulübersicht und Index.
- Aktualisierte Wiki-Seiten: Wasm-Filter, WASI-Runtime, API-Routen, Tests, Modulübersicht, Index und Projektkontext.
- Neu erstellte Wiki-Seiten: dieser Implementierungs- und Prüfbericht.
- Keine Wiki-Änderung nötig, weil: nicht zutreffend; neue Hostbindung und neue Schnittstellen sind dokumentationspflichtig.
- Offene Wiki-TODOs: Keine offenen Dokumentationsfragen zum implementierten Vertrag. Der aktuelle GitHub-Prüfstatus wird im zugehörigen PR gepflegt.

## Verwandte Seiten

- [WASI-Anwendungen](../module/wasi-runtime.md)
- [Proxy-Wasm-Filter](../module/wasm-filter.md)
- [Tests](./tests.md)
- [Betriebsfehler vom 18. Oktober](./runtime-fixes-2026-10-18.md)
