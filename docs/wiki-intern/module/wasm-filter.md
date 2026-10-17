# Vertrauenswürdige Wasm-Filter

## Zweck

ShieldPM lädt eigene `.wasm`-Dateien in einen administrierten Modul-Katalog und führt ausgewählte
Proxy-Wasm-Module direkt in der vorhandenen Nginx-Runtime eines Proxy Hosts aus. Pro Filter wird ein
JSON-Konfigurationsobjekt an `proxy_on_configure` übergeben. Die Oberfläche beginnt mit Dateiupload und
Modulauswahl; gebündelte API-Key-, Header- und lokale Antwortfilter bleiben ergänzende Vorlagen.
Die Reihenfolge innerhalb einer Phase entspricht der Hostkonfiguration. Authentifizierung lehnt bei Fehlern
immer ab. Andere Filter bieten explizit „ablehnen“ oder „ohne diesen Filter fortfahren“.

## Eigene Module und Kompatibilität

Der Upload akzeptiert ausschließlich binäres WebAssembly bis 16 MiB. Node kompiliert die Bytes ohne
Instanziierung und prüft die exportierte Proxy-Wasm-ABI `0.2.1`, den exportierten Speicher, notwendige
Lebenszyklusfunktionen und mindestens einen HTTP-Callback. Importierte Funktionen müssen aus `env`
stammen und Proxy-Wasm-Hostfunktionen sein. WASI-Programme und andere WebAssembly-Laufzeitverträge
sind keine HTTP-Filter für diesen Adapter. Ein passender Dateiname allein belegt keine Kompatibilität.

Beim Speichern des Hosts lädt und konfiguriert ein isolierter echter Nginx-Prozess die tatsächlichen
Bytecode-Dateien. Jedes eigene Modul wird einzeln mit GET und POST geprüft, anschließend die gesamte
geordnete Chain. Ein früher lokaler Reply kann dadurch einen späteren offensichtlich fehlerhaften
Callback nicht vor dem Einzeltest verbergen. Erkannte Lade-, Konfigurations- und Ausführungsfehler
verhindern die Aktivierung auch bei eingestelltem Fail-open. Individuelle fachliche Ergebnisse wie ein
absichtlich erzeugter HTTP 401 werden bei eigenen Modulen nicht mit einem festen Erfolgsbody verglichen.
Diese Probeanfragen beweisen keine Korrektheit für sämtliche möglichen Eingaben.

Administratoren dürfen Module hochladen und aus dem Katalog entfernen; Hostbenutzer mit bestehenden
Hostrechten dürfen die freigegebenen Module auswählen. Eigener Bytecode ist vertrauenswürdiger
Administrationscode: API7 bietet hier keine nachgerüsteten Fuel-/Epoch- oder generellen VM-Speichergrenzen.
Ein Modul kann verfügbare API7-Hostfunktionen einschließlich HTTP-Callouts verwenden. Der isolierte
Prozess ist zeitlich begrenzt, aber keine Netzwerk-Sandbox für einen absichtlich ausgehenden Callout.

### Tatsächlich unterstützte HTTP-Callbacks

- `proxy_on_request_headers` und `proxy_on_response_headers` verwenden die vorhandenen API7-Lua-Helfer.
- `proxy_on_request_body` erhält den von Nginx gelesenen Body in höchstens 64-KiB-Blöcken mit einem
  korrekten letzten Block. Das funktioniert auch bei HTTP/2 ohne Content-Length oder Transfer-Encoding.
  Große Bodies bleiben in Nginx-Temporärdateien; der Dispatcher liest pro Schritt höchstens 65.537 Bytes
  einschließlich eines Vorschau-Bytes und schließt den Dateideskriptor vor dem Modulaufruf.
