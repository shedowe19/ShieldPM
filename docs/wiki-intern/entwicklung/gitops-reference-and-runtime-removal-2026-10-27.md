# Referenzkorrektur und Entfernung der Ausführungsintegration

## Zweck

Der am 27. Oktober 2026 gemeldete Fehler `Not Found - 0` beim Anlegen eines Proxy-Hosts wird korrigiert.
Auf ausdrücklichen Nutzerwunsch werden außerdem Wasm-/WASI-Ausführung, Oberflächen, APIs und die zugehörige
Nginx-Anbindung vollständig aus der Anwendung entfernt. Das kompilierte Modul und Wasmtime werden im
separaten Repository `shieldpm-nginx` entfernt.

## Fehlerursache und Korrektur

Das gemeinsame API-Schema erlaubt Zertifikats-IDs und die Auswahl `new`. Der tatsächlich verwendete
AJV-Validator wandelt durch `anyOf` und aktivierte Typkonvertierung auch die numerische Null in die
Zeichenkette `"0"` um. Die bisherige Wahrheitsprüfung in `internal/host.js` behandelte sie als gesetzte
Zertifikatsreferenz und lud Zertifikat 0. Der Fehler ist unabhängig vom GitOps-Schalter reproduzierbar.

Die Referenzprüfung und die gemeinsame SSL-/HSTS-Bereinigung normalisieren sichere numerische Zeichenketten.
Null bedeutet weiterhin kein Zertifikat beziehungsweise keine Access List. Tatsächlich zugewiesene IDs werden
mit ihren bestehenden Eigentümer- und Leserechten geprüft. Ungültige Werte werden nicht pauschal zu Null.

GitOps prüfte den ausgeschalteten Zustand bereits vor Netzwerkzugriffen. Zusätzlich werden ausstehende
Auto-Push-Timer beim Abschalten entfernt. Ein alter geplanter Auftrag darf nach erneutem Einschalten nicht
unerwartet ausgeführt werden. Zertifikats-DNS-Zugangsdaten bleiben in GitOps-Backups erhalten.

## Entfernter Lieferumfang

- Modul-/Anwendungskatalog, Upload, Ausführung, Runner, Worker, Unix-Adapter und Selbsttests.
- Backend-Routen und OpenAPI-Schemata sowie Frontend-Seiten, Navigation, Host-Tab, Clients und Übersetzungen.
- Nginx-Vorlagen, Anwendungslua, Runtime-Initialisierung und ausschließlich funktionsbezogene Fixtures/Tests.
- Build-/Smoke-Aufrufe für die entfernte Ausführung. Übrige Auth-, Cache-, WAF-, GeoIP-, Backup- und
  Laufzeitprüfungen bleiben bestehen.

Aktive Funktionsbeschreibungen wurden bereinigt. Frühere Prüfberichte sind ausdrücklich als historisch
markiert. Abhängigkeiten allgemeiner Build-Werkzeuge können weiterhin intern WebAssembly verwenden; sie
stellen keine Ausführungsfunktion der ShieldPM-Anwendung bereit.

## Bestehende Hosts und Wiederherstellung

Die neue Datenbankmigration entfernt ausschließlich die früheren Runtime-Metadaten. Ein Host mit einer aktiven
alten Bindung bleibt deaktiviert, damit das Entfernen eines möglichen Zugangsfilters keinen öffentlichen
Upstream erzeugt. Hosts ohne aktive Bindung behalten ihren Aktivierungszustand; Notizen und andere
Metadaten bleiben erhalten. Serialisierte Altformate werden vor Objektzusammenführungen normalisiert.

Die gleiche Grenze gilt für alte GitOps-Importe, Exporte, Revisionswiederherstellungen und Kompensation nach
fehlgeschlagener Aktivierung. Alte verschlüsselte Revisionen dürfen keine entfernte Ausführung wieder aktivieren.
Bei Instanzbackups erfolgt die Bereinigung ausschließlich in der wiederhergestellten isolierten Datenbank.
Konfigurationen der dabei deaktivierten Hosts werden aus dem privaten Staging entfernt. Widersprechen sich
alte generierte Ausführungshooks und die gesicherten Host-Metadaten, wird die Prüfung abgelehnt; der bisherige
Listener wird nicht durch Entfernen seines Zugangsfilters öffentlich gemacht. Eigene Lua-/Auth-Direktiven
werden nicht pauschal umgeschrieben. Nginx wird weiterhin vor einer Restore-Vormerkung geprüft.

