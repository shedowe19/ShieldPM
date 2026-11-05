# Traffic-Flow: Messgrenzen explizit halten

Status: active
Last verified: 2026-11-05
Confidence: high

## Zweck

Die Grenze zwischen belegten Abschlussbeobachtungen und aktuellen Kantenraten festhalten.

## Entscheidung

Die Flow-Ansicht verwendet bei frischen nativen HTTP/1-Samples echte
Intervallraten. HTTP-Transportbytes, Abschlussbodybytes und konfigurierte Ziele
bleiben getrennt. Fehlende oder nicht unterstützte Messung bleibt `null`.
Native Quellen erlauben sekündliches Polling; Abschlussfallback bleibt fünfsekündlich.

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

## Native Umsetzung und Abnahme

Das neue statische Modul im getrennten `shieldpm-nginx` exportiert initial,
sekündlich und final monotone Request-/Upstreamversuchszähler über Loopback-UDP.
Worker-Generation und Request-ID verhindern Wiederverwendung nach Reload.
Die Basis ist Nginx 1.31.6 mit gepinnten Repository-Patches. Opt-in benötigt beide
Umgebungsflags und ein Modul-fähiges Binary. Kein automatisches Deployment.

Der reale App-Test `scripts/benchmarks/traffic-flow-native-measurement.mjs`
bestand mit laufendem 1-MiB-Download (106.368 Bodybytes bereits empfangen,
65.470,52947052947 B/s gemessen) und laufendem 256-KiB-Upload (131.072 Bodybytes
versendet, Client-/Upstreamrate 65.536 B/s). Zählerintervallformel und /24-Maskierung
wurden unabhängig geprüft. Die Mengen sind timingabhängig. Native Laufzeittests
belegen außerdem HTTPS-Klartextzählung, Keepalive-Reset, Retries, Abbruchcleanup,
Reload-Generationen, HTTP/2-Multiplexing über zwei Hosts und bidirektionale offene WebSockets.

Gemessen werden HTTP-Bytes an Nginx-Transportabrechnungspunkten einschließlich
Headern; TLS zählt akzeptierten Klartext, keine Wire-Bytes oder Zustellbestätigung.
HTTP/1-Proxyverkehr, HTTP/2-Streams und WebSockets sind abgenommen. HTTP/2-Sendebytes
enthalten Streamframeheader; Empfang nutzt Requestabrechnung ohne Verteilung
verbindungsweiter Frames. WebSockets enthalten Handshake und tatsächlich gelesene/
geschriebene Framebytes. HTTP/3 benötigt die nachfolgende eigene Streamqualität; andere Upstream-Protokolle bleiben unbekannt.
Die feste logarithmische Skala nutzt EMA 0,35; exakte Tooltips bleiben ungeglättet.
Unbekannte Gruppenanteile, Resets, fehlende Baselines und Stale-Samples werden
nicht durch erfundene Summen oder Nullen ersetzt.

## HTTP/3: bestätigte Streambytes statt Queue- oder Wire-Bytes

HTTP/3 exportiert eindeutige bestätigte QUIC-Streambytes für Downloads und
konsumierte entschlüsselte Streambytes für Uploads einschließlich HTTP/3-Framing.
Beide Qualitätsmarker sind Pflicht; queued Bytes werden ausgeschlossen.
`final_complete: false` nach Reset/Disconnect ergibt unbekannte finale Raten.
Der lebenszyklussichere Streambeobachter behält kopierte Metadaten über das Ende
des Requestpools hinaus bis zur Streamschließung. ACKs nach Poolcleanup sind geprüft.

Die native Suite bestand mit drei parallelen Cross-Host-Streams, gehaltenem Upload,
88 verworfenen und 519 verzögerten Datagrammen, Reset/Disconnect und 283 Churnstreams.
Die unabhängige App-Prüfung realer UDP-Daten aus dem finalen Produktionsimage
bestand: 555 Requests, 869 exakte Intervalle, 52 aktive Download- und 14 aktive
Uploadintervalle; maskierte Präfixe. Das Image bestand Modul-Gate, 694 Runtime-
Samples, 28 HTTP/2-/WebSocket-Samples und sieben HTTP/3-Fälle mit Kapazität/Reload.
Inkompatible ACK-/Accepted-Bytegruppen werden nicht addiert; expandierbare
qualitätsgleiche Komponenten behalten exakte Raten, Fenster und gemeinsame Skala.

## Folgen

Native HTTP/1-/HTTP/2-/WebSocket-Live-Raten sind technisch implementiert und mit echten laufenden
Transfers belegt. HTTP/3 ist mit eigener ACK-/Streamsemantik ebenfalls validiert; andere Upstream-Protokolle bleiben explizit unbekannt. Das Modul muss separat gebaut/veröffentlicht werden;
beide Draft-PRs sind abhängig und werden hier weder gemergt noch deployed.

## Verwandte Seiten

- [Lua-Messprüfung](../../../scripts/benchmarks/traffic-flow-live-measurement.mjs)
- [Messprüfung](../../../scripts/benchmarks/traffic-flow-measurement.mjs)
- [Analytics-Modul](../reference/module/analytics.md#experimenteller-traffic-flow)
- [Aktivierung und Rückweg](../../../docs/wiki/Analytics.md#live-traffic-flow-experimental)