- `proxy_on_response_body` wird für die von Nginx bereitgestellten Response-Blöcke einschließlich des
  Abschlussaufrufs ausgeführt. Ein Fail-closed-Fehler nach bereits gesendeten Headern verwirft den
  verbleibenden Body und beendet ihn; der bereits gesendete HTTP-Status kann dann nicht mehr ersetzt werden.
  Fail-open meldet den Laufzeitfehler und lässt die folgenden Body-Blöcke passieren. Während des Preflights
  verhindert ein erkannter Body-Fehler unabhängig von diesem späteren Rückfallmodus die Aktivierung.
- Module mit reinen Body-Callbacks und SDK-Module mit leeren Body-Callbacks werden akzeptiert.

**API7-0.7.0-Grenze:** Der native Header-Dispatcher übergibt bei ABI 0.2.1 den Header-Parameter
`end_of_stream` immer als `1`, auch wenn ein Body folgt. Dieser Fehler liegt im kompilierten Nginx-Modul;
ein zusätzlicher Lua-/FFI-Aufruf kann ihn nicht korrigieren. Module, die auf einem anderen Header-Flag
bestehen, können mit dieser Runtime inkompatibel sein und beim echten Preflight scheitern.
`proxy_set_buffer_bytes` ist in API7 0.7.0 nicht implementiert. Die Ausführung von Body-Callbacks bedeutet
daher keine allgemeine Unterstützung für Request-/Response-Body-Umschreiben. Auch weitere Hostfunktionen
können mit `UNIMPLEMENTED` antworten. Maßgeblich sind die tatsächlich installierte API7-Version und der
[Header-Dispatcher](https://github.com/api7/wasm-nginx-module/blob/0.7.0/src/http/ngx_http_wasm_module.c)
sowie die [Hostfunktionen](https://github.com/api7/wasm-nginx-module/blob/0.7.0/src/http/ngx_http_wasm_api.c).

## Architektur und Lieferumfang

Die vorhandene Nginx-Runtime verwendet API7s `wasm-nginx-module` 0.7.0 und Wasmtime 49.0.2. Der eigene
Filter implementiert die benötigte Proxy-Wasm-ABI-0.2.1-Teilmenge. Kongs `wasm {}`-/`proxy_wasm`-Direktiven
sind nicht anwendbar. Der HTTP-Kontext benötigt einmalig `wasm_vm wasmtime;`. Lua verbindet die vorhandenen
Access-/Header-/Body-Phasen über `shieldpm/wasm.lua`; es wird kein zweiter konkurrierender Access-Block ergänzt.

`backend/wasm/policy.wat` ist die lesbare Quelle, `policy.wasm` das gebündelte Artefakt und `manifest.json`
enthält Version sowie SHA-256 von Quelle und Binary. Der Filter besitzt genau eine 64-KiB-Speicherseite;
Konfiguration und Headerlängen dieses gebündelten Filters sind begrenzt, Vergleiche besitzen begrenzte
Schleifen. Diese Eigenschaften gelten nicht automatisch für eigene hochgeladene Module.

Der Backend-Service kopiert Binary und Dispatcher unter ihren Inhalts-Hashes nach `/data/wasm/artifacts/`.
Jede Hostkonfiguration bekommt einen neuen unveränderlichen Dateinamen. Bestehende Dateien werden nur
wiederverwendet, wenn ihr Inhalt exakt übereinstimmt. Lua prüft den Binary-Hash vor der Instanziierung.
Aktive Konfigurationen werden nie in-place überschrieben; das Wiederherstellen der vorherigen Nginx-Datei
stellt deren bisherige Artefaktreferenzen wieder her.

## Konfiguration und Secrets

`meta.wasm_filters` ist eine geordnete Liste mit höchstens acht Einträgen. Beispiel ohne Secret:

```json
[
  {
    "id": "tenant-header",
    "kind": "request_header",
    "enabled": true,
    "failure_mode": "closed",
    "config": {
      "header": "x-tenant-policy",
      "operation": "set",
      "value": "internal"
    }
  }
]
```

Arten: `module`, `api_key`, `request_header`, `response_header`, `local_response`. Bei einem eigenen Modul
verweist `config.module_id` auf den Katalog-SHA-256; `config.configuration` ist ein JSON-Objekt mit maximal
64 KiB UTF-8. Schlüssel werden einschließlich ihrer Groß-/Kleinschreibung unverändert weitergegeben.
Eine gebündelte API-Key-Prüfung muss vor eigenen Modulen und vor Transformationen ihres Credential-Headers
laufen. Die nachfolgenden Headergrenzen betreffen die gebündelten Vorlagen: Headernamen dürfen keine
Framing-/Routing-Header wie Host, Content-Length, Connection oder Transfer-Encoding verändern.
Headerwerte dürfen keine CR/LF/NUL-Zeichen enthalten. Werte und lokale Bodies sind auf 4.096 UTF-8-Bytes
begrenzt. Lokale Antworten haben einen Status zwischen 200 und 599 und gelten für den gesamten Host.

API-Keys sind schreibgeschützt in Antworten: ein neuer Wert wird mit dem vorhandenen AES-256-GCM-Schlüssel
verschlüsselt; Antworten enthalten nur `has_secret`. Ein leerer/fehlender Ersatz erhält den bestehenden Key
unter derselben Filter-ID. Das Entfernen des Filters entfernt diese Konfiguration. Ciphertext kann über die
öffentliche Schnittstelle nicht eingeschleust werden. Audit-/Preview-/Revisionsausgaben müssen dieselbe
Redaktion verwenden. Der Dispatcher benötigt den entschlüsselten Key; seine generierte Datei liegt mit
Modus 0600 unter einem Verzeichnis mit Modus 0700. Instanzbackups müssen diese Dateien vertraulich behandeln.
Die gesamte JSON-Konfiguration eigener Module wird ebenfalls verschlüsselt gespeichert. Antworten,
GitOps-Exporte, Audits und Revisionsansichten enthalten nur `module_id` und `has_configuration`.
Fehlt ein Ersatzobjekt beim Speichern, bleibt die bestehende Konfiguration ausschließlich bei derselben
Filter-ID und demselben Modul erhalten. `{}` ersetzt sie ausdrücklich durch ein leeres Objekt.
Ein Modulwechsel benötigt die Konfiguration erneut. GitOps überträgt keine Modul-Binaries oder
redigierten Konfigurations-Secrets auf eine andere Instanz; die Referenz muss dort vorhanden sein,
sonst wird die Aktivierung abgelehnt. Vollbackups enthalten dagegen den Katalog, Bytecode und Secrets.

Backend und Nginx laufen über denselben Service-UID: Bei gesetztem `PUID` übernimmt der Startprozess die
Daten für diesen UID und startet beide Dienste mit `gosu`; im Root-Modus verwenden beide UID 0. Die
Dateien benötigen daher keine Leseerlaubnis für andere Benutzer. Zusätzliche manuelle Worker-UIDs außerhalb
dieses Startmodells benötigen eine passende private Gruppenberechtigung und werden nicht automatisch eingerichtet.

## Aktivierung und Fehler

`prepareHost(host)` erzeugt die unveränderlichen Dateien und führt die konkrete Chain in einem isolierten
Nginx-Prozess aus. Zusätzlich muss die tatsächliche globale Nginx-Konfiguration den Wasm-HTTP-Kontext bereits aktivieren; ein isolierter Test allein würde eine fehlende Produktionsdirektive nicht erkennen. Die Probeanfragen verwenden Loopback-/Unix-Socket-Verkehr; eigene Module können über unterstützte
Hostfunktionen selbst ausgehende Verbindungen auslösen. Jeder isolierte Prozess wird spätestens nach
fünf Sekunden beendet. Erst anschließend darf die normale globale Nginx-Prüfung und Aktivierung stattfinden.
Ein fehlendes Binary, falscher Hash oder nicht ausführbarer Filter verhindert diese Aktivierung. Auch ein
bekannter Ausführungsfehler eines offenen Filters verhindert die Freigabe; dessen offenes Verhalten bleibt
die Rückfallstrategie für spätere Laufzeitfehler. `nginx -t`
allein instanziiert und prüft die Wasm-Filter ausdrücklich nicht.

Die zentrale Konfigurationswarteschlange veröffentlicht den aktiven Status erst, wenn der gesamte
Aktivierungs- oder Rollback-Vorgang einschließlich Datenbank-Statusschreibvorgängen abgeschlossen ist.
`nginx -t` und `skip_reload` veröffentlichen keinen aktiven Status. Eine Vorbereitung verändert den bisherigen
aktiven Status nicht; ihre Runtime-Prüfung verwendet eine eigene temporäre Statusdatei.

Bei Wasm prüft der Reload anhand von Master-PID, Worker-PID und Kernel-Startzeit, dass eine neue
Worker-Generation läuft und die vorherigen normalen Worker beendet werden. Zwei aufeinanderfolgende
Beobachtungen bestätigen den Wechsel; ein gesendetes HUP-Signal allein reicht nicht. Ein fehlender oder
nicht prüfbarer Master verhindert die Aktivierung. Die Wartezeit ist endlich: standardmäßig fünf Sekunden;
`SHIELDPM_WASM_ACK_TIMEOUT_MS` ist auf 50 bis 10.000 Millisekunden begrenzt. Die übliche PID-Datei ist
`/run/shieldpm/nginx/nginx.pid`; abweichende Tests können `SHIELDPM_WASM_NGINX_PIDFILE` verwenden.
Kernel ohne `/proc/PID/task/PID/children` werden über die tatsächlichen Eltern-PIDs im Prozessverzeichnis geprüft.

Der private aktive Zeiger unter `/data/wasm/active/host-ID.json` wird atomar veröffentlicht. Laufzeitfehler
liegen unter `/data/wasm/status/ID-VERSION.json`; alte Worker und alte Statusdateien können daher den Status
einer neueren Policy nicht überschreiben. API-Antworten enthalten keine internen Dateinamen. Ein späterer
nicht bestätigter Reload meldet einen Fehler mit der letzten bestätigten Policy, statt eine Aktivierung zu behaupten.
Eine erneut erfolgreich geprüfte und bestätigte Aktivierung derselben Policy verwirft deren bisherigen Laufzeitfehler;
erst ein neuer Fehler nach dieser Aktivierung setzt den Status wieder auf fehlerhaft.
Das Entfernen aller Filter, Deaktivieren oder Löschen des Hosts setzt den Zeiger nach erfolgreichem Reload auf inaktiv.

Konfigurationsdateien unter `/data/wasm/hosts/` enthalten den entschlüsselten Key. Sie werden nach Rotation,
Entfernen oder Rollback gelöscht, sobald weder aktuelle/Backup-Konfigurationen noch aktive oder auslaufende
Worker sie benötigen. `/data/wasm/retirement.json` speichert dazu vor Konfigurationsänderungen dauerhafte
PID-/Startzeit-Bindungen, ohne Keys zu kopieren. Eine bestätigte Generation wird vor Rückkehr zum Aufrufer
separat festgehalten; das schützt auch Zwischen-Generationen bei Rollback, Worker-Neustart und Backend-Abbruch.
Ein konservativer Marker schützt den Zeitraum zwischen Signal und Bestätigung. Ein später bestätigter
Reload desselben Masters löst solche Marker in tatsächliche Worker-Bindungen auf. Bei nicht beweisbarem
Prozesszustand werden Dateien erhalten. Bereinigung und Wiederholungen laufen unter derselben Warteschlange;
es gibt keine zusätzliche Abschaltfrist, die langlebige Verbindungen trennt.

Dieses Verhalten folgt dem [dokumentierten Nginx-HUP-Ablauf](https://nginx.org/en/docs/control.html):
Nginx kann einen Reload vor dem Worker-Start verwerfen, während alte Worker bestehende Verbindungen
bis zum Abschluss weiter bedienen. Das sofortige Entfernen ihrer erst bei Bedarf geladenen Wasm-Dateien wäre deshalb falsch.

Laufzeitfehler melden Filter-ID und Phase ohne Credential-Wert. Request-Authentifizierung schlägt kontrolliert mit HTTP 503 fehl; ein falscher
oder fehlender Key führt zu HTTP 401. Bei einem geschlossenen Response-Header-Filterfehler wird Status 503 gesetzt,
alle bisherigen Response-Header werden entfernt, `Cache-Control: no-store` wird gesetzt und der nachfolgende
Body wird verworfen. Weitere Response-Filter laufen danach nicht mehr; insbesondere werden vertrauliche
Upstream-Header und Cookies nicht als Fehlerantwort ausgeliefert. ACME-, Redirect- und WAF-Antworten, die vor der Access-Phase entstehen,
übernehmen keine neue Policy-Chain.

## Schnittstellen und Oberfläche

- `GET /api/nginx/wasm/modules`: globaler Katalog, erfordert Host-Listenberechtigung.
- `POST /api/nginx/wasm/modules?name=...&filename=...`: Admin-Upload als rohe Bytes mit
  `Content-Type: application/wasm` oder `application/octet-stream`, maximal 16 MiB; Rate-Limit und normale
  Authentifizierungs-/CSRF-Prüfung bleiben aktiv.
- `GET /api/nginx/wasm/modules/:sha256`: Metadaten eines Moduls, keine internen Dateipfade.
- `DELETE /api/nginx/wasm/modules/:sha256`: Admin-Löschung nur ohne Host-, Revisions- und erhaltene Worker-Referenzen.
- `GET /api/nginx/wasm`: Manifest und letzter Capability-Status, erfordert Host-Listenberechtigung.
- `POST /api/nginx/wasm/self-test`: echter Auth-/Transformations-Test, Admin-Berechtigung und Rate-Limit.
- `GET /api/nginx/wasm/hosts/:id`: letzter Hoststatus nach Prüfung von Hostberechtigung und Owner.
- Wasm-Tab im Hostformular: Filter hinzufügen, aktivieren/deaktivieren, ordnen, konfigurieren und entfernen;
  Runtime-Test, aktive Version und Fehlerstatus ansehen.

Der Katalog speichert höchstens 512 Metadaten-Dateien unter `/data/wasm/modules/SHA256.json`; Bytecode
liegt unveränderlich unter `/data/wasm/artifacts/SHA256.wasm`. Uploads veröffentlichen vollständige private
Dateien atomar. Leser verwenden denselben geprüften regulären Dateideskriptor und folgen keinen finalen
Symlinks; unsichere Verzeichnis-Komponenten und fremde Hardlinks werden abgelehnt. Gleiche Bytes erhalten
dieselbe Modul-ID und werden nicht als zweite Version überschrieben. Neue Bytes ergeben eine neue ID.
Die Löschprüfung läuft unter der Nginx-Konfigurationswarteschlange und berücksichtigt auch deaktivierte
Hosts, verschlüsselte Hostrevisionen und erhaltene Chain-Dateien. Der Bytecode selbst bleibt nach einer
zulässigen Kataloglöschung konservativ erhalten, damit unbekannte alte Worker keine Datei verlieren.
Der aktive Hoststatus enthält bei eigenen Modulen den Chain-Hash und die ausgewählten Modul-Digests.

Der globale Capability-Test prüft fehlenden und falschen Key, gültigen Key, Überschreiben eines gespooften
Request-Headers und einen echten Response-Header. Nach einem Backend-Neustart ist der Capability-Status
zunächst „unverified“, bis ein neuer Test ausgeführt wird.

## Tests und Wiederholbarkeit

```sh
cd backend
node node_modules/vitest/vitest.mjs run test/internal/wasm.spec.js test/internal/wasm-modules.spec.js test/routes/wasm-modules.spec.js --maxWorkers=1
node node_modules/vitest/vitest.mjs run test/integration/wasm-http2-runtime.spec.js --maxWorkers=1
node node_modules/vitest/vitest.mjs run test/internal/wasm-lifecycle.spec.js test/integration/wasm-lifecycle-runtime.spec.js --maxWorkers=1
cd ../frontend
node node_modules/vitest/vitest.mjs run src/modals/ProxyHostWasmTab.test.tsx --maxWorkers=1
cd ..
python3 scripts/wasm/build.py --library /usr/local/lib/libwasmtime.so
node scripts/wasm/self-test.mjs
```

Die Nginx-Ausführungstests werden mit `SHIELDPM_WASM_NGINX_BINARY` aktiviert. Abweichende ausschließlich
lokale Laufzeitpfade lassen sich über `SHIELDPM_WASM_LUA_PATH` und `SHIELDPM_WASM_LUA_CPATH` angeben.
In Umgebungen ohne AF_UNIX-Rechte aktiviert `SHIELDPM_WASM_PREFLIGHT_TCP=1` einen temporären Loopback-Port.
Die produktive Voreinstellung ist ein temporärer Unix-Socket. Tests ohne die tatsächliche Nginx-Runtime
prüfen Vertrag, Secret-Behandlung, Binärkonfiguration und unveränderliche Artefakte; sie belegen keine
Filterausführung. ModSecurity/OpenAppSec und besondere Hostvarianten brauchen zusätzliche Integrationstests.

Die unabhängige [Modulquelle](../../../backend/test/fixtures/custom-proxy-wasm.wat) und ihr
[kompiliertes Testmodul](../../../backend/test/fixtures/custom-proxy-wasm.wasm) ändern echte Request- und
Response-Header, erhalten die exakten JSON-Konfigurationsbytes und prüfen Request-Body-Blöcke sowie
Abschlussflags. Das Modul prüft zusätzlich dieselbe native HTTP-Kontext-ID in Request-Header-,
Request-Body-, Response-Header- und Response-Body-Callbacks. Weitere Fälle decken Body-only-Module, Trap-Fehler beider Body-Phasen, Fail-open-Preflight,
frühe lokale Replies, unveränderte akzeptierte Artefakte, HTTP/1-Chunking und HTTP/2 ohne Längenheader ab.
Diese Belege verwenden tatsächliches Nginx/Wasmtime; sie beweisen keine vollständige Kompatibilität mit
allen Proxy-Wasm-SDKs.

## Grenzen

Kein allgemeines JSON-/Response-Body-Umschreiben, keine JWT-Validierung, keine geteilten Wasm-Rate-Limit-Counter,
keine vorgetäuschten Pluginmetriken und kein beliebiger Envoy-/Kong-/Coraza-Plugin-Katalog. Der aktuelle API7-
Adapter implementiert die hierfür nötigen Hostfunktionen nicht vollständig. Upstream-Pools und Canary werden
als eigene Nginx-Funktion verwaltet und benötigen keine Wasm-Filter.

## Verwandte Seiten

- [Nginx-Engine](./nginx-engine.md)
- [Gesamtprüfung und Featurevorschläge](../entwicklung/feature-review-2026-10-17.md)
- [Tests](../entwicklung/tests.md)

## Benutzerkennung und lokale Prüfgrenze

Node und Nginx werden über denselben Entrypoint mit derselben Dienst-UID gestartet. Bei konfiguriertem Docker-PUID werden `/data` entsprechend zugeordnet und beide Prozesse gemeinsam über `gosu` gestartet. Konfigurationsverzeichnisse bleiben `0700`, Dateien mit API-Schlüsseln `0600`; eine globale Leseberechtigung ist nicht nötig. Die lokale Container-UID-Abbildung stellt ausschließlich UID 0 bereit, daher konnte ein zusätzlicher echter Nicht-Root-Lauf hier nicht ausgeführt werden. Die tatsächlichen Nginx-Laufzeittests liefen mit UID 0.
