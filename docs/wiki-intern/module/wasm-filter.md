# Vertrauenswürdige Wasm-Filter

## Zweck

ShieldPM stellt gebündelte Proxy-Wasm-Filter pro Proxy Host bereit. Unterstützt werden API-Key-Prüfung,
Request-/Response-Header setzen oder entfernen sowie lokale HTTP-Antworten. Die Reihenfolge innerhalb einer
Phase entspricht der Hostkonfiguration. Authentifizierung lehnt bei Fehlern immer ab. Andere Filter bieten
explizit „ablehnen“ oder „ohne diesen Filter fortfahren“.

## Architektur und Lieferumfang

Die vorhandene Nginx-Runtime verwendet API7s `wasm-nginx-module` 0.7.0 und Wasmtime 49.0.2. Der eigene
Filter implementiert die benötigte Proxy-Wasm-ABI-0.2.1-Teilmenge. Kongs `wasm {}`-/`proxy_wasm`-Direktiven
sind nicht anwendbar. Der HTTP-Kontext benötigt einmalig `wasm_vm wasmtime;`. Lua verbindet die vorhandenen
Access-/Header-/Body-Phasen über `shieldpm/wasm.lua`; es wird kein zweiter konkurrierender Access-Block ergänzt.

`backend/wasm/policy.wat` ist die lesbare Quelle, `policy.wasm` das gebündelte Artefakt und `manifest.json`
enthält Version sowie SHA-256 von Quelle und Binary. Der Filter besitzt genau eine 64-KiB-Speicherseite;
Konfiguration und Headerlängen sind begrenzt, Vergleiche besitzen begrenzte Schleifen. Es gibt keinen Upload
beliebiger Plugins. Allgemeine Wasmtime-Fuel-/Epoch-/Speicherlimits sind damit nicht nachgerüstet.

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

Arten: `api_key`, `request_header`, `response_header`, `local_response`. Headernamen dürfen keine
Framing-/Routing-Header wie Host, Content-Length, Connection oder Transfer-Encoding verändern.
Headerwerte dürfen keine CR/LF/NUL-Zeichen enthalten. Werte und lokale Bodies sind auf 4.096 UTF-8-Bytes
begrenzt. Lokale Antworten haben einen Status zwischen 200 und 599 und gelten für den gesamten Host.

API-Keys sind schreibgeschützt in Antworten: ein neuer Wert wird mit dem vorhandenen AES-256-GCM-Schlüssel
verschlüsselt; Antworten enthalten nur `has_secret`. Ein leerer/fehlender Ersatz erhält den bestehenden Key
unter derselben Filter-ID. Das Entfernen des Filters entfernt diese Konfiguration. Ciphertext kann über die
öffentliche Schnittstelle nicht eingeschleust werden. Audit-/Preview-/Revisionsausgaben müssen dieselbe
Redaktion verwenden. Der Dispatcher benötigt den entschlüsselten Key; seine generierte Datei liegt mit
Modus 0600 unter einem Verzeichnis mit Modus 0700. Instanzbackups müssen diese Dateien vertraulich behandeln.
Backend und Nginx laufen über denselben Service-UID: Bei gesetztem `PUID` übernimmt der Startprozess die
Daten für diesen UID und startet beide Dienste mit `gosu`; im Root-Modus verwenden beide UID 0. Die
Dateien benötigen daher keine Leseerlaubnis für andere Benutzer. Zusätzliche manuelle Worker-UIDs außerhalb
dieses Startmodells benötigen eine passende private Gruppenberechtigung und werden nicht automatisch eingerichtet.

## Aktivierung und Fehler

`prepareHost(host)` erzeugt die unveränderlichen Dateien und führt die konkrete Chain in einem isolierten
Nginx-Prozess aus. Zusätzlich muss die tatsächliche globale Nginx-Konfiguration den Wasm-HTTP-Kontext bereits aktivieren; ein isolierter Test allein würde eine fehlende Produktionsdirektive nicht erkennen. Die Prüfung erhält ausschließlich Loopback-/Unix-Socket-Verkehr und wird spätestens nach
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
oder fehlender Key führt zu HTTP 401. Bei einem geschlossenen Response-Filterfehler wird Status 503 gesetzt,
alle bisherigen Response-Header werden entfernt, `Cache-Control: no-store` wird gesetzt und der nachfolgende
Body wird verworfen. Weitere Response-Filter laufen danach nicht mehr; insbesondere werden vertrauliche
Upstream-Header und Cookies nicht als Fehlerantwort ausgeliefert. ACME-, Redirect- und WAF-Antworten, die vor der Access-Phase entstehen,
übernehmen keine neue Policy-Chain.

## Schnittstellen und Oberfläche

- `GET /api/nginx/wasm`: Manifest und letzter Capability-Status, erfordert Host-Listenberechtigung.
- `POST /api/nginx/wasm/self-test`: echter Auth-/Transformations-Test, Admin-Berechtigung und Rate-Limit.
- `GET /api/nginx/wasm/hosts/:id`: letzter Hoststatus nach Prüfung von Hostberechtigung und Owner.
- Wasm-Tab im Hostformular: Filter hinzufügen, aktivieren/deaktivieren, ordnen, konfigurieren und entfernen;
  Runtime-Test, aktive Version und Fehlerstatus ansehen.

Der globale Capability-Test prüft fehlenden und falschen Key, gültigen Key, Überschreiben eines gespooften
Request-Headers und einen echten Response-Header. Nach einem Backend-Neustart ist der Capability-Status
zunächst „unverified“, bis ein neuer Test ausgeführt wird.

## Tests und Wiederholbarkeit

```sh
cd backend
node node_modules/vitest/vitest.mjs run test/internal/wasm.spec.js --maxWorkers=1
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
