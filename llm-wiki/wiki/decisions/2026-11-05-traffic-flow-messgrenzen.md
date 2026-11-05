# Traffic-Flow: Messgrenzen explizit halten

Status: active
Last verified: 2026-11-05
Confidence: high

## Zweck

Die Grenze zwischen belegten Abschlussbeobachtungen und aktuellen Kantenraten festhalten.

## Entscheidung

Die experimentelle Flow-Ansicht zeigt konfigurierte Topologie und kurzlebige
Beobachtungen abgeschlossener HTTP-Anfragen. Sie behauptet keine aktuelle
Kantenrate. `current_rates: false`, `null`-Werte und konstante Linienstärken
halten diese Grenze auch im API-Vertrag fest. Der API-Takt beträgt fünf Sekunden.

## Begründung

Access-Logs entstehen beim Abschluss einer Anfrage. Die isolierte Messprüfung
mit ShieldPM Nginx 1.31.6 empfängt bereits Antwortdaten, während 1,2 Sekunden
lang noch kein Log- oder UDP-Eintrag existiert. Erst nach Abschluss werden
131.072 Body-Bytes sichtbar. Systemweite Netzwerkzähler können keine einzelne
Host- oder Upstream-Kante belegen. Ein Lua-Bodyfilter wäre ebenfalls kein
vollständiger Nachweis für Wire-Bytes, Uploads und WebSockets.

## Prüfung aktiver Lua-Messung

Das reproduzierbare Skript `scripts/benchmarks/traffic-flow-live-measurement.mjs`
prüft einen 1-MiB-Download mit aktiviertem Proxy-Buffering und 32 KiB/s
Ausgabelimit. Nach 1,2 Sekunden waren im geprüften Lauf 65.411 Body-Bytes beim
Client angekommen; der Lua-Bodyfilter hatte bereits 106.368 Bytes verarbeitet.
`ngx.var.bytes_sent` im Bodyfilter meldete 65.536 Bytes einschließlich Headern.
Die exakten Mengen hängen vom Timing ab; die Prüfung verlangt nur einen noch
laufenden Transfer und einen nachgewiesenen Vorsprung des Bodyfilters.

Ein im Bodyfilter gestarteter `ngx.timer.at`-Callback kann den ursprünglichen
Requestzähler nicht periodisch lesen: der Zugriff auf `ngx.var.bytes_sent`
liefert `API disabled in the current context`. Ein gespeicherter nativer
Requestzeiger wäre ohne nachgewiesenen Lebenszyklus nicht sicher. Der Test
verwendet deshalb weder FFI noch Zeigerzugriffe.

Die installierte VTS-Erweiterung wurde zusätzlich isoliert geprüft: bei einem
noch offenen Transfer mit bereits empfangenen 64 KiB fehlte `upstreamZones`;
nach Abschluss von 131.072 Body-Bytes erschien `requestCounter: 1` und
`outBytes: 131196`. Das ist ein separater lokaler Diagnosebeleg, kein zusätzlicher
versionierter Test. VTS ersetzt somit keine laufende Kantenmessung.

## Kleinster belastbarer Instrumentationsvertrag

Die bestehende Anwendung kann eine neue Messquelle konsumieren, aber keinen
fehlenden Nginx-Zähler durch schnelleres Polling erzeugen. Für zunächst HTTP/1
braucht die Nginx-Basis einen nativen, lebenszyklussicheren Collector:

- Stabile Instanz-/Worker-Generation, Host-ID, Request-ID, Connection-ID und
  bei Multiplexing Stream-ID; pro Upstream-Versuch eine eigene Kennung.
- Monotone Zähler pro Richtung an tatsächlichen Read-/Write-Abrechnungspunkten,
  mit dokumentierter Byte-Semantik (Body, HTTP oder Transport). Ein erfolgreicher
  Socket-Write belegt die Übergabe an den lokalen Netzwerkstack, keine bestätigte
  Zustellung beim entfernten Client.
- Monotone Messzeit und Reset-/Abschlussmarker, sodass Intervalldifferenzen
  während eines Transfers und über Worker-Neustarts korrekt sind.
- Begrenzter, asynchroner Export mit sichtbarer Unvollständigkeit, ohne den
  Proxy auf Collector-Verfügbarkeit warten zu lassen; kurze Retention und
  Clientmaskierung vor dauerhafter Speicherung.
- Getrennte Abnahme für Uploads, Downloads, Cache, Retries, WebSockets und
  HTTP/2-/HTTP/3-Multiplexing. Bei geteilten Transportverbindungen sind
  Wire-Bytes ohne zusätzliche Zuordnung keine exakten HTTP-Stream-Bytes.

Erst diese Quelle erlaubt eine ehrliche sekündliche Ratenskala und Glättung.
Die Compile-/Moduländerung liegt laut Repository-Vertrag in `shieldpm-nginx`;
Anwendungsdateien, Lua-Bodyfilter und Betriebssystem-Sockettabellen allein
reichen für den geforderten vollständigen Client–Host–Upstream-Pfad nicht aus.
Das ist ein noch nicht implementierter, technisch grundsätzlich machbarer
Build- und Instrumentationsschritt, kein Nachweis der Unmöglichkeit. Die
untersuchte Nginx-Basis pinnt Version 1.31.6 auf Quellrevision
`0a5db852e18d1c22c62a5ede1412ac3f416111a0` und zusätzliche Patches. Ein neues
Modul muss gegen genau diesen gepatchten Quellstand gebaut werden; ein Compiler
allein ersetzt die fehlenden passenden Quellen und generierten Header nicht.

## Folgen

Der Vorschau fehlen echte Raten, Glättung und eine Rate-zu-Linienstärke-Skala.
Das ist eine offene Produktanforderung, kein erfolgreich erfülltes Live-Messziel.
Eine spätere Implementierung braucht getrennt validierte Nginx-Instrumentation
und Tests für laufende Transfers, Multiplexing und Retries. Die bestehende
Nginx-Binärbasis liegt im separaten Repository. Es werden keine Systemzähler
oder Endlog-Bytes als Ersatzraten verwendet.

## Verwandte Seiten

- [Lua-Messprüfung](../../../scripts/benchmarks/traffic-flow-live-measurement.mjs)
- [Messprüfung](../../../scripts/benchmarks/traffic-flow-measurement.mjs)
- [Analytics-Modul](../reference/module/analytics.md#experimenteller-traffic-flow)
- [Aktivierung und Rückweg](../../../docs/wiki/Analytics.md#live-traffic-flow-experimental)