Der geänderte Generator-Fingerprint erzwingt die Neuerzeugung bestehender Host-Konfigurationen beim Update.
Der Startup entfernt nur den früheren ShieldPM-eigenen globalen Runtimeblock und seine beiden Lua-Helfer.
Nachdem das neue Nginx-Binary erfolgreich ohne Modul und ohne Wasmtime-Verknüpfung geprüft wurde, entfernt
der Startschritt auch die festen alten Wasmtime-Bibliotheken und den alten Lua-Adapter. Bei alter Runtime,
fehlgeschlagener Prüfung oder unsicheren Pfaden bleiben diese Dateien erhalten. Private frühere Uploaddateien
werden nicht als Programme geladen; fremde Daten und eigene Direktiven werden nicht rekursiv entfernt.

## Separate Nginx-Basis und Reihenfolge

[shieldpm-nginx PR #11](https://github.com/shedowe19/shieldpm-nginx/pull/11) entfernt Modulquellen, Wasmtime,
Link-/Configure-Argumente, den funktionsbezogenen Patch und ausgelieferte Bibliotheken/Adapter. Die reale
Image-Prüfung und der Export weisen verbliebene Laufzeitbestandteile zurück. Normale statische `.wasm`-Dateien
können weiterhin wie andere Webdateien ausgeliefert werden.

Zuerst wird die Anwendung aktualisiert, damit ihre verwalteten Direktiven und generierten Hooks verschwinden.
Danach können die neu gebauten Nginx-Binaries übernommen werden. Selbst verwaltete Runtime-Direktiven außerhalb
des ShieldPM-Blocks benötigen Betreiberprüfung. Die Änderung an der Basis ist ein eigener PR und wird durch
Anwendungsänderungen allein weder gemergt noch auf einer produktiven Instanz installiert.

## Prüfnachweise

- Der isolierte Ausgangsstand erzeugt acht fehlgeschlagene Referenz-/Timerfälle, einschließlich exakt des
  gemeldeten Stacks `certificate.js:403 → host.js:14 → Not Found - 0` nach dem tatsächlichen API-Validator.
- Node 26.12.0: 147 GitOps-/Referenzfälle bestanden, vier ausdrücklich markierte Nginx-Umgebungsskips;
  die Datenbankfälle verwenden tatsächliches SQLite beziehungsweise PostgreSQL/PGlite.
- Infrastruktur: 47 Fälle bestanden, vier Umgebungs-Skips; Shellsyntax und Diffprüfung bestanden.
- Nginx-Basis: 28 Python-Tests und separate Subprozessprüfungen sowie Shellsyntax/Formatierung bestanden.
  Der vollständige Image-Build und die tatsächlichen Laufzeitprüfungen sind in der getrennten Basis-CI zu prüfen.
- Frontend: 985/985 Tests in 222 Dateien, TypeScript, alle 13 Sprachkataloge, Biome und Produktionsbuild
  bestanden. Bundlegrenzen unverändert eingehalten: 1.171.279 Byte JavaScript und 16.453 Byte CSS.
- Backend-Entfernung: 195 passende Regressionen bestanden, sechs ausdrücklich markierte Umgebungsskips;
  der vollständige integrierte Lauf besteht mit 2.621 Tests in 268 Dateien und 56 ausdrücklichen
  Umgebungsskips. Backend-TypeScript und TScanner bestehen ohne Fehler oder Hinweise. Der bestätigte
  GitHub-Prüfstand wird im PR dokumentiert.

## Wiki-Prüfung

- Geprüfte Wiki-Seiten: GitOps, Zertifikate, Proxy-Host, Host-Revisionen, Nginx-Engine, Backups, Cache, Rootfs,
  API-Routen, Tests, Build, Modulübersicht und Index.
- Aktualisierte Wiki-Seiten: die betroffenen aktuellen Funktionsseiten und historischen Prüfberichte;
  außerdem GEMINI.md und die beiden maschinenlesbaren historischen Berichte.
- Neu erstellte Wiki-Seiten: dieser Bericht; drei ausschließlich auf die entfernte Funktion bezogene Seiten
  wurden entfernt und ihre Links bereinigt.
- Keine Wiki-Änderung nötig, weil: entfällt.
- Offene Wiki-TODOs: tatsächlicher finaler Prüfstand der beiden PRs und die spätere Übernahme der Basis-Binaries
  werden ausschließlich anhand bestätigter Ergebnisse angegeben.

## Verwandte Seiten

- [GitOps](../module/gitops.md)
- [Zertifikate](../module/zertifikate.md)
- [Proxy-Host](../module/proxy-host.md)
- [Host-Revisionen](../features/host-revisionen.md)
- [Nginx-Engine](../module/nginx-engine.md)
- [Instanzbackups](../module/instance-backups.md)
- [Tests](./tests.md)
